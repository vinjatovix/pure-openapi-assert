import type { OpenAPIV3 } from 'openapi-types';
import { ValidationContext } from '../core/ValidationContext.js';
import { getCachedRegex, formatValidators } from './format.js';

export interface ValidationArgs<T = unknown> {
  value: T;
  schema: OpenAPIV3.SchemaObject;
  ctx: ValidationContext;
  keys?: string[];
  
  /**
   * Injected orchestrator function (Dependency Injection).
   * Passed explicitly to break cyclic module imports between structural validators
   * (arrays/objects) and the root shape validator, ensuring CJS/ESM safety.
   */
  validateShape: (args: ValidationArgs) => void;
}

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

export function validateEnum(args: ValidationArgs): void {
  const { value, schema, ctx } = args;
  if (schema.enum) {
    if (!schema.enum.includes(value)) {
      ctx.addError(
        `Expected one of [${schema.enum.join(', ')}], received ${JSON.stringify(value)}`
      );
    }
  }
}

export function validateTypeCheck(args: ValidationArgs): boolean {
  const { value, schema, ctx } = args;
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

export function validateStringConstraints(args: ValidationArgs<string>): void {
  const { value, schema, ctx } = args;
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

export function validateMinConstraint(args: ValidationArgs<number>): void {
  const { value, schema, ctx } = args;
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

export function validateMaxConstraint(args: ValidationArgs<number>): void {
  const { value, schema, ctx } = args;
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

export function validateMultipleOfConstraint(args: ValidationArgs<number>): void {
  const { value, schema, ctx } = args;
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

export function validateNumberConstraints(args: ValidationArgs<number>): void {
  validateMinConstraint(args);
  validateMaxConstraint(args);
  validateMultipleOfConstraint(args);
}

export function validateBaseType(args: ValidationArgs): void {
  validateEnum(args);

  if (!validateTypeCheck(args)) {
    return;
  }

  const { value } = args;
  if (typeof value === 'string') {
    validateStringConstraints(args as ValidationArgs<string>);
  } else if (typeof value === 'number') {
    validateNumberConstraints(args as ValidationArgs<number>);
  }
}

export function validateArrayBounds(args: ValidationArgs<unknown[]>): void {
  const { value, schema, ctx } = args;
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

export function validateArrayUnique(args: ValidationArgs<unknown[]>): void {
  const { value, schema, ctx } = args;
  if (schema.uniqueItems) {
    const uniqueValues = new Set(value.map((item) => JSON.stringify(item)));
    if (uniqueValues.size !== value.length) {
      ctx.addError('Array elements must be unique');
    }
  }
}

export function validateArrayItems(args: ValidationArgs<unknown[]>): void {
  const { value, schema, ctx, validateShape } = args;
  const arraySchema = schema as OpenAPIV3.ArraySchemaObject;
  const itemsSchema: unknown = arraySchema.items;
  if (!isSchemaObject(itemsSchema)) {
    return;
  }

  for (let i = 0; i < value.length; i++) {
    ctx.pushPath(i);
    validateShape({ value: value[i], schema: itemsSchema, ctx, validateShape });
    ctx.popPath();
  }
}

export function validateArray(args: ValidationArgs): void {
  const { value, ctx } = args;
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

  const arrayArgs = args as ValidationArgs<unknown[]>;
  validateArrayBounds(arrayArgs);
  validateArrayUnique(arrayArgs);
  validateArrayItems(arrayArgs);

  ctx.visited.delete(value);
}

function isNotValidObject(value: unknown): boolean {
  return typeof value !== 'object' || value === null || Array.isArray(value);
}

export function validateObjectBounds(args: ValidationArgs): void {
  const { schema, ctx, keys } = args;
  const keysCount = keys ? keys.length : 0;
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

export function validateRequiredFields(args: ValidationArgs<Record<string, unknown>>): void {
  const { value: obj, schema, ctx } = args;
  const required = schema.required;
  if (required) {
    for (const key of required) {
      if (obj[key] === undefined) {
        ctx.pushPath(key);
        ctx.addError('Missing required field');
        ctx.popPath();
      }
    }
  }
}

export function validateAdditionalProperties(args: ValidationArgs<Record<string, unknown>>): void {
  const { value: obj, schema, ctx, keys, validateShape } = args;
  const additionalSchema = schema.additionalProperties;
  if (additionalSchema !== undefined && additionalSchema !== true) {
    const properties = schema.properties ?? {};
    const allowedKeys = new Set(Object.keys(properties));
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
        validateShape({ value: obj[key], schema: additionalSchema, ctx, validateShape });
        ctx.popPath();
      }
    }
  }
}

export function validateDeclaredProperties(args: ValidationArgs<Record<string, unknown>>): void {
  const { value: obj, schema, ctx, validateShape } = args;
  const properties = schema.properties ?? {};
  for (const [key, propSchema] of Object.entries(properties)) {
    const propValue = obj[key];
    if (propValue === undefined || !isSchemaObject(propSchema)) continue;

    ctx.pushPath(key);
    validateShape({ value: propValue, schema: propSchema, ctx, validateShape });
    ctx.popPath();
  }
}

export function validateObject(args: ValidationArgs): void {
  const { value, schema, ctx } = args;
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
  const objectArgs: ValidationArgs<Record<string, unknown>> = {
    value: obj,
    schema,
    ctx,
    keys,
    validateShape: args.validateShape
  };

  validateObjectBounds(objectArgs);

  if (schema.required) {
    validateRequiredFields(objectArgs);
  }

  validateAdditionalProperties(objectArgs);
  validateDeclaredProperties(objectArgs);

  ctx.visited.delete(obj);
}
