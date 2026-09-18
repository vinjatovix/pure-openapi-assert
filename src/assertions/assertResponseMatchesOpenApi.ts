import type { OpenAPIV3 } from 'openapi-types';
import {
  normalizeHeaders,
  coerceHeaderValue,
  parseJSONLossless
} from '../core/coercion.js';
import {
  DEFAULT_CONTENT_TYPE,
  HTTP_STATUS_NO_CONTENT
} from '../core/constants.js';
import { isJson, isTextContentType, isReferenceObject } from '../core/utils.js';
import { ValidationContext } from '../core/ValidationContext.js';
import { loadSpec } from '../openapi/loader.js';
import { getResponseSchema } from '../openapi/router.js';
import { validateShape } from '../validators/index.js';

export interface FetchLikeResponse {
  status: number;
  headers?:
    | {
        get(name: string): string | null;
        entries?: () => Iterable<[string, string]>;
      }
    | Record<string, unknown>;
  json(): Promise<unknown>;
  text(): Promise<string>;
  bodyUsed?: boolean;
  clone?: () => FetchLikeResponse;
}

export interface NodeLikeResponse {
  status?: number;
  statusCode?: number;
  headers?: Record<string, unknown>;
  body?: unknown;
  data?: unknown;
  text?: string;
}

export type PolymorphicResponse = FetchLikeResponse | NodeLikeResponse;

export type OpenAPIValidatorInput = (
  | {
      status: number;
      body: unknown;
      headers?: Record<string, string | string[]>;
      contentType?: string;
      response?: never;
      res?: never;
    }
  | {
      status?: number;
      body?: unknown;
      headers?: Record<string, string | string[]>;
      contentType?: string;
      response: PolymorphicResponse;
      res?: never;
    }
  | {
      status?: number;
      body?: unknown;
      headers?: Record<string, string | string[]>;
      contentType?: string;
      response?: never;
      res: PolymorphicResponse;
    }
) & {
  specPath: string;
  path: string;
  method: string;
  customFormats?: Record<string, (val: string) => boolean> | undefined;
};

interface ExtractedResponse {
  status: number;
  headers: Record<string, string | string[]>;
  contentType: string | undefined;
  body: unknown;
  bodyParseError: string | undefined;
}

interface HasGet {
  get(name: string): unknown;
}
interface HasEntries {
  entries(): Iterable<[string, string]>;
}
interface HasClone {
  clone(): unknown;
}
interface HasJsonText {
  json(): Promise<unknown>;
  text(): Promise<string>;
}

function hasProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return typeof obj === 'object' && obj !== null && key in obj;
}

function hasGet(obj: unknown): obj is HasGet {
  return hasProperty(obj, 'get') && typeof obj.get === 'function';
}

function hasEntries(obj: unknown): obj is HasEntries {
  return hasProperty(obj, 'entries') && typeof obj.entries === 'function';
}

function hasClone(obj: unknown): obj is HasClone {
  return hasProperty(obj, 'clone') && typeof obj.clone === 'function';
}

function hasJsonText(obj: unknown): obj is HasJsonText {
  return (
    hasProperty(obj, 'json') &&
    typeof obj.json === 'function' &&
    hasProperty(obj, 'text') &&
    typeof obj.text === 'function'
  );
}

function extractStatus(res: unknown): number | undefined {
  if (hasProperty(res, 'status') && typeof res.status === 'number') {
    return res.status;
  }
  if (hasProperty(res, 'statusCode') && typeof res.statusCode === 'number') {
    return res.statusCode;
  }
  return undefined;
}

function stringifyHeaderValue(val: unknown): string {
  if (typeof val === 'object' && val !== null) {
    return JSON.stringify(val);
  }
  if (typeof val === 'symbol') {
    return val.toString();
  }
  return String(val);
}

function extractHeadersFromEntries(
  rawHeaders: HasEntries
): Record<string, string | string[]> | undefined {
  try {
    const headers: Record<string, string | string[]> = {};
    for (const [key, val] of rawHeaders.entries()) {
      headers[key] = val;
    }
    return headers;
  } catch {
    return undefined;
  }
}

function extractHeadersFromObject(
  rawHeaders: Record<string, unknown>
): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {};
  for (const [key, val] of Object.entries(rawHeaders)) {
    if (val !== undefined && val !== null && typeof val !== 'function') {
      headers[key] = Array.isArray(val)
        ? val.map(stringifyHeaderValue)
        : stringifyHeaderValue(val);
    }
  }
  return headers;
}

function extractHeaders(res: unknown): Record<string, string | string[]> {
  if (
    !hasProperty(res, 'headers') ||
    !res.headers ||
    typeof res.headers !== 'object'
  ) {
    return {};
  }
  const rawHeaders = res.headers;

  if (hasEntries(rawHeaders)) {
    const entriesHeaders = extractHeadersFromEntries(rawHeaders);
    if (entriesHeaders) {
      return entriesHeaders;
    }
  }

  const headers = extractHeadersFromObject(
    rawHeaders as Record<string, unknown>
  );

  if (hasGet(rawHeaders)) {
    const contentTypeVal = rawHeaders.get('content-type');
    if (typeof contentTypeVal === 'string') {
      headers['content-type'] = contentTypeVal;
    }
  }

  return headers;
}

interface FetchBodyResult {
  body: unknown;
  bodyParseError: string | undefined;
}

async function extractFetchBody(
  res: unknown,
  contentType: string | undefined
): Promise<FetchBodyResult> {
  if (!hasJsonText(res)) {
    return { body: undefined, bodyParseError: undefined };
  }

  const activeRes = hasClone(res) ? (res.clone() as HasJsonText) : res;

  if (contentType && isJson(contentType)) {
    try {
      return { body: await activeRes.json(), bodyParseError: undefined };
    } catch (err: unknown) {
      return {
        body: undefined,
        bodyParseError: err instanceof Error ? err.message : String(err)
      };
    }
  }

  try {
    return { body: await activeRes.text(), bodyParseError: undefined };
  } catch (err: unknown) {
    return {
      body: undefined,
      bodyParseError: err instanceof Error ? err.message : String(err)
    };
  }
}

function extractNodeBody(res: unknown): unknown {
  if (hasProperty(res, 'body')) {
    return res.body;
  }
  if (hasProperty(res, 'data')) {
    return res.data;
  }
  if (hasProperty(res, 'text')) {
    return res.text;
  }
  return undefined;
}

function tryParseNodeBody(
  body: unknown,
  resolvedContentType: string | undefined
): unknown {
  if (
    resolvedContentType &&
    isJson(resolvedContentType) &&
    typeof body === 'string'
  ) {
    try {
      return parseJSONLossless(body);
    } catch {
      // Keep original text if parsing fails
    }
  }
  return body;
}

function extractContentType(
  headers: Record<string, string | string[]>
): string | undefined {
  const contentTypeHeader = headers['content-type'] || headers['Content-Type'];
  return Array.isArray(contentTypeHeader)
    ? contentTypeHeader[0]
    : contentTypeHeader;
}

async function extractResponseFields(
  responseObj: unknown
): Promise<ExtractedResponse> {
  if (!responseObj || typeof responseObj !== 'object') {
    throw new Error(
      'Invalid response object: response must be a non-null object'
    );
  }

  const status = extractStatus(responseObj);
  if (status === undefined) {
    throw new Error(
      'Response object must contain a status or statusCode property'
    );
  }

  const headers = extractHeaders(responseObj);
  const contentType = extractContentType(headers);

  const normHeaders = normalizeHeaders(headers);
  const resolvedContentType =
    contentType || (normHeaders['content-type'] as string | undefined);

  if (hasJsonText(responseObj)) {
    const { body, bodyParseError } = await extractFetchBody(
      responseObj,
      resolvedContentType
    );
    return { status, headers, contentType, body, bodyParseError };
  }

  const rawBody = extractNodeBody(responseObj);
  const body = tryParseNodeBody(rawBody, resolvedContentType);

  return {
    status,
    headers,
    contentType,
    body,
    bodyParseError: undefined
  };
}

function isResponseBodyEmpty(body: unknown): boolean {
  if (body === undefined || body === null) {
    return true;
  }
  if (Array.isArray(body)) {
    return false;
  }
  if (typeof body === 'object') {
    return Object.keys(body).length === 0;
  }
  return false;
}

function printWarnings(ctx: ValidationContext): void {
  if (ctx.warnings.length === 0) return;

  const YELLOW = '\x1b[33m';
  const RESET = '\x1b[0m';
  const PREFIX = `${YELLOW}[OpenAPI-Assert] ⚠️  Warning:${RESET}`;

  ctx.warnings.forEach((w) => {
    const pathStr = w.path ? ` [${w.path}]` : '';
    console.warn(`${PREFIX}${pathStr} ${w.message}`);
  });
}

function validateNonJsonBody(args: {
  actualContentType: string;
  body: unknown;
  ctx: ValidationContext;
}): void {
  const { actualContentType, body, ctx } = args;
  if (isTextContentType(actualContentType)) {
    if (typeof body !== 'string') {
      ctx.addError(
        `Expected body to be a string for Content-Type '${actualContentType}', received ${typeof body}`
      );
    }
  } else {
    if (!Buffer.isBuffer(body)) {
      ctx.addError(
        `Expected body to be a Buffer for binary Content-Type '${actualContentType}', received ${typeof body}`
      );
    }
  }
}

interface ValidateResponseBodyArgs {
  status: number;
  actualContentType: string | undefined;
  body: unknown;
  schema: OpenAPIV3.SchemaObject | null;
  ctx: ValidationContext;
  customFormats: Record<string, (val: string) => boolean> | undefined;
  method: string;
  reqPath: string;
  hasContentMap: boolean;
}

function validateResponseBody(args: ValidateResponseBodyArgs): void {
  const {
    status,
    actualContentType,
    body,
    schema,
    ctx,
    customFormats,
    method,
    reqPath,
    hasContentMap
  } = args;

  if (status === HTTP_STATUS_NO_CONTENT) {
    if (!isResponseBodyEmpty(body)) {
      ctx.addError(`${HTTP_STATUS_NO_CONTENT} must have empty body`);
    }
  } else if (actualContentType && !isJson(actualContentType)) {
    validateNonJsonBody({ actualContentType, body, ctx });
  } else {
    if (!schema) {
      if (hasContentMap || !isResponseBodyEmpty(body)) {
        ctx.addError(`No schema found for ${method} ${reqPath} ${status}`);
      }
    } else {
      ctx.pushPath('body');
      validateShape({ value: body, schema, ctx, validateShape, customFormats });
      ctx.popPath();
    }
  }
}

interface ResolveContentHeaderArgs {
  headerName: string;
  contentSpec: Record<string, OpenAPIV3.MediaTypeObject>;
  actualValue: unknown;
  ctx: ValidationContext;
  customFormats?: Record<string, (val: string) => boolean> | undefined;
}

function tryParseHeaderJSON(
  actualValue: unknown,
  headerName: string,
  ctx: ValidationContext
): { success: true; value: unknown } | { success: false } {
  const rawString = Array.isArray(actualValue)
    ? (actualValue as unknown[])[0]
    : actualValue;
  if (typeof rawString !== 'string') {
    return { success: true, value: actualValue };
  }
  try {
    return { success: true, value: parseJSONLossless(rawString) };
  } catch (err) {
    ctx.pushPath(`headers.${headerName}`);
    const message = err instanceof Error ? err.message : String(err);
    ctx.addError(`Failed to parse JSON from header value: ${message}`);
    ctx.popPath();
    return { success: false };
  }
}

function resolveContentHeader(
  args: ResolveContentHeaderArgs
): { targetSchema?: OpenAPIV3.SchemaObject; valToValidate?: unknown } | null {
  const { headerName, contentSpec, actualValue, ctx, customFormats } = args;
  const firstMediaType = Object.keys(contentSpec)[0];
  if (!firstMediaType) {
    return {};
  }
  const mediaTypeObject = contentSpec[firstMediaType];
  if (!mediaTypeObject || !mediaTypeObject.schema) {
    return {};
  }
  const { schema } = mediaTypeObject;

  if (isReferenceObject(schema)) {
    ctx.addError(
      `Schema for header '${headerName}' contains an unresolved $ref. Ensure your OpenAPI spec is fully dereferenced.`
    );
    return null;
  }

  let valToValidate: unknown = actualValue;
  if (isJson(firstMediaType)) {
    const parseResult = tryParseHeaderJSON(actualValue, headerName, ctx);
    if (!parseResult.success) {
      return null;
    }
    valToValidate = parseResult.value;
  }

  valToValidate = coerceHeaderValue({
    value: valToValidate,
    schema,
    customFormats,
    ctx
  });

  return {
    targetSchema: schema,
    valToValidate
  };
}

interface ResolveHeaderSchemaAndValueArgs {
  headerName: string;
  headerSpec: OpenAPIV3.HeaderObject;
  actualValue: unknown;
  ctx: ValidationContext;
  customFormats?: Record<string, (val: string) => boolean> | undefined;
}

function resolveHeaderSchemaAndValue(
  args: ResolveHeaderSchemaAndValueArgs
): { targetSchema?: OpenAPIV3.SchemaObject; valToValidate?: unknown } | null {
  const { headerName, headerSpec, actualValue, ctx, customFormats } = args;

  if (headerSpec.schema) {
    if (isReferenceObject(headerSpec.schema)) {
      ctx.addError(
        `Schema for header '${headerName}' contains an unresolved $ref. Ensure your OpenAPI spec is fully dereferenced.`
      );
      return null;
    }
    return {
      targetSchema: headerSpec.schema,
      valToValidate: coerceHeaderValue({
        value: actualValue,
        schema: headerSpec.schema,
        customFormats,
        ctx
      })
    };
  }

  if (headerSpec.content) {
    return resolveContentHeader({
      headerName,
      contentSpec: headerSpec.content,
      actualValue,
      ctx,
      customFormats
    });
  }

  return {};
}

interface ValidateResponseHeadersArgs {
  normalizedActualHeaders: Record<string, string | string[]>;
  declaredHeaders:
    | Record<string, OpenAPIV3.HeaderObject | OpenAPIV3.ReferenceObject>
    | undefined;
  ctx: ValidationContext;
  customFormats: Record<string, (val: string) => boolean> | undefined;
}

function validateResponseHeaders(args: ValidateResponseHeadersArgs): void {
  const { normalizedActualHeaders, declaredHeaders, ctx, customFormats } = args;
  if (!declaredHeaders) return;

  for (const [headerName, headerSpec] of Object.entries(declaredHeaders)) {
    if (isReferenceObject(headerSpec)) {
      ctx.addError(
        `Header '${headerName}' contains an unresolved $ref. Ensure your OpenAPI spec is fully dereferenced.`
      );
      continue;
    }

    const lowerHeaderName = headerName.toLowerCase();
    const actualValue = normalizedActualHeaders[lowerHeaderName];

    if (headerSpec.required && actualValue === undefined) {
      ctx.addError(`Missing required header: ${headerName}`);
      continue;
    }

    if (actualValue !== undefined) {
      const resolved = resolveHeaderSchemaAndValue({
        headerName,
        headerSpec,
        actualValue,
        ctx,
        customFormats
      });

      if (resolved && resolved.targetSchema) {
        ctx.pushPath(`headers.${headerName}`);
        validateShape({
          value: resolved.valToValidate,
          schema: resolved.targetSchema,
          ctx,
          validateShape,
          customFormats
        });
        ctx.popPath();
      }
    }
  }
}

interface GetActualContentTypeArgs {
  contentType: string | undefined;
  normalizedHeaders: Record<string, string | string[]>;
  status: number;
  body: unknown;
}

function getActualContentType(
  args: GetActualContentTypeArgs
): string | undefined {
  const { contentType, normalizedHeaders, status, body } = args;
  if (contentType) {
    return contentType;
  }
  if (status === HTTP_STATUS_NO_CONTENT) {
    return undefined;
  }
  const contentTypeHeader = normalizedHeaders['content-type'];
  const rawContentType = Array.isArray(contentTypeHeader)
    ? contentTypeHeader[0]
    : contentTypeHeader;
  if (rawContentType) {
    return String(rawContentType).split(';')[0]?.trim();
  }
  if (isResponseBodyEmpty(body)) {
    return undefined;
  }
  return DEFAULT_CONTENT_TYPE;
}

interface HandleValidationErrorsArgs {
  ctx: ValidationContext;
  method: string;
  reqPath: string;
  status: number;
}

function handleValidationErrors(args: HandleValidationErrorsArgs): void {
  const { ctx, method, reqPath, status } = args;
  if (ctx.hasErrors()) {
    const formattedErrors = ctx.errors.map(
      (err) => `[${err.path || 'root'}] ${err.message}`
    );
    throw new Error(
      `OpenAPI contract violation for ${method} ${reqPath} ${status}.\nValidation errors:\n- ${formattedErrors.join('\n- ')}`
    );
  }
}

interface ValidateNoContentFastPathArgs {
  status: number;
  body: unknown;
  method: string;
  reqPath: string;
}

function validateNoContentFastPath(args: ValidateNoContentFastPathArgs): void {
  const { status, body, method, reqPath } = args;
  if (status === HTTP_STATUS_NO_CONTENT && !isResponseBodyEmpty(body)) {
    const ctx = new ValidationContext();
    ctx.addError(`${HTTP_STATUS_NO_CONTENT} must have empty body`);
    handleValidationErrors({ ctx, method, reqPath, status });
  }
}

function checkHasContentMap(responseObj: unknown): boolean {
  return !!(
    responseObj &&
    typeof responseObj === 'object' &&
    'content' in responseObj &&
    responseObj.content
  );
}

interface ExtractedConfig {
  status: number;
  body: unknown;
  headers: Record<string, string | string[]> | undefined;
  contentType: string | undefined;
  bodyParseError: string | undefined;
}

async function resolveInputsAndOverrides(
  input: OpenAPIValidatorInput
): Promise<ExtractedConfig> {
  const responseObj = input.response ?? input.res;
  if (responseObj === undefined) {
    const status = input.status;
    if (status === undefined) {
      throw new Error(
        'A status code must be provided or extracted from the response'
      );
    }
    return {
      status,
      body: input.body,
      headers: input.headers,
      contentType: input.contentType,
      bodyParseError: undefined
    };
  }

  const extracted = await extractResponseFields(responseObj);
  const status = input.status !== undefined ? input.status : extracted.status;
  const body = input.body !== undefined ? input.body : extracted.body;
  const headers =
    input.headers !== undefined ? input.headers : extracted.headers;
  const contentType =
    input.contentType !== undefined ? input.contentType : extracted.contentType;

  return {
    status,
    body,
    headers,
    contentType,
    bodyParseError: extracted.bodyParseError
  };
}

export async function assertResponseMatchesOpenApi(
  input: OpenAPIValidatorInput
): Promise<void> {
  const { specPath, path: reqPath, method, customFormats } = input;

  const { status, body, headers, contentType, bodyParseError } =
    await resolveInputsAndOverrides(input);

  if (bodyParseError) {
    const ctx = new ValidationContext();
    ctx.addError(`Malformed JSON body: ${bodyParseError}`);
    handleValidationErrors({ ctx, method, reqPath, status });
  }

  validateNoContentFastPath({ status, body, method, reqPath });

  const spec = await loadSpec(specPath);
  const normalizedHeaders = normalizeHeaders(headers);
  const actualContentType = getActualContentType({
    contentType,
    normalizedHeaders,
    status,
    body
  });

  const { schema, operation, declaredHeaders } = getResponseSchema({
    spec,
    path: reqPath,
    method,
    status,
    contentType: actualContentType
  });

  const ctx = new ValidationContext({ spec });

  if (operation.deprecated) {
    ctx.addWarning(`Endpoint '${method} ${reqPath}' is deprecated`);
  }

  const oasResponseObj =
    operation.responses?.[String(status)] || operation.responses?.default;
  const hasContentMap = checkHasContentMap(oasResponseObj);

  if (status !== HTTP_STATUS_NO_CONTENT && !bodyParseError) {
    validateResponseBody({
      status,
      actualContentType,
      body,
      schema,
      ctx,
      customFormats,
      method,
      reqPath,
      hasContentMap
    });
  }

  validateResponseHeaders({
    normalizedActualHeaders: normalizedHeaders,
    declaredHeaders,
    ctx,
    customFormats
  });

  printWarnings(ctx);

  handleValidationErrors({ ctx, method, reqPath, status });
}

export const assertResponse = assertResponseMatchesOpenApi;
