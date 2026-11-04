import type { OpenAPIV3 } from 'openapi-types';
import { parseJSONLossless } from '../core/coercion.js';
import { DEFAULT_CONTENT_TYPE, DUMMY_BASE_URL } from '../core/constants.js';
import { isJson, isPlainObject } from '../core/utils.js';
import { ValidationContext } from '../core/ValidationContext.js';
import { loadSpec } from '../openapi/loader.js';
import {
  getRequestContract,
  type OperationRequestContract
} from '../openapi/router.js';
import { validateShape } from '../validators/index.js';
import { validateParameters } from '../validators/parameters.js';

export interface FetchLikeRequest {
  url: string;
  method?: string;
  headers?: Headers | Record<string, string | string[]>;
  bodyUsed?: boolean;
  clone?: () => FetchLikeRequest;
  text?: () => Promise<string>;
  json?: () => Promise<unknown>;
}

export interface NodeLikeRequest {
  url?: string;
  method?: string;
  headers?: Record<string, string | string[]>;
  body?: unknown;
}

export type PolymorphicRequest = FetchLikeRequest | NodeLikeRequest | Request;

export interface OpenAPIRequestValidatorInputBase {
  specPath: string;
  path?: string;
  url?: string;
  method?: string;
  body?: unknown;
  query?: Record<string, unknown> | URLSearchParams | string | undefined;
  pathParams?: Record<string, string> | undefined;
  headers?: Record<string, string | string[]> | undefined;
  contentType?: string | undefined;
  strictParameters?: boolean | undefined;
  customFormats?: Record<string, (val: string) => boolean> | undefined;
}

export type OpenAPIRequestValidatorInput =
  | (OpenAPIRequestValidatorInputBase & {
      request?: never;
      req?: never;
    })
  | (OpenAPIRequestValidatorInputBase & {
      request: PolymorphicRequest;
      req?: never;
    })
  | (OpenAPIRequestValidatorInputBase & {
      request?: never;
      req: PolymorphicRequest;
    });

interface NormalizedRequestInput {
  specPath: string;
  path: string;
  method: string;
  body?: unknown;
  query: Record<string, unknown>;
  pathParams?: Record<string, string> | undefined;
  headers?: Record<string, string | string[]> | undefined;
  contentType?: string | undefined;
  strictParameters?: boolean | undefined;
  customFormats?: Record<string, (val: string) => boolean> | undefined;
}

interface ExtractedRequestData {
  url?: string;
  method?: string;
  headers?: Record<string, string | string[]>;
  body?: unknown;
}

function isIterableHeaders(
  headers: unknown
): headers is { entries(): Iterable<[string, string]> } {
  if (typeof headers !== 'object' || headers === null || !('entries' in headers)) {
    return false;
  }
  return typeof headers.entries === 'function';
}

function extractRequestHeaders(
  headers: Headers | Record<string, string | string[]> | undefined
): Record<string, string | string[]> | undefined {
  if (!headers) {
    return undefined;
  }
  if (isIterableHeaders(headers)) {
    const extracted: Record<string, string | string[]> = {};
    for (const [key, val] of headers.entries()) {
      const existing = extracted[key];
      if (existing !== undefined) {
        extracted[key] = Array.isArray(existing)
          ? [...existing, val]
          : [existing, val];
      } else {
        extracted[key] = val;
      }
    }
    return extracted;
  }
  if (isPlainObject(headers)) {
    return headers;
  }
  return undefined;
}

async function extractRequestBody(
  req: PolymorphicRequest
): Promise<unknown> {
  if ('clone' in req && typeof req.clone === 'function') {
    const cloned = req.clone();
    if (typeof cloned.text === 'function') {
      const text = await cloned.text();
      return text.trim() !== '' ? text : undefined;
    }
    return undefined;
  }
  if ('body' in req && req.body !== undefined) {
    return req.body;
  }
  return undefined;
}

async function extractFromPolymorphicRequest(
  req: PolymorphicRequest
): Promise<ExtractedRequestData> {
  const result: ExtractedRequestData = {};

  if ('url' in req && typeof req.url === 'string') {
    result.url = req.url;
  }
  if ('method' in req && typeof req.method === 'string') {
    result.method = req.method;
  }

  const headers = extractRequestHeaders(req.headers);
  if (headers) {
    result.headers = headers;
  }

  const body = await extractRequestBody(req);
  if (body !== undefined) {
    result.body = body;
  }

  return result;
}

function extractSearchParams(
  searchParams: URLSearchParams
): Record<string, unknown> {
  const query: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;
  for (const [key, val] of searchParams.entries()) {
    if (query[key] !== undefined) {
      if (Array.isArray(query[key])) {
        (query[key] as unknown[]).push(val);
      } else {
        query[key] = [query[key], val];
      }
    } else {
      query[key] = val;
    }
  }
  return query;
}

function normalizeExplicitQuery(
  query: Record<string, unknown> | URLSearchParams | string | undefined
): Record<string, unknown> {
  if (!query) {
    return {};
  }
  if (typeof query === 'string') {
    const stripped = query.startsWith('?') ? query.slice(1) : query;
    return extractSearchParams(new URLSearchParams(stripped));
  }
  if (query instanceof URLSearchParams) {
    return extractSearchParams(query);
  }
  if (isPlainObject(query)) {
    return query;
  }
  return {};
}

function extractContentTypeFromHeaders(
  headers: Record<string, string | string[]> | undefined
): string | undefined {
  if (!headers) return undefined;
  const found = Object.keys(headers).find(
    (h) => h.toLowerCase() === 'content-type'
  );
  if (!found) return undefined;
  const val = headers[found];
  return typeof val === 'string' ? val : undefined;
}

function resolveRequestPathAndQuery(
  input: OpenAPIRequestValidatorInput,
  extractedUrl?: string
): { reqPath: string; query: Record<string, unknown> } {
  const target = input.url ?? input.path ?? extractedUrl;
  if (!target) {
    throw new Error(
      'Either path, url, or request must be provided to assertRequestMatchesOpenApi'
    );
  }

  const urlObj = new URL(target, DUMMY_BASE_URL);
  const reqPath = urlObj.pathname || '/';
  const urlQuery = extractSearchParams(urlObj.searchParams);
  const explicitQuery = normalizeExplicitQuery(input.query);

  return {
    reqPath,
    query: {
      ...urlQuery,
      ...explicitQuery
    }
  };
}

async function normalizeRequestInput(
  input: OpenAPIRequestValidatorInput
): Promise<NormalizedRequestInput> {
  const polyReq = input.request ?? input.req;
  const extracted = polyReq
    ? await extractFromPolymorphicRequest(polyReq)
    : {};

  const { reqPath, query } = resolveRequestPathAndQuery(input, extracted.url);

  const headers =
    extracted.headers || input.headers
      ? {
          ...extracted.headers,
          ...input.headers
        }
      : undefined;

  const body = input.body !== undefined ? input.body : extracted.body;
  const contentType =
    input.contentType ?? extractContentTypeFromHeaders(headers);

  return {
    specPath: input.specPath,
    path: reqPath,
    method: input.method ?? extracted.method ?? 'GET',
    body,
    query,
    pathParams: input.pathParams,
    headers,
    contentType,
    strictParameters: input.strictParameters,
    customFormats: input.customFormats
  };
}

const BODY_PARSE_FAILED = Symbol('BODY_PARSE_FAILED');

function parseBody(
  body: unknown,
  contentType: string,
  ctx: ValidationContext
): unknown {
  if (typeof body === 'string' && isJson(contentType)) {
    try {
      return parseJSONLossless(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.pushPath('body');
      ctx.addError(`Malformed JSON body: ${message}`);
      ctx.popPath();
      return BODY_PARSE_FAILED;
    }
  }
  return body;
}

interface ValidateRequestBodyArgs {
  body: unknown;
  contract: OperationRequestContract;
  contentType: string;
  ctx: ValidationContext;
  customFormats: Record<string, (val: string) => boolean> | undefined;
}

function validateRequestBody(args: ValidateRequestBodyArgs): void {
  const { body, contract, contentType, ctx, customFormats } = args;

  if (body === undefined) {
    if (contract.bodyRequired) {
      ctx.pushPath('body');
      ctx.addError('request body is required');
      ctx.popPath();
    }
    return;
  }

  if (!contract.bodySchema) {
    return;
  }

  const parsed = parseBody(body, contentType, ctx);
  if (parsed === BODY_PARSE_FAILED) {
    return;
  }

  const schema: OpenAPIV3.SchemaObject = contract.bodySchema;
  ctx.pushPath('body');
  validateShape({ value: parsed, schema, ctx, validateShape, customFormats });
  ctx.popPath();
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

function handleRequestValidationErrors(args: {
  ctx: ValidationContext;
  method: string;
  reqPath: string;
}): void {
  const { ctx, method, reqPath } = args;
  if (ctx.hasErrors()) {
    const formattedErrors = ctx.errors.map(
      (err) => `[${err.path || 'root'}] ${err.message}`
    );
    throw new Error(
      `OpenAPI contract violation for ${method} ${reqPath}.\nValidation errors:\n- ${formattedErrors.join('\n- ')}`
    );
  }
}

export async function assertRequestMatchesOpenApi(
  input: OpenAPIRequestValidatorInput
): Promise<void> {
  const normalized = await normalizeRequestInput(input);
  const { specPath, path: reqPath, method, customFormats, strictParameters } =
    normalized;
  const contentType = normalized.contentType ?? DEFAULT_CONTENT_TYPE;

  const spec = await loadSpec(specPath);
  const contract = getRequestContract({
    spec,
    path: reqPath,
    method,
    contentType
  });

  const ctx = new ValidationContext({ spec, direction: 'request' });

  if (contract.operation.deprecated) {
    ctx.addWarning(`Endpoint '${method} ${reqPath}' is deprecated`);
  }

  validateRequestBody({
    body: normalized.body,
    contract,
    contentType,
    ctx,
    customFormats
  });

  const mergedPathParams = {
    ...contract.extractedPathParams,
    ...normalized.pathParams
  };

  validateParameters({
    contract,
    input: {
      query: normalized.query,
      headers: normalized.headers,
      pathParams: mergedPathParams,
      strictParameters
    },
    ctx,
    customFormats,
    validateShape
  });

  printWarnings(ctx);

  handleRequestValidationErrors({ ctx, method, reqPath });
}

export const assertRequest = assertRequestMatchesOpenApi;
