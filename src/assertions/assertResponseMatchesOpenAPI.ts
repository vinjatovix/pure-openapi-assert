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

export type OpenAPIValidatorInput = {
  specPath: string;
  path: string;
  method: string;
  status: number;
  body: unknown;
  headers?: Record<string, string | string[]>;
  contentType?: string;
  customFormats?: Record<string, (val: string) => boolean> | undefined;
};

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

function resolveContentHeader(
  args: ResolveContentHeaderArgs
): { targetSchema?: OpenAPIV3.SchemaObject; valToValidate?: unknown } | null {
  const { headerName, contentSpec, actualValue, ctx, customFormats } = args;
  const mediaTypes = Object.keys(contentSpec);
  const firstMediaType = mediaTypes[0];
  const mediaTypeObject = firstMediaType
    ? contentSpec[firstMediaType]
    : undefined;

  if (!mediaTypeObject?.schema) {
    return {};
  }

  if (isReferenceObject(mediaTypeObject.schema)) {
    ctx.addError(
      `Schema for header '${headerName}' contains an unresolved $ref. Ensure your OpenAPI spec is fully dereferenced.`
    );
    return null;
  }

  let valToValidate: unknown = actualValue;
  if (firstMediaType && isJson(firstMediaType)) {
    const rawString = Array.isArray(actualValue)
      ? (actualValue as unknown[])[0]
      : actualValue;
    if (typeof rawString === 'string') {
      try {
        valToValidate = parseJSONLossless(rawString);
      } catch (err) {
        ctx.pushPath(`headers.${headerName}`);
        ctx.addError(
          `Failed to parse JSON from header value: ${(err as Error).message}`
        );
        ctx.popPath();
        return null;
      }
    }
  }

  valToValidate = coerceHeaderValue({
    value: valToValidate,
    schema: mediaTypeObject.schema,
    customFormats,
    ctx
  });

  return {
    targetSchema: mediaTypeObject.schema,
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

export async function assertResponseMatchesOpenAPI(
  input: OpenAPIValidatorInput
): Promise<void> {
  const {
    specPath,
    path: reqPath,
    method,
    status,
    body,
    contentType,
    customFormats,
    headers
  } = input;

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

  const responseObj =
    operation.responses?.[String(status)] || operation.responses?.default;
  const hasContentMap = checkHasContentMap(responseObj);

  if (status !== HTTP_STATUS_NO_CONTENT) {
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
