import {
  FLOAT32_MAX,
  INT32_MAX,
  INT32_MIN,
  INT64_MAX,
  INT64_MIN,
  INTEGER_STRING_REGEX
} from '../core/constants.js';
import { type ValidationContext } from '../core/ValidationContext.js';
import { type ValidationArgs } from './args.js';

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

function resolveBigIntMultiple(
  multipleVal: number | string | boolean | undefined
): { bigintMultiple: bigint; multiplier: bigint } | undefined {
  if (multipleVal === undefined) return undefined;
  try {
    const bigintMultiple = BigInt(multipleVal);
    if (bigintMultiple <= 0n) return undefined;
    return { bigintMultiple, multiplier: 1n };
  } catch {
    const multipleNum = Number(multipleVal);
    if (
      isNaN(multipleNum) ||
      !Number.isFinite(multipleNum) ||
      multipleNum <= 0
    ) {
      return undefined;
    }

    const decimals = Math.max(0, getDecimalPlaces(multipleNum));
    const multiplier = 10n ** BigInt(decimals);
    let bigintMultiple: bigint;
    try {
      bigintMultiple = BigInt(Math.round(multipleNum * Math.pow(10, decimals)));
    } catch {
      bigintMultiple = 0n;
    }
    return { bigintMultiple, multiplier };
  }
}

export function validateMultipleOfBigIntConstraint(args: ValidationArgs): void {
  const { value, schema, ctx } = args;
  const valueStr = value as string;

  if (!INTEGER_STRING_REGEX.test(valueStr)) {
    return;
  }

  const resolved = resolveBigIntMultiple(schema.multipleOf);
  if (!resolved || resolved.bigintMultiple === 0n) {
    return;
  }

  const bigintVal = BigInt(valueStr) * resolved.multiplier;

  if (bigintVal % resolved.bigintMultiple !== 0n) {
    ctx.addError(
      `Value ${String(value)} is not a multiple of ${schema.multipleOf}`
    );
  }
}

function parseBigIntFromNumber(
  num: number,
  roundFn: (n: number) => number
): { value: bigint; isFractional: boolean } | undefined {
  if (Number.isNaN(num)) {
    return undefined;
  }
  if (!Number.isFinite(num)) {
    throw new TypeError('Invalid schema: BigInt bound cannot be Infinity');
  }
  const isFractional = !Number.isInteger(num);
  const value = isFractional ? BigInt(roundFn(num)) : BigInt(num);
  return { value, isFractional };
}

function parseBigIntBound(
  bound: unknown,
  roundFn: (n: number) => number
): { value: bigint; isFractional: boolean } | undefined {
  if (bound === undefined || bound === null) {
    return undefined;
  }

  if (typeof bound === 'bigint') {
    return { value: bound, isFractional: false };
  }

  if (typeof bound === 'number') {
    return parseBigIntFromNumber(bound, roundFn);
  }

  if (typeof bound === 'string') {
    const trimmed = bound.trim();
    if (trimmed === '') {
      return undefined;
    }

    try {
      return { value: BigInt(trimmed), isFractional: false };
    } catch {
      return parseBigIntFromNumber(Number(trimmed), roundFn);
    }
  }

  return undefined;
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

function isMultipleOfDecimal(valNum: number, multipleOfNum: number): boolean {
  const decimals = Math.max(
    getDecimalPlaces(multipleOfNum),
    getDecimalPlaces(valNum)
  );
  const multiplier = Math.pow(10, decimals);
  if (!Number.isFinite(multiplier) || multiplier === 0) {
    return true;
  }

  const valInt = Math.round(valNum * multiplier);
  const multipleInt = Math.round(multipleOfNum * multiplier);

  if (multipleInt === 0 || !Number.isFinite(multipleInt)) {
    return true;
  }

  return valInt % multipleInt === 0;
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

  const isMultiple =
    Number.isInteger(valNum) && Number.isInteger(multipleOfNum)
      ? valNum % multipleOfNum === 0
      : isMultipleOfDecimal(valNum, multipleOfNum);

  if (!isMultiple) {
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
