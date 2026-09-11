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

export function isSchemaObject(
  schema: unknown
): schema is OpenAPIV3.SchemaObject {
  return isPlainObject(schema) && !Object.hasOwn(schema, '$ref');
}
