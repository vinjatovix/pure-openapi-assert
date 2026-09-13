import { isDeepStrictEqual } from 'node:util';
import type { OpenAPIV3 } from 'openapi-types';
import { INTEGER_STRING_REGEX } from '../core/constants.js';
import { type ValidationArgs } from './args.js';
import { validateStringConstraints } from './string.js';
import {
  validateNumberConstraints,
  validateNumberFormatConstraint
} from './number.js';

export const typeValidators: Record<
  'string' | 'number' | 'integer' | 'boolean',
  (value: unknown) => boolean
> = {
  string: (val) => typeof val === 'string',
  number: (val) => typeof val === 'number' && Number.isFinite(val),
  integer: (val) => Number.isInteger(val) || typeof val === 'bigint',
  boolean: (val) => typeof val === 'boolean'
};

const enumSetsCache = new WeakMap<OpenAPIV3.SchemaObject, Set<unknown>>();

export function validateEnum(args: ValidationArgs): void {
  const { value, schema, ctx } = args;
  if (!schema.enum) return;

  let enumSet = enumSetsCache.get(schema);
  if (!enumSet) {
    enumSet = new Set(schema.enum);
    enumSetsCache.set(schema, enumSet);
  }

  if (!enumSet.has(value)) {
    ctx.addError(
      `Expected one of [${schema.enum.join(', ')}], received ${JSON.stringify(value)}`
    );
  }
}

export function validateConst(args: ValidationArgs): void {
  const { value, schema, ctx } = args;
  const withConst = schema as OpenAPIV3.SchemaObject & { const?: unknown };
  if (withConst.const === undefined) return;

  if (value === withConst.const) return;

  if (!isDeepStrictEqual(value, withConst.const)) {
    ctx.addError(
      `Expected exactly ${JSON.stringify(withConst.const)}, received ${JSON.stringify(value)}`
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
  const isTypeValid =
    expectedType && Object.hasOwn(typeValidators, expectedType)
      ? typeValidators[expectedType as keyof typeof typeValidators]
      : undefined;

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

export function validateBaseType(args: ValidationArgs): void {
  if (!validateTypeCheck(args)) {
    return;
  }

  const { value, schema } = args;

  if (typeof value === 'string') {
    validateStringConstraints(args as ValidationArgs<string>);
    if (schema.format === 'int64') {
      validateNumberConstraints(args);
    } else if (
      schema.format &&
      ['int32', 'float', 'double'].includes(schema.format)
    ) {
      validateNumberFormatConstraint(args);
    }
  } else if (typeof value === 'number' || typeof value === 'bigint') {
    validateNumberConstraints(args);
  } else {
    if (
      schema.format &&
      ['int32', 'int64', 'float', 'double'].includes(schema.format)
    ) {
      validateNumberFormatConstraint(args);
    }
  }
}
