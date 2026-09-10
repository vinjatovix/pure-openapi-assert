import type { OpenAPIV3 } from 'openapi-types';
import {
  FLOAT32_MAX,
  INT32_MAX,
  INT32_MIN,
  INT64_MAX,
  INT64_MIN,
  INTEGER_STRING_REGEX
} from '../core/constants.js';
import { ValidationContext } from '../core/ValidationContext.js';
import { formatRegistry, getCachedRegex } from './format.js';

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
  customFormats?: Record<string, (val: string) => boolean> | undefined;
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
  if (!schema.enum) return;

  if (!schema.enum.includes(value)) {
    ctx.addError(
      `Expected one of [${schema.enum.join(', ')}], received ${JSON.stringify(value)}`
    );
  }
}

function isValidInt64String(
  type: string | undefined,
  format: string | undefined,
  value: unknown
): boolean {
  return (
    type === 'integer' &&
    format === 'int64' &&
    typeof value === 'string' &&
    INTEGER_STRING_REGEX.test(value)
  );
}

function getReceivedType(value: unknown): string {
  return value === null ? 'null' : typeof value;
}

export function validateTypeCheck(args: ValidationArgs): boolean {
  const { value, schema, ctx } = args;
  const expectedType = schema.type;
  const isTypeValid = expectedType ? typeValidators[expectedType] : undefined;

  if (
    expectedType &&
    isTypeValid &&
    !isValidInt64String(expectedType, schema.format, value) &&
    !isTypeValid(value)
  ) {
    ctx.addError(
      `Expected ${expectedType}, received ${getReceivedType(value)}`
    );
    return false;
  }

  return true;
}

export function validateStringFormat(args: ValidationArgs<string>): void {
  const { value, schema, ctx, customFormats } = args;
  if (!schema.format) return;

  const customFormatCheck =
    customFormats && Object.hasOwn(customFormats, schema.format)
      ? customFormats[schema.format]
      : undefined;

  const formatCheck =
    typeof customFormatCheck === 'function'
      ? customFormatCheck
      : Object.hasOwn(formatRegistry, schema.format)
        ? formatRegistry[schema.format]
        : undefined;

  if (typeof formatCheck === 'function' && !formatCheck(value)) {
    ctx.addError(
      `Expected string format '${schema.format}', received '${value}'`
    );
  }
}

export function validateStringLength(args: ValidationArgs<string>): void {
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
}

export function validateStringPattern(args: ValidationArgs<string>): void {
  const { value, schema, ctx } = args;
  if (schema.pattern) {
    const regex = getCachedRegex(schema.pattern);
    if (!regex.test(value)) {
      ctx.addError(`String does not match pattern ${schema.pattern}`);
    }
  }
}

export function validateStringConstraints(args: ValidationArgs<string>): void {
  validateStringLength(args);
  validateStringPattern(args);
  validateStringFormat(args);
}

export function validateMinBigIntConstraint(args: ValidationArgs): void {
  const { value, schema, ctx } = args;
  const valueStr = value as string;

  if (!INTEGER_STRING_REGEX.test(valueStr)) {
    return;
  }

  const bound = parseBigIntBound(schema.minimum, Math.ceil);
  if (!bound) {
    return;
  }

  const bigintVal = BigInt(valueStr);
  const isViolation =
    schema.exclusiveMinimum && !bound.isFractional
      ? bigintVal <= bound.value
      : bigintVal < bound.value;

  if (isViolation) {
    ctx.addError(
      `Value ${String(value)} is less than ${schema.exclusiveMinimum ? 'or equal to ' : ''}minimum ${schema.minimum}`
    );
  }
}

export function validateMinNumberConstraint(args: ValidationArgs): void {
  const { value, schema, ctx } = args;
  if (schema.minimum === undefined) {
    return;
  }
  const isViolation = schema.exclusiveMinimum
    ? (value as number) <= schema.minimum
    : (value as number) < schema.minimum;
  if (isViolation) {
    ctx.addError(
      `Value ${String(value)} is less than ${schema.exclusiveMinimum ? 'or equal to ' : ''}minimum ${schema.minimum}`
    );
  }
}

export function validateMinConstraint(args: ValidationArgs): void {
  const { value, schema } = args;
  if (schema.minimum === undefined) return;

  if (typeof value === 'string' && schema.format === 'int64') {
    validateMinBigIntConstraint(args);
  } else if (typeof value === 'number') {
    validateMinNumberConstraint(args);
  }
}

export function validateMaxBigIntConstraint(args: ValidationArgs): void {
  const { value, schema, ctx } = args;
  const valueStr = value as string;

  if (!INTEGER_STRING_REGEX.test(valueStr)) {
    return;
  }

  const bound = parseBigIntBound(schema.maximum, Math.floor);
  if (!bound) {
    return;
  }

  const bigintVal = BigInt(valueStr);
  const isViolation =
    schema.exclusiveMaximum && !bound.isFractional
      ? bigintVal >= bound.value
      : bigintVal > bound.value;

  if (isViolation) {
    ctx.addError(
      `Value ${String(value)} is greater than ${schema.exclusiveMaximum ? 'or equal to ' : ''}maximum ${schema.maximum}`
    );
  }
}

export function validateMaxNumberConstraint(args: ValidationArgs): void {
  const { value, schema, ctx } = args;
  if (schema.maximum === undefined) {
    return;
  }
  const isViolation = schema.exclusiveMaximum
    ? (value as number) >= schema.maximum
    : (value as number) > schema.maximum;
  if (isViolation) {
    ctx.addError(
      `Value ${String(value)} is greater than ${schema.exclusiveMaximum ? 'or equal to ' : ''}maximum ${schema.maximum}`
    );
  }
}

export function validateMaxConstraint(args: ValidationArgs): void {
  const { value, schema } = args;
  if (schema.maximum === undefined) return;

  if (typeof value === 'string' && schema.format === 'int64') {
    validateMaxBigIntConstraint(args);
  } else if (typeof value === 'number') {
    validateMaxNumberConstraint(args);
  }
}

export function validateMultipleOfBigIntConstraint(args: ValidationArgs): void {
  const { value, schema, ctx } = args;
  const valueStr = value as string;

  if (!INTEGER_STRING_REGEX.test(valueStr)) {
    return;
  }

  const multipleVal = schema.multipleOf;
  if (multipleVal === undefined) {
    return;
  }

  const multipleNum = Number(multipleVal);
  if (isNaN(multipleNum) || !Number.isFinite(multipleNum) || multipleNum <= 0) {
    return;
  }

  let bigintVal = BigInt(valueStr);
  let bigintMultiple: bigint;

  try {
    bigintMultiple = BigInt(multipleVal);
  } catch {
    const decimals = Math.max(0, getDecimalPlaces(multipleNum));
    const multiplier = 10n ** BigInt(decimals);

    bigintVal = bigintVal * multiplier;
    // Note: For extremely small multipleOf values (e.g. 15+ decimals like 0.0000000000000001),
    // Math.pow(10, decimals) and the subsequent multiplication might hit IEEE 754 precision limits.
    // In practice for OpenAPI schemas on 64-bit integers, this is rarely an issue.
    try {
      bigintMultiple = BigInt(Math.round(multipleNum * Math.pow(10, decimals)));
    } catch {
      bigintMultiple = 0n;
    }
  }

  if (bigintMultiple === 0n) {
    return;
  }

  if (bigintVal % bigintMultiple !== 0n) {
    ctx.addError(
      `Value ${String(value)} is not a multiple of ${schema.multipleOf}`
    );
  }
}

function isBigIntSupportedBound(
  bound: unknown
): bound is number | string | bigint {
  return (
    typeof bound === 'number' ||
    typeof bound === 'string' ||
    typeof bound === 'bigint'
  );
}

function parseBigIntBound(
  bound: unknown,
  roundFn: (n: number) => number
): { value: bigint; isFractional: boolean } | undefined {
  if (bound === undefined || bound === null) return undefined;

  if (!isBigIntSupportedBound(bound)) {
    return undefined;
  }

  if (typeof bound === 'string' && bound.trim() === '') {
    return undefined;
  }

  const num = Number(bound);

  if (isNaN(num)) {
    return undefined;
  }

  if (!Number.isFinite(num)) {
    throw new TypeError('Invalid schema: BigInt bound cannot be Infinity');
  }

  try {
    return { value: BigInt(bound), isFractional: false };
  } catch {
    const isFractional = !Number.isInteger(num);
    const value = isFractional ? BigInt(roundFn(num)) : BigInt(num);
    return { value, isFractional };
  }
}

function getDecimalPlaces(num: number): number {
  const str = num.toString();
  let decimals: number;
  if (str.includes('e')) {
    const [basePart, exponent] = str.split('e') as [string, string];
    const exp = parseInt(exponent, 10);

    if (exp < 0) {
      const dotIndex = basePart.indexOf('.');
      const baseDecimals = dotIndex === -1 ? 0 : basePart.length - dotIndex - 1;
      decimals = baseDecimals - exp;
    } else {
      decimals = 0;
    }
  } else {
    const dotIndex = str.indexOf('.');
    decimals = dotIndex === -1 ? 0 : str.length - dotIndex - 1;
  }
  return decimals;
}

export function validateMultipleOfNumberConstraint(args: ValidationArgs): void {
  const { value, schema, ctx } = args;
  const multipleOfRaw = schema.multipleOf;
  if (multipleOfRaw === undefined) {
    return;
  }
  const multipleOfNum = Number(multipleOfRaw);
  if (
    isNaN(multipleOfNum) ||
    !Number.isFinite(multipleOfNum) ||
    multipleOfNum <= 0
  ) {
    return;
  }
  const valNum = value as number;

  const decimals = Math.max(
    getDecimalPlaces(multipleOfNum),
    getDecimalPlaces(valNum)
  );
  const multiplier = Math.pow(10, decimals);
  if (!Number.isFinite(multiplier) || multiplier === 0) {
    return;
  }

  const valInt = Math.round(valNum * multiplier);
  const multipleInt = Math.round(multipleOfNum * multiplier);

  if (multipleInt === 0 || !Number.isFinite(multipleInt)) {
    return;
  }

  if (valInt % multipleInt !== 0) {
    ctx.addError(
      `Value ${String(value)} is not a multiple of ${schema.multipleOf}`
    );
  }
}

export function validateMultipleOfConstraint(args: ValidationArgs): void {
  const { value, schema } = args;
  if (schema.multipleOf === undefined) return;

  if (typeof value === 'string' && schema.format === 'int64') {
    validateMultipleOfBigIntConstraint(args);
  } else if (typeof value === 'number') {
    validateMultipleOfNumberConstraint(args);
  }
}

export function validateInt32(args: ValidationArgs): void {
  const { value, ctx } = args;
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < INT32_MIN || value > INT32_MAX) {
      ctx.addError(`Expected 32-bit integer, received ${String(value)}`);
    }
  } else {
    ctx.addError(`Expected 32-bit integer, received ${typeof value}`);
  }
}

function validateInt64Number(value: number, ctx: ValidationContext): void {
  if (
    !Number.isInteger(value) ||
    value < Number.MIN_SAFE_INTEGER ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    ctx.addError(`Expected 64-bit integer, received ${String(value)}`);
  }
}

function validateInt64String(value: string, ctx: ValidationContext): void {
  if (!INTEGER_STRING_REGEX.test(value)) {
    ctx.addError(`Value ${String(value)} is not a valid 64-bit integer`);
    return;
  }
  const bigint = BigInt(value);
  if (bigint < INT64_MIN || bigint > INT64_MAX) {
    ctx.addError(`Value ${String(value)} exceeds 64-bit integer limits`);
  }
}

export function validateInt64(args: ValidationArgs): void {
  const { value, ctx } = args;

  if (typeof value === 'number') {
    validateInt64Number(value, ctx);
    return;
  }

  if (typeof value === 'string') {
    validateInt64String(value, ctx);
    return;
  }

  ctx.addError(`Expected 64-bit integer, received ${typeof value}`);
}

export function validateFloat(args: ValidationArgs): void {
  const { value, ctx } = args;
  if (typeof value !== 'number') {
    ctx.addError(`Expected 32-bit float, received ${typeof value}`);
    return;
  }

  const abs = Math.abs(value);
  if (Number.isNaN(value) || !Number.isFinite(value) || abs > FLOAT32_MAX) {
    ctx.addError(`Expected 32-bit float, received ${String(value)}`);
  }
}

export function validateDouble(args: ValidationArgs): void {
  const { value, ctx } = args;
  if (
    typeof value !== 'number' ||
    Number.isNaN(value) ||
    !Number.isFinite(value)
  ) {
    ctx.addError(`Expected 64-bit float, received ${String(value)}`);
  }
}

export function validateNumberFormatConstraint(args: ValidationArgs): void {
  const { schema } = args;
  const format = schema.format;
  if (!format) return;

  switch (format) {
    case 'int32':
      validateInt32(args);
      break;
    case 'int64':
      validateInt64(args);
      break;
    case 'float':
      validateFloat(args);
      break;
    case 'double':
      validateDouble(args);
      break;
  }
}

export function validateNumberConstraints(args: ValidationArgs): void {
  validateMinConstraint(args);
  validateMaxConstraint(args);
  validateMultipleOfConstraint(args);
  validateNumberFormatConstraint(args);
}

export function validateBaseType(args: ValidationArgs): void {
  validateEnum(args);

  if (!validateTypeCheck(args)) {
    return;
  }

  const { value, schema } = args;

  if (typeof value === 'string') {
    validateStringConstraints(args as ValidationArgs<string>);
    if (schema.type === 'integer' && schema.format === 'int64') {
      validateNumberConstraints(args);
    } else if (
      schema.format &&
      ['int32', 'int64', 'float', 'double'].includes(schema.format)
    ) {
      validateNumberFormatConstraint(args);
    }
  } else if (typeof value === 'number') {
    validateNumberConstraints(args);
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
  if (!schema.uniqueItems) return;

  const uniqueValues = new Set(value.map((item) => JSON.stringify(item)));
  if (uniqueValues.size !== value.length) {
    ctx.addError('Array elements must be unique');
  }
}

export function validateArrayItems(args: ValidationArgs<unknown[]>): void {
  const { value, schema, ctx, validateShape, customFormats } = args;
  const arraySchema = schema as OpenAPIV3.ArraySchemaObject;
  const itemsSchema: unknown = arraySchema.items;
  if (!isSchemaObject(itemsSchema)) {
    return;
  }

  for (let i = 0; i < value.length; i++) {
    ctx.pushPath(i);
    validateShape({
      value: value[i],
      schema: itemsSchema,
      ctx,
      validateShape,
      customFormats
    });
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

export function validateAdditionalProperties(
  args: ValidationArgs<Record<string, unknown>>
): void {
  const { value: obj, schema, ctx, keys, validateShape, customFormats } = args;
  const additionalSchema = schema.additionalProperties;
  if (additionalSchema === undefined || additionalSchema === true) return;

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
  for (const [key, propSchema] of Object.entries(properties)) {
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
    validateShape: args.validateShape,
    customFormats: args.customFormats
  };

  validateObjectBounds(objectArgs);

  if (schema.required) {
    validateRequiredFields(objectArgs);
  }

  validateAdditionalProperties(objectArgs);
  validateDeclaredProperties(objectArgs);

  ctx.visited.delete(obj);
}
