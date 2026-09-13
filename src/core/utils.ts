import type { OpenAPIV3 } from 'openapi-types';

export function isPlainObject(val: unknown): val is Record<string, unknown> {
  if (Object.prototype.toString.call(val) !== '[object Object]') {
    return false;
  }
  const prototype = Object.getPrototypeOf(val) as unknown;
  return prototype === null || prototype === Object.prototype;
}

export function isPrimitive(val: unknown): val is string | number | boolean {
  return (
    typeof val === 'string' ||
    typeof val === 'number' ||
    typeof val === 'boolean'
  );
}

export function isReferenceObject(
  obj: unknown
): obj is OpenAPIV3.ReferenceObject {
  return isPlainObject(obj) && Object.hasOwn(obj, '$ref');
}

export function isSchemaObject(
  schema: unknown
): schema is OpenAPIV3.SchemaObject {
  return isPlainObject(schema) && !isReferenceObject(schema);
}

export function isArraySchema(
  schema: OpenAPIV3.SchemaObject
): schema is OpenAPIV3.ArraySchemaObject {
  return schema.type === 'array';
}

export function normalizeMediaType(mime: string): string {
  return (mime.split(';')[0] || '').trim().toLowerCase();
}

export function isJson(type: string): boolean {
  const normalized = normalizeMediaType(type);
  return (
    normalized === 'application/json' ||
    (normalized.startsWith('application/') &&
      (normalized.endsWith('/json') || normalized.endsWith('+json')))
  );
}

export function isTextContentType(mime: string): boolean {
  const normalized = normalizeMediaType(mime);
  return (
    normalized.startsWith('text/') ||
    normalized === 'application/xml' ||
    normalized === 'application/xhtml+xml' ||
    normalized.endsWith('+xml') ||
    normalized === 'application/csv'
  );
}
