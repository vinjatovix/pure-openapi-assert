import type { OpenAPIV3 } from 'openapi-types';
import { isPlainObject, isSchemaObject } from '../core/utils.js';
import { type ValidationArgs } from './args.js';

export function validateObjectBounds(args: ValidationArgs): void {
  const { schema, ctx, keys } = args;
  const keysCount = keys ? keys.length : 0;
  if (schema.minProperties !== undefined && keysCount < schema.minProperties) {
    ctx.addError(
      `Object has ${keysCount} properties, minimum is ${schema.minProperties}`
    );
  }
  if (schema.maxProperties !== undefined && keysCount > schema.maxProperties) {
    ctx.addError(
      `Object has ${keysCount} properties, maximum is ${schema.maxProperties}`
    );
  }
}

export function validateRequiredFields(
  args: ValidationArgs<Record<string, unknown>>
): void {
  const { value: obj, schema, ctx } = args;
  const required = schema.required;
  if (!required) return;

  for (const key of required) {
    if (obj[key] === undefined) {
      ctx.pushPath(key);
      ctx.addError('Missing required field');
      ctx.popPath();
    }
  }
}

const schemaAllowedKeysCache = new WeakMap<
  OpenAPIV3.SchemaObject,
  Set<string>
>();
const schemaPropertiesEntriesCache = new WeakMap<
  OpenAPIV3.SchemaObject,
  [string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject][]
>();

export function validateAdditionalProperties(
  args: ValidationArgs<Record<string, unknown>>
): void {
  const { value: obj, schema, ctx, keys, validateShape, customFormats } = args;
  const additionalSchema = schema.additionalProperties;
  if (additionalSchema === undefined || additionalSchema === true) return;

  const properties = schema.properties ?? {};

  let allowedKeys = schemaAllowedKeysCache.get(schema);
  if (!allowedKeys) {
    allowedKeys = new Set(Object.keys(properties));
    schemaAllowedKeysCache.set(schema, allowedKeys);
  }

  const isSchema = isSchemaObject(additionalSchema);
  const activeKeys = keys ?? Object.keys(obj);

  for (const key of activeKeys) {
    if (allowedKeys.has(key)) continue;

    if (additionalSchema === false) {
      ctx.pushPath(key);
      ctx.addError(`Key '${key}' is not allowed by OpenAPI schema`);
      ctx.popPath();
      continue;
    }

    if (isSchema) {
      ctx.pushPath(key);
      validateShape({
        value: obj[key],
        schema: additionalSchema,
        ctx,
        validateShape,
        customFormats
      });
      ctx.popPath();
    }
  }
}

export function validateDeclaredProperties(
  args: ValidationArgs<Record<string, unknown>>
): void {
  const { value: obj, schema, ctx, validateShape, customFormats } = args;
  const properties = schema.properties ?? {};

  let entries = schemaPropertiesEntriesCache.get(schema);
  if (!entries) {
    entries = Object.entries(properties);
    schemaPropertiesEntriesCache.set(schema, entries);
  }

  for (const [key, propSchema] of entries) {
    const propValue = obj[key];
    if (propValue === undefined || !isSchemaObject(propSchema)) continue;

    ctx.pushPath(key);
    validateShape({
      value: propValue,
      schema: propSchema,
      ctx,
      validateShape,
      customFormats
    });
    ctx.popPath();
  }
}

export function validateObject(args: ValidationArgs): void {
  const { value, schema, ctx } = args;
  if (!isPlainObject(value)) {
    ctx.addError(
      `Expected object, received ${value === null ? 'null' : typeof value}`
    );
    return;
  }

  const obj = value;

  if (ctx.visited.has(obj)) {
    return;
  }
  ctx.visited.add(obj);

  try {
    const keys = Object.keys(obj);
    const objectArgs: ValidationArgs<Record<string, unknown>> = {
      value: obj,
      schema,
      ctx,
      keys,
      validateShape: args.validateShape,
      customFormats: args.customFormats
    };

    validateObjectBounds(objectArgs);

    if (schema.required) {
      validateRequiredFields(objectArgs);
    }

    validateAdditionalProperties(objectArgs);
    validateDeclaredProperties(objectArgs);
  } finally {
    ctx.visited.delete(obj);
  }
}
