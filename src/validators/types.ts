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

export function validateEnum(
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
}

export function validateTypeCheck(
  value: unknown,
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): boolean {
  const expectedType = schema.type;
  if (expectedType) {
    const isTypeValid = typeValidators[expectedType];
    if (isTypeValid && !isTypeValid(value)) {
      ctx.addError(
        `Expected ${expectedType}, received ${value === null ? 'null' : typeof value}`
      );
      return false;
    }
  }
  return true;
}

export function validateStringConstraints(
  value: string,
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
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
}

export function validateMinConstraint(
  value: number,
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
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
}

export function validateMaxConstraint(
  value: number,
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
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
}

export function validateMultipleOfConstraint(
  value: number,
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
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

export function validateNumberConstraints(
  value: number,
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
  validateMinConstraint(value, schema, ctx);
  validateMaxConstraint(value, schema, ctx);
  validateMultipleOfConstraint(value, schema, ctx);
}

export function validateBaseType(
  value: unknown,
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
  validateEnum(value, schema, ctx);

  if (!validateTypeCheck(value, schema, ctx)) {
    return;
  }

  if (typeof value === 'string') {
    validateStringConstraints(value, schema, ctx);
  } else if (typeof value === 'number') {
    validateNumberConstraints(value, schema, ctx);
  }
}

export function validateArrayBounds(
  value: unknown[],
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
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
}

export function validateArrayUnique(
  value: unknown[],
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
  if (schema.uniqueItems) {
    const uniqueValues = new Set(value.map((item) => JSON.stringify(item)));
    if (uniqueValues.size !== value.length) {
      ctx.addError('Array elements must be unique');
    }
  }
}

export function validateArrayItems(
  value: unknown[],
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
  const arraySchema = schema as OpenAPIV3.ArraySchemaObject;
  const itemsSchema: unknown = arraySchema.items;
  if (!isSchemaObject(itemsSchema)) {
    return;
  }

  for (let i = 0; i < value.length; i++) {
    ctx.pushPath(i);
    validateShape(value[i], itemsSchema, ctx);
    ctx.popPath();
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

  validateArrayBounds(value, schema, ctx);
  validateArrayUnique(value, schema, ctx);
  validateArrayItems(value, schema, ctx);

  ctx.visited.delete(value);
}

function isNotValidObject(value: unknown): boolean {
  return typeof value !== 'object' || value === null || Array.isArray(value);
}

export function validateObjectBounds(
  keysCount: number,
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
  if (
    schema.minProperties !== undefined &&
    keysCount < schema.minProperties
  ) {
    ctx.addError(
      `Object has ${keysCount} properties, minimum is ${schema.minProperties}`
    );
  }
  if (
    schema.maxProperties !== undefined &&
    keysCount > schema.maxProperties
  ) {
    ctx.addError(
      `Object has ${keysCount} properties, maximum is ${schema.maxProperties}`
    );
  }
}

export function validateRequiredFields(
  obj: Record<string, unknown>,
  required: string[],
  ctx: ValidationContext
): void {
  for (const key of required) {
    if (obj[key] === undefined) {
      ctx.pushPath(key);
      ctx.addError('Missing required field');
      ctx.popPath();
    }
  }
}

export function validateAdditionalProperties(
  obj: Record<string, unknown>,
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
  const additionalSchema = schema.additionalProperties;
  if (additionalSchema !== undefined && additionalSchema !== true) {
    const properties = schema.properties ?? {};
    const allowedKeys = new Set(Object.keys(properties));
    const isSchema = isSchemaObject(additionalSchema);
    const keys = Object.keys(obj);

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
}

export function validateDeclaredProperties(
  obj: Record<string, unknown>,
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
  const properties = schema.properties ?? {};
  for (const [key, propSchema] of Object.entries(properties)) {
    const propValue = obj[key];
    if (propValue === undefined || !isSchemaObject(propSchema)) continue;

    ctx.pushPath(key);
    validateShape(propValue, propSchema, ctx);
    ctx.popPath();
  }
}

export function validateObject(
  value: unknown,
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
  if (isNotValidObject(value)) {
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

  validateObjectBounds(keys.length, schema, ctx);

  if (schema.required) {
    validateRequiredFields(obj, schema.required, ctx);
  }

  validateAdditionalProperties(obj, schema, ctx);
  validateDeclaredProperties(obj, schema, ctx);

  ctx.visited.delete(obj);
}
