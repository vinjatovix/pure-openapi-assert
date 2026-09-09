import type { OpenAPIV3 } from 'openapi-types';
import { ValidationContext } from '../core/ValidationContext.js';
import { getCachedRegex, formatValidators } from './format.js';
import { validateShape } from './index.js';

export function isSchemaObject(
  schema: unknown
): schema is OpenAPIV3.SchemaObject {
  return typeof schema === 'object' && schema !== null && !('$ref' in schema);
}

export const typeValidators: Record<string, (value: unknown) => boolean> = {
  string: (val) => typeof val === 'string',
  number: (val) => typeof val === 'number' && Number.isFinite(val),
  integer: (val) => Number.isInteger(val),
  boolean: (val) => typeof val === 'boolean'
};

export function validateBaseType(
  value: unknown,
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
  if (schema.enum) {
    if (!schema.enum.includes(value)) {
      ctx.addError(
        `Expected one of [${schema.enum.join(', ')}], received ${JSON.stringify(value)}`
      );
    }
  }

  const expectedType = schema.type;
  if (expectedType) {
    const isTypeValid = typeValidators[expectedType];
    if (isTypeValid && !isTypeValid(value)) {
      ctx.addError(
        `Expected ${expectedType}, received ${value === null ? 'null' : typeof value}`
      );
      return;
    }
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      ctx.addError(
        `String length ${value.length} is less than minimum ${schema.minLength}`
      );
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      ctx.addError(
        `String length ${value.length} exceeds maximum ${schema.maxLength}`
      );
    }
    if (schema.pattern) {
      const regex = getCachedRegex(schema.pattern);
      if (!regex.test(value)) {
        ctx.addError(`String does not match pattern ${schema.pattern}`);
      }
    }
    if (schema.format) {
      const formatCheck = formatValidators[schema.format];
      if (formatCheck && !formatCheck(value)) {
        ctx.addError(
          `Expected string format '${schema.format}', received '${value}'`
        );
      }
    }
  } else if (typeof value === 'number') {
    if (schema.minimum !== undefined) {
      const isViolation = schema.exclusiveMinimum
        ? value <= schema.minimum
        : value < schema.minimum;
      if (isViolation) {
        ctx.addError(
          `Value ${value} is less than ${schema.exclusiveMinimum ? 'or equal to ' : ''}minimum ${schema.minimum}`
        );
      }
    }
    if (schema.maximum !== undefined) {
      const isViolation = schema.exclusiveMaximum
        ? value >= schema.maximum
        : value > schema.maximum;
      if (isViolation) {
        ctx.addError(
          `Value ${value} is greater than ${schema.exclusiveMaximum ? 'or equal to ' : ''}maximum ${schema.maximum}`
        );
      }
    }
    if (schema.multipleOf !== undefined) {
      const isMultiple = Number.isInteger(
        Number((value / schema.multipleOf).toFixed(5))
      );
      if (!isMultiple) {
        ctx.addError(
          `Value ${value} is not a multiple of ${schema.multipleOf}`
        );
      }
    }
  }
}

export function validateArray(
  value: unknown,
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
  if (!Array.isArray(value)) {
    ctx.addError(
      `Expected array, received ${value === null ? 'null' : typeof value}`
    );
    return;
  }

  if (ctx.visited.has(value)) {
    return;
  }
  ctx.visited.add(value);

  if (schema.minItems !== undefined && value.length < schema.minItems) {
    ctx.addError(
      `Array has ${value.length} items, minimum is ${schema.minItems}`
    );
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    ctx.addError(
      `Array has ${value.length} items, maximum is ${schema.maxItems}`
    );
  }
  if (schema.uniqueItems) {
    const uniqueValues = new Set(value.map((item) => JSON.stringify(item)));
    if (uniqueValues.size !== value.length) {
      ctx.addError('Array elements must be unique');
    }
  }

  const arraySchema = schema as OpenAPIV3.ArraySchemaObject;
  const itemsSchema: unknown = arraySchema.items;
  if (!isSchemaObject(itemsSchema)) {
    ctx.visited.delete(value);
    return;
  }

  const arr = value as unknown[];
  for (let i = 0; i < arr.length; i++) {
    ctx.pushPath(i);
    validateShape(arr[i], itemsSchema, ctx);
    ctx.popPath();
  }

  ctx.visited.delete(value);
}

export function validateObject(
  value: unknown,
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    ctx.addError(
      `Expected object, received ${value === null ? 'null' : typeof value}`
    );
    return;
  }

  const obj = value as Record<string, unknown>;

  if (ctx.visited.has(obj)) {
    return;
  }
  ctx.visited.add(obj);

  const keys = Object.keys(obj);

  if (
    schema.minProperties !== undefined &&
    keys.length < schema.minProperties
  ) {
    ctx.addError(
      `Object has ${keys.length} properties, minimum is ${schema.minProperties}`
    );
  }
  if (
    schema.maxProperties !== undefined &&
    keys.length > schema.maxProperties
  ) {
    ctx.addError(
      `Object has ${keys.length} properties, maximum is ${schema.maxProperties}`
    );
  }

  if (schema.required) {
    for (const key of schema.required) {
      if (obj[key] === undefined) {
        ctx.pushPath(key);
        ctx.addError('Missing required field');
        ctx.popPath();
      }
    }
  }

  const additionalSchema = schema.additionalProperties;
  if (additionalSchema !== undefined && additionalSchema !== true) {
    const properties = schema.properties ?? {};
    const allowedKeys = new Set(Object.keys(properties));
    const isSchema = isSchemaObject(additionalSchema);

    for (const key of keys) {
      if (allowedKeys.has(key)) continue;

      if (additionalSchema === false) {
        ctx.pushPath(key);
        ctx.addError(`Key '${key}' is not allowed by OpenAPI schema`);
        ctx.popPath();
        continue;
      }

      if (isSchema) {
        ctx.pushPath(key);
        validateShape(obj[key], additionalSchema, ctx);
        ctx.popPath();
      }
    }
  }

  const properties = schema.properties ?? {};
  for (const [key, propSchema] of Object.entries(properties)) {
    const propValue = obj[key];
    if (propValue === undefined || !isSchemaObject(propSchema)) continue;

    ctx.pushPath(key);
    validateShape(propValue, propSchema, ctx);
    ctx.popPath();
  }

  ctx.visited.delete(obj);
}
