import type { OpenAPIV3 } from 'openapi-types';
import {
  DEFAULT_CONTENT_TYPE,
  HTTP_STATUS_NO_CONTENT
} from '../core/constants.js';
import {
  isJson,
  isTextContentType,
  isReferenceObject,
  isArraySchema
} from '../core/utils.js';
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

function validateResponseBody(args: {
  status: number;
  actualContentType: string | undefined;
  body: unknown;
  schema: OpenAPIV3.SchemaObject | null;
  ctx: ValidationContext;
  customFormats: Record<string, (val: string) => boolean> | undefined;
  method: string;
  reqPath: string;
}): void {
  const {
    status,
    actualContentType,
    body,
    schema,
    ctx,
    customFormats,
    method,
    reqPath
  } = args;

  if (status === HTTP_STATUS_NO_CONTENT) {
    if (!isResponseBodyEmpty(body)) {
      ctx.addError(`${HTTP_STATUS_NO_CONTENT} must have empty body`);
    }
  } else if (actualContentType && !isJson(actualContentType)) {
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
  } else {
    if (!schema) {
      ctx.addError(`No schema found for ${method} ${reqPath} ${status}`);
    } else {
      ctx.pushPath('body');
      validateShape({ value: body, schema, ctx, validateShape, customFormats });
      ctx.popPath();
    }
  }
}

function normalizeHeaders(
  headers: Record<string, string | string[]> | undefined
): Record<string, string | string[]> {
  if (!headers) {
    return Object.create(null) as Record<string, string | string[]>;
  }
  const result = Object.create(null) as Record<string, string | string[]>;
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    const existing = result[lowerKey];
    if (existing !== undefined) {
      result[lowerKey] = Array.isArray(existing)
        ? existing.concat(value)
        : Array.isArray(value)
          ? [existing, ...value]
          : [existing, value];
    } else {
      result[lowerKey] = value;
    }
  }
  return result;
}

function coerceNumber(value: unknown, schema: OpenAPIV3.SchemaObject): unknown {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value !== 'string') {
    return value;
  }
  if (schema.format === 'int64') {
    return value;
  }
  const num = Number(value);
  return Number.isNaN(num) || value.trim() === '' ? value : num;
}

function coerceBoolean(value: unknown): unknown {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return value;
  }
  const lower = value.toLowerCase().trim();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  return value;
}

function coerceArray(value: unknown, schema: OpenAPIV3.SchemaObject): unknown {
  if (!isArraySchema(schema)) return value;

  const itemSchema = schema.items;
  const safeItemSchema =
    itemSchema && !isReferenceObject(itemSchema) ? itemSchema : undefined;

  if (Array.isArray(value)) {
    return value.map((v) => coerceHeaderValue(v, safeItemSchema));
  }
  if (typeof value !== 'string') {
    return value;
  }

  // TODO: Does not support complex CSV escaping or RFC 7230 quoted strings for arrays
  const parts = value.split(',').map((s) => s.trim());
  return parts.map((v) => coerceHeaderValue(v, safeItemSchema));
}

function coerceSingleValue(
  value: unknown,
  schema: OpenAPIV3.SchemaObject
): unknown {
  switch (schema.type) {
    case 'integer':
    case 'number':
      return coerceNumber(value, schema);
    case 'boolean':
      return coerceBoolean(value);
    case 'array':
      return coerceArray(value, schema);
    default:
      return value;
  }
}

function coerceHeaderValue(
  value: unknown,
  schema: OpenAPIV3.SchemaObject | undefined
): unknown {
  const schemaType = schema?.type;
  if (!schemaType) {
    return value;
  }

  if (Array.isArray(value)) {
    if (isArraySchema(schema)) {
      const itemSchema = schema.items;
      const safeItemSchema =
        itemSchema && !isReferenceObject(itemSchema) ? itemSchema : undefined;
      return value.map((v) => coerceHeaderValue(v, safeItemSchema));
    }
    return value;
  }

  return coerceSingleValue(value, schema);
}

function resolveContentHeader(args: {
  headerName: string;
  contentSpec: Record<string, OpenAPIV3.MediaTypeObject>;
  actualValue: unknown;
  ctx: ValidationContext;
}): { targetSchema?: OpenAPIV3.SchemaObject; valToValidate?: unknown } | null {
  const { headerName, contentSpec, actualValue, ctx } = args;
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
        valToValidate = JSON.parse(rawString) as unknown;
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

  return {
    targetSchema: mediaTypeObject.schema,
    valToValidate
  };
}

function resolveHeaderSchemaAndValue(args: {
  headerName: string;
  headerSpec: OpenAPIV3.HeaderObject;
  actualValue: unknown;
  ctx: ValidationContext;
}): { targetSchema?: OpenAPIV3.SchemaObject; valToValidate?: unknown } | null {
  const { headerName, headerSpec, actualValue, ctx } = args;

  if (headerSpec.schema) {
    if (isReferenceObject(headerSpec.schema)) {
      ctx.addError(
        `Schema for header '${headerName}' contains an unresolved $ref. Ensure your OpenAPI spec is fully dereferenced.`
      );
      return null;
    }
    return {
      targetSchema: headerSpec.schema,
      valToValidate: coerceHeaderValue(actualValue, headerSpec.schema)
    };
  }

  if (headerSpec.content) {
    return resolveContentHeader({
      headerName,
      contentSpec: headerSpec.content,
      actualValue,
      ctx
    });
  }

  return {};
}

function validateResponseHeaders(args: {
  normalizedActualHeaders: Record<string, string | string[]>;
  declaredHeaders:
    | Record<string, OpenAPIV3.HeaderObject | OpenAPIV3.ReferenceObject>
    | undefined;
  ctx: ValidationContext;
  customFormats: Record<string, (val: string) => boolean> | undefined;
}): void {
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
        ctx
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

function getActualContentType(args: {
  contentType: string | undefined;
  normalizedHeaders: Record<string, string | string[]>;
  status: number;
}): string | undefined {
  const { contentType, normalizedHeaders, status } = args;
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
  return DEFAULT_CONTENT_TYPE;
}

function handleValidationErrors(args: {
  ctx: ValidationContext;
  method: string;
  reqPath: string;
  status: number;
}): void {
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

  if (status === HTTP_STATUS_NO_CONTENT && !isResponseBodyEmpty(body)) {
    const ctx = new ValidationContext();
    ctx.addError(`${HTTP_STATUS_NO_CONTENT} must have empty body`);
    handleValidationErrors({ ctx, method, reqPath, status });
  }

  const spec = await loadSpec(specPath);
  const normalizedHeaders = normalizeHeaders(headers);
  const actualContentType = getActualContentType({
    contentType,
    normalizedHeaders,
    status
  });

  const { schema, operation, declaredHeaders } = getResponseSchema({
    spec,
    path: reqPath,
    method,
    status,
    contentType: actualContentType
  });

  const ctx = new ValidationContext(spec);

  if (operation.deprecated) {
    ctx.addWarning(`Endpoint '${method} ${reqPath}' is deprecated`);
  }

  if (status !== HTTP_STATUS_NO_CONTENT) {
    validateResponseBody({
      status,
      actualContentType,
      body,
      schema,
      ctx,
      customFormats,
      method,
      reqPath
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
