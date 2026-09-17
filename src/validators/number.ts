import {
  FLOAT32_MAX,
  INT32_MAX,
  INT32_MIN,
  INT64_MAX,
  INT64_MIN,
  INTEGER_STRING_REGEX
} from '../core/constants.js';
import {
  formatMinError,
  formatMaxError,
  formatMultipleOfError,
  formatInt32Error,
  formatInt64Error,
  formatInt64InvalidError,
  formatInt64ExceedsError,
  formatFloatError,
  formatDoubleError
} from '../core/errors.js';
import { type ValidationContext } from '../core/ValidationContext.js';
import { type ValidationArgs } from './args.js';

function extractBigIntVal(value: unknown): bigint | undefined {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'string' && INTEGER_STRING_REGEX.test(value)) {
    return BigInt(value);
  }
  return undefined;
}

function checkNumericLimitViolation(args: {
  value: number | bigint;
  boundValue: number | bigint;
  exclusive: boolean;
  isFractional: boolean;
  isMin: boolean;
}): boolean {
  const { value, boundValue, exclusive, isFractional, isMin } = args;
  if (isMin) {
    return exclusive && !isFractional
      ? value <= boundValue
      : value < boundValue;
  } else {
    return exclusive && !isFractional
      ? value >= boundValue
      : value > boundValue;
  }
}

export function validateMinConstraint(args: ValidationArgs): void {
  const { value, schema, ctx } = args;
  if (schema.minimum === undefined) return;

  const isBigIntFormat =
    (typeof value === 'string' && schema.format === 'int64') ||
    typeof value === 'bigint';

  if (isBigIntFormat) {
    const bigintVal = extractBigIntVal(value);
    if (bigintVal === undefined) return;

    const bound = parseBigIntBound(schema.minimum, Math.ceil);
    if (!bound) return;

    if (
      checkNumericLimitViolation({
        value: bigintVal,
        boundValue: bound.value,
        exclusive: !!schema.exclusiveMinimum,
        isFractional: bound.isFractional,
        isMin: true
      })
    ) {
      ctx.addError(
        formatMinError({
          value,
          minimum: schema.minimum,
          exclusive: !!schema.exclusiveMinimum
        })
      );
    }
  } else if (typeof value === 'number') {
    if (
      checkNumericLimitViolation({
        value,
        boundValue: schema.minimum,
        exclusive: !!schema.exclusiveMinimum,
        isFractional: false,
        isMin: true
      })
    ) {
      ctx.addError(
        formatMinError({
          value,
          minimum: schema.minimum,
          exclusive: !!schema.exclusiveMinimum
        })
      );
    }
  }
}

export function validateMaxConstraint(args: ValidationArgs): void {
  const { value, schema, ctx } = args;
  if (schema.maximum === undefined) return;

  const isBigIntFormat =
    (typeof value === 'string' && schema.format === 'int64') ||
    typeof value === 'bigint';

  if (isBigIntFormat) {
    const bigintVal = extractBigIntVal(value);
    if (bigintVal === undefined) return;

    const bound = parseBigIntBound(schema.maximum, Math.floor);
    if (!bound) return;

    if (
      checkNumericLimitViolation({
        value: bigintVal,
        boundValue: bound.value,
        exclusive: !!schema.exclusiveMaximum,
        isFractional: bound.isFractional,
        isMin: false
      })
    ) {
      ctx.addError(
        formatMaxError({
          value,
          maximum: schema.maximum,
          exclusive: !!schema.exclusiveMaximum
        })
      );
    }
  } else if (typeof value === 'number') {
    if (
      checkNumericLimitViolation({
        value,
        boundValue: schema.maximum,
        exclusive: !!schema.exclusiveMaximum,
        isFractional: false,
        isMin: false
      })
    ) {
      ctx.addError(
        formatMaxError({
          value,
          maximum: schema.maximum,
          exclusive: !!schema.exclusiveMaximum
        })
      );
    }
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

    try {
      const decimals = Math.max(0, getDecimalPlaces(multipleNum));
      const multiplier = 10n ** BigInt(decimals);
      const scaled = multipleNum * Math.pow(10, decimals);
      if (Number.isNaN(scaled) || !Number.isFinite(scaled)) {
        return undefined;
      }
      const bigintMultiple = BigInt(Math.round(scaled));
      return { bigintMultiple, multiplier };
    } catch {
      return undefined;
    }
  }
}

function validateMultipleOfBigIntConstraint(args: ValidationArgs): void {
  const { value, schema, ctx } = args;
  const bigintVal = extractBigIntVal(value);
  if (bigintVal === undefined) {
    return;
  }

  const resolved = resolveBigIntMultiple(schema.multipleOf);
  if (!resolved || resolved.bigintMultiple === 0n) {
    return;
  }

  const adjustedVal = bigintVal * resolved.multiplier;

  if (adjustedVal % resolved.bigintMultiple !== 0n) {
    ctx.addError(formatMultipleOfError(value, schema.multipleOf));
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

function validateMultipleOfNumberConstraint(args: ValidationArgs): void {
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
    ctx.addError(formatMultipleOfError(value, schema.multipleOf));
  }
}

export function validateMultipleOfConstraint(args: ValidationArgs): void {
  const { value, schema } = args;
  if (schema.multipleOf === undefined) return;

  if (
    (typeof value === 'string' && schema.format === 'int64') ||
    typeof value === 'bigint'
  ) {
    validateMultipleOfBigIntConstraint(args);
  } else if (typeof value === 'number') {
    validateMultipleOfNumberConstraint(args);
  }
}

function validateInt32(args: ValidationArgs): void {
  const { value, ctx } = args;
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < INT32_MIN || value > INT32_MAX) {
      ctx.addError(formatInt32Error(String(value)));
    }
  } else if (typeof value === 'bigint') {
    if (value < BigInt(INT32_MIN) || value > BigInt(INT32_MAX)) {
      ctx.addError(formatInt32Error(String(value)));
    }
  } else {
    ctx.addError(formatInt32Error(typeof value));
  }
}

function validateInt64Number(value: number, ctx: ValidationContext): void {
  if (
    !Number.isInteger(value) ||
    value < Number.MIN_SAFE_INTEGER ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    ctx.addError(formatInt64Error(String(value)));
  }
}

function validateInt64String(value: string, ctx: ValidationContext): void {
  if (!INTEGER_STRING_REGEX.test(value)) {
    ctx.addError(formatInt64InvalidError(value));
    return;
  }
  const bigint = BigInt(value);
  if (bigint < INT64_MIN || bigint > INT64_MAX) {
    ctx.addError(formatInt64ExceedsError(value));
  }
}

function validateInt64(args: ValidationArgs): void {
  const { value, ctx } = args;

  if (typeof value === 'number') {
    validateInt64Number(value, ctx);
    return;
  }

  if (typeof value === 'string') {
    validateInt64String(value, ctx);
    return;
  }

  if (typeof value === 'bigint') {
    if (value < INT64_MIN || value > INT64_MAX) {
      ctx.addError(formatInt64ExceedsError(value));
    }
    return;
  }

  ctx.addError(formatInt64Error(typeof value));
}

function validateFloat(args: ValidationArgs): void {
  const { value, ctx } = args;
  if (typeof value !== 'number') {
    ctx.addError(formatFloatError(typeof value));
    return;
  }

  const abs = Math.abs(value);
  if (Number.isNaN(value) || !Number.isFinite(value) || abs > FLOAT32_MAX) {
    ctx.addError(formatFloatError(String(value)));
  }
}

function validateDouble(args: ValidationArgs): void {
  const { value, ctx } = args;
  if (
    typeof value !== 'number' ||
    Number.isNaN(value) ||
    !Number.isFinite(value)
  ) {
    ctx.addError(formatDoubleError(value));
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
