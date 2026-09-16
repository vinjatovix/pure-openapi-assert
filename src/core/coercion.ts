import type { OpenAPIV3 } from 'openapi-types';
import { validateShape } from '../validators/index.js';
import { INTEGER_STRING_REGEX } from './constants.js';
import { CycleTracker, CYCLE_DETECTED } from './CycleTracker.js';
import { isArraySchema, isPlainObject } from './utils.js';
import { ValidationContext } from './ValidationContext.js';
import { resolveSchema } from '../validators/pointers.js';

/** @internal */
export const BIGINT_PREFIX = `__bigint_${Math.random().toString(36).slice(2, 8)}__`;

function getEscapeChar(
  char: string,
  nextChar: string | undefined,
  inQuotes: boolean
): string | undefined {
  if (inQuotes && char === '\\' && (nextChar === '"' || nextChar === '\\')) {
    return nextChar;
  }
  return undefined;
}

function processCSVChar(
  char: string,
  state: {
    current: string;
    inQuotes: boolean;
    wasQuoted: boolean;
    doneQuoted: boolean;
  }
): void {
  if (char === '"') {
    if (!state.inQuotes && state.current.trim() === '') {
      state.current = '';
      state.wasQuoted = true;
      state.inQuotes = true;
    } else if (state.inQuotes) {
      state.inQuotes = false;
      state.doneQuoted = true;
    } else if (!state.doneQuoted) {
      state.current += char;
    }
  } else if (!state.doneQuoted) {
    state.current += char;
  }
}

/** @internal */
export function parseCSVHeader(value: string): string[] {
  const parts: string[] = [];
  const state = {
    current: '',
    inQuotes: false,
    wasQuoted: false,
    doneQuoted: false
  };

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === undefined) continue;

    const escapeChar = getEscapeChar(char, value[i + 1], state.inQuotes);
    if (escapeChar !== undefined) {
      state.current += escapeChar;
      i++;
    } else if (char === ',' && !state.inQuotes) {
      parts.push(state.wasQuoted ? state.current : state.current.trim());
      state.current = '';
      state.wasQuoted = false;
      state.doneQuoted = false;
    } else {
      processCSVChar(char, state);
    }
  }
  parts.push(state.wasQuoted ? state.current : state.current.trim());
  return parts;
}

/** @internal */
export function coerceIntegerString(trimmed: string): unknown {
  if (!INTEGER_STRING_REGEX.test(trimmed)) {
    return undefined;
  }
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num)) {
    return BigInt(trimmed);
  }
  return num;
}

const JSON_STRING_OR_NUMBER_REGEX =
  /"(?:[^"\\]|\\.)*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

function hasTrailingFractionDigits(digits: string, count: number): boolean {
  if (count <= 0) return false;

  const clean = digits.replace(/^0+/, '');
  if (clean === '') return false;

  const padded = clean.padStart(count, '0');
  const fraction = padded.slice(-count);

  return /[1-9]/.test(fraction);
}

function isNonIntegerFloat(match: string): boolean {
  const parts = match.split(/[eE]/);
  const significand = parts[0] || '';
  const expMatch = parts[1];
  const exp = expMatch ? parseInt(expMatch, 10) : 0;

  if (!significand.includes('.')) {
    return (
      exp < 0 &&
      hasTrailingFractionDigits(significand.replace(/^-/, ''), Math.abs(exp))
    );
  }

  const sigParts = significand.split('.');
  const intPart = sigParts[0]?.replace(/^-/, '') || '';
  const fracPart = sigParts[1] || '';
  const f_len = fracPart.length;

  const eff_exp = exp - f_len;
  if (eff_exp >= 0) return false;

  return hasTrailingFractionDigits(intPart + fracPart, Math.abs(eff_exp));
}

function getSignificantDigitsCount(match: string): number {
  const parts = match.split(/[eE]/);
  const significand = parts[0] || '';
  const clean = significand
    .replace(/^-/, '')
    .replace('.', '')
    .replace(/^0+/, '');
  return clean.length;
}

function isUnsafeFloatForLossless(match: string, num: number): boolean {
  const isNonInt = isNonIntegerFloat(match);
  const exceedsMagnitude = Math.abs(num) > Number.MAX_SAFE_INTEGER;

  if (exceedsMagnitude) {
    return isNonInt || getSignificantDigitsCount(match) > 15;
  }
  return isNonInt && Number.isInteger(num);
}

/** @internal */
export function losslessReplace(str: string): string {
  return str.replace(JSON_STRING_OR_NUMBER_REGEX, (match) => {
    if (match.startsWith('"')) {
      const content = match.slice(1, -1);
      if (content.startsWith(BIGINT_PREFIX)) {
        return `"${BIGINT_PREFIX}_escaped_${content}"`;
      }
      return match;
    }

    const isFloat =
      match.includes('.') || match.includes('e') || match.includes('E');

    if (isFloat) {
      if (isUnsafeFloatForLossless(match, Number(match))) {
        return `"${BIGINT_PREFIX}${match}"`;
      }
      return match;
    }

    if (!Number.isSafeInteger(Number(match))) {
      return `"${BIGINT_PREFIX}${match}"`;
    }

    return match;
  });
}

/** @internal */
export function parseJSONLossless(str: string): unknown {
  const trimmed = str.trim();
  const coercedInt = /^-?(?:0|[1-9]\d*)$/.test(trimmed)
    ? coerceIntegerString(trimmed)
    : undefined;
  if (coercedInt !== undefined) {
    return coercedInt;
  }

  const replaced = losslessReplace(trimmed);

  return JSON.parse(replaced, (_, value: unknown) => {
    if (isPlainObject(value)) {
      const restored: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (k.startsWith(`${BIGINT_PREFIX}_escaped_`)) {
          const originalKey = k.slice(`${BIGINT_PREFIX}_escaped_`.length);
          restored[originalKey] = v;
        } else {
          restored[k] = v;
        }
      }
      return restored;
    }
    if (typeof value === 'string') {
      if (value.startsWith(`${BIGINT_PREFIX}_escaped_`)) {
        return value.slice(`${BIGINT_PREFIX}_escaped_`.length);
      }
      if (value.startsWith(BIGINT_PREFIX)) {
        const raw = value.slice(BIGINT_PREFIX.length);
        if (raw.includes('.') || raw.includes('e') || raw.includes('E')) {
          return raw;
        }
        return BigInt(raw);
      }
    }
    return value;
  });
}

function isPrecisionLossy(
  trimmed: string,
  schemaType: string | undefined
): boolean {
  if (schemaType === 'integer') {
    return isNonIntegerFloat(trimmed);
  }
  if (schemaType === 'number') {
    const num = Number(trimmed);
    if (Number.isNaN(num)) return true;
    return isUnsafeFloatForLossless(trimmed, num);
  }
  return false;
}

function coerceNumber(value: unknown, schema: OpenAPIV3.SchemaObject): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (trimmed === '') return value;

  const intResult = coerceIntegerString(trimmed);
  if (intResult !== undefined) {
    return intResult;
  }

  if (isPrecisionLossy(trimmed, schema.type)) {
    return value;
  }

  const num = Number(trimmed);
  if (Number.isNaN(num)) return value;
  if (schema.type === 'integer' && !Number.isSafeInteger(num)) return value;
  return num;
}

function coerceBoolean(value: unknown): unknown {
  if (typeof value === 'boolean' || typeof value !== 'string') {
    return value;
  }

  const lower = value.toLowerCase().trim();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  return value;
}

interface CoerceArrayArgs {
  value: unknown;
  schema: OpenAPIV3.SchemaObject;
  tracker: CycleTracker;
  customFormats?: Record<string, (val: string) => boolean> | undefined;
  ctx?: ValidationContext | undefined;
}

/** @internal */
export function coerceArray(args: CoerceArrayArgs): unknown {
  const { value, schema, tracker, customFormats, ctx } = args;
  if (!isArraySchema(schema)) return value;

  const itemSchema = schema.items;

  if (Array.isArray(value)) {
    const valueArray: unknown[] = value;
    return valueArray.map((v) =>
      coerceHeaderValue({
        value: v,
        schema: itemSchema,
        tracker,
        customFormats,
        ctx
      })
    );
  }
  if (typeof value !== 'string') {
    return value;
  }

  const parts = parseCSVHeader(value);
  return parts.map((v) =>
    coerceHeaderValue({
      value: v,
      schema: itemSchema,
      tracker,
      customFormats,
      ctx
    })
  );
}

interface CoerceSingleValueArgs {
  value: unknown;
  schema: OpenAPIV3.SchemaObject;
  tracker: CycleTracker;
  customFormats?: Record<string, (val: string) => boolean> | undefined;
  ctx?: ValidationContext | undefined;
}

function coerceSingleValue(args: CoerceSingleValueArgs): unknown {
  const { value, schema, tracker, customFormats, ctx } = args;
  switch (schema.type) {
    case 'integer':
    case 'number':
      return coerceNumber(value, schema);
    case 'boolean':
      return coerceBoolean(value);
    case 'array':
      return coerceArray({ value, schema, tracker, customFormats, ctx });
    default:
      if (isArraySchema(schema)) {
        return coerceArray({ value, schema, tracker, customFormats, ctx });
      }
      return value;
  }
}

interface CoerceComposedHeaderValueArgs {
  value: unknown;
  schema: OpenAPIV3.SchemaObject;
  tracker: CycleTracker;
  customFormats?: Record<string, (val: string) => boolean> | undefined;
  ctx?: ValidationContext | undefined;
  validationBoundarySchema?: OpenAPIV3.SchemaObject | undefined;
}

function coerceAllOfHeaderValue(
  args: CoerceComposedHeaderValueArgs,
  initialValue: unknown
): unknown {
  const { schema, tracker, customFormats, ctx, validationBoundarySchema } =
    args;
  let coerced = initialValue;
  if (schema.allOf) {
    for (const sub of schema.allOf) {
      const resolvedSub = resolveSchema(sub, ctx);
      if (resolvedSub) {
        coerced = coerceHeaderValue({
          value: coerced,
          schema: resolvedSub,
          tracker,
          customFormats,
          ctx,
          validationBoundarySchema
        });
      }
    }
  }
  return coerced;
}

function tryCoerceSubSchema(
  sub: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject,
  initialValue: unknown,
  args: CoerceComposedHeaderValueArgs,
  parentSchema: OpenAPIV3.SchemaObject
): unknown {
  const { tracker, customFormats, ctx, validationBoundarySchema } = args;
  const resolvedSub = resolveSchema(sub, ctx);
  if (resolvedSub) {
    const candidateCoerced = coerceHeaderValue({
      value: initialValue,
      schema: resolvedSub,
      tracker,
      customFormats,
      ctx,
      validationBoundarySchema
    });
    const tempCtx = new ValidationContext({ spec: ctx?.spec });
    validateShape({
      value: candidateCoerced,
      schema: validationBoundarySchema || parentSchema,
      ctx: tempCtx,
      validateShape,
      customFormats
    });

    if (!tempCtx.hasErrors()) {
      return candidateCoerced;
    }
  }
  return undefined;
}

function coerceOneOfAnyOfHeaderValue(
  args: CoerceComposedHeaderValueArgs,
  initialValue: unknown
): unknown {
  const { schema: parentSchema } = args;

  for (const list of [parentSchema.oneOf, parentSchema.anyOf]) {
    if (!list) continue;
    for (let i = 0; i < list.length; i++) {
      const sub = list[i];
      if (sub) {
        const coerced = tryCoerceSubSchema(
          sub,
          initialValue,
          args,
          parentSchema
        );
        if (coerced !== undefined) {
          return coerced;
        }
      }
    }
  }

  return initialValue;
}

function hasPolymorphicSchema(
  schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject | undefined,
  ctx?: ValidationContext,
  visited = new Set<unknown>()
): boolean {
  if (!schema || visited.has(schema)) {
    return false;
  }

  visited.add(schema);
  const resolved = resolveSchema(schema, ctx);
  if (!resolved) {
    return false;
  }
  if (resolved.oneOf || resolved.anyOf) {
    return true;
  }
  if (resolved.allOf) {
    return resolved.allOf.some((sub) =>
      hasPolymorphicSchema(sub, ctx, visited)
    );
  }
  return false;
}

function shouldEarlyReturnCoerced(
  coerced: unknown,
  parentSchema: OpenAPIV3.SchemaObject,
  validationBoundarySchema: OpenAPIV3.SchemaObject | undefined,
  customFormats: Record<string, (val: string) => boolean> | undefined,
  ctx?: ValidationContext
): boolean {
  if (!hasPolymorphicSchema(parentSchema, ctx)) {
    return false;
  }
  // NOTE: GC Pressure vs Type Isolation:
  // Instantiating a new ValidationContext on the hot path of coercion (headers/query parameters)
  // introduces minor garbage collector pressure. However, this is necessary to ensure validation dry-runs
  // under a 'not' composition block do not contaminate the parent validation context's error log.
  // Performance benchmarks show that execution latency remains well below the sub-millisecond SLO.
  // If deeply nested schemas trigger performance issues in the future, context pooling can be evaluated.
  const tempCtx = new ValidationContext({ spec: ctx?.spec });
  validateShape({
    value: coerced,
    schema: validationBoundarySchema ?? parentSchema,
    ctx: tempCtx,
    validateShape,
    customFormats
  });
  return !tempCtx.hasErrors();
}

function getTargetSchema(
  parentSchema: OpenAPIV3.SchemaObject,
  validationBoundarySchema: OpenAPIV3.SchemaObject | undefined
): OpenAPIV3.SchemaObject {
  if (validationBoundarySchema && validationBoundarySchema !== parentSchema) {
    return validationBoundarySchema;
  }
  const parentSchemaWithoutNot = { ...parentSchema };
  delete parentSchemaWithoutNot.not;
  return parentSchemaWithoutNot;
}

function tryIsolateNotCoercion(
  args: CoerceComposedHeaderValueArgs,
  coerced: unknown
): unknown {
  const {
    schema: parentSchema,
    tracker,
    customFormats,
    ctx,
    validationBoundarySchema
  } = args;
  if (!parentSchema.not) {
    return coerced;
  }

  if (
    shouldEarlyReturnCoerced(
      coerced,
      parentSchema,
      validationBoundarySchema,
      customFormats,
      ctx
    )
  ) {
    return coerced;
  }

  const resolvedNot = resolveSchema(parentSchema.not, ctx);
  if (!resolvedNot) {
    return coerced;
  }

  const candidateCoerced = coerceHeaderValue({
    value: coerced,
    schema: resolvedNot,
    tracker,
    customFormats,
    ctx,
    validationBoundarySchema
  });

  const targetSchema = getTargetSchema(parentSchema, validationBoundarySchema);

  // NOTE: GC Pressure vs Type Isolation:
  // Instantiating a new ValidationContext here ensures the candidate coercion validation remains
  // isolated from the parent context.
  const tempCtx = new ValidationContext({ spec: ctx?.spec });
  validateShape({
    value: candidateCoerced,
    schema: targetSchema,
    ctx: tempCtx,
    validateShape,
    customFormats
  });

  if (tempCtx.hasErrors()) {
    return coerced;
  }

  return candidateCoerced;
}

function coerceComposedHeaderValue(
  args: CoerceComposedHeaderValueArgs
): unknown {
  let coerced = coerceAllOfHeaderValue(args, args.value);
  coerced = coerceOneOfAnyOfHeaderValue(args, coerced);
  coerced = tryIsolateNotCoercion(args, coerced);
  return coerced;
}

/** @internal */
export interface CoerceHeaderValueArgs {
  value: unknown;
  schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject | undefined;
  tracker?: CycleTracker | undefined;
  customFormats?: Record<string, (val: string) => boolean> | undefined;
  ctx?: ValidationContext | undefined;
  validationBoundarySchema?: OpenAPIV3.SchemaObject | undefined;
}

/** @internal */
export function coerceHeaderValue(args: CoerceHeaderValueArgs): unknown {
  const {
    value,
    schema: rawSchema,
    tracker,
    customFormats,
    ctx,
    validationBoundarySchema
  } = args;
  if (!rawSchema) {
    return value;
  }
  const schema = resolveSchema(rawSchema, ctx);
  if (!schema) {
    return value;
  }

  const activeTracker = tracker ?? new CycleTracker();
  const activeValidationBoundary = validationBoundarySchema ?? schema;

  if (!schema.type) {
    const result = activeTracker.track(schema, () => {
      let coerced = value;
      if ('items' in schema && schema.items !== undefined) {
        if (Array.isArray(value)) {
          const valueArray: unknown[] = value;
          const itemSchema = schema.items;
          if (itemSchema !== null) {
            coerced = valueArray.map((v) =>
              coerceHeaderValue({
                value: v,
                schema: itemSchema,
                tracker: activeTracker,
                customFormats,
                ctx,
                validationBoundarySchema: undefined
              })
            );
          }
        } else if (typeof value === 'string') {
          coerced = coerceArray({
            value,
            schema,
            tracker: activeTracker,
            customFormats,
            ctx
          });
        }
      }

      if (
        schema.allOf ||
        schema.anyOf ||
        schema.oneOf ||
        schema.not !== undefined
      ) {
        coerced = coerceComposedHeaderValue({
          value: coerced,
          schema,
          tracker: activeTracker,
          customFormats,
          ctx,
          validationBoundarySchema: activeValidationBoundary
        });
      }
      return coerced;
    });
    return result === CYCLE_DETECTED ? value : result;
  }

  const result = activeTracker.track(schema, () => {
    let coerced: unknown;
    if (Array.isArray(value)) {
      const valueArray: unknown[] = value;
      if (isArraySchema(schema)) {
        const itemSchema = schema.items;
        coerced = valueArray.map((v) =>
          coerceHeaderValue({
            value: v,
            schema: itemSchema,
            tracker: activeTracker,
            customFormats,
            ctx,
            validationBoundarySchema: undefined
          })
        );
      } else {
        coerced = valueArray;
      }
    } else {
      coerced = coerceSingleValue({
        value,
        schema,
        tracker: activeTracker,
        customFormats,
        ctx
      });
    }

    if (
      schema.allOf ||
      schema.anyOf ||
      schema.oneOf ||
      schema.not !== undefined
    ) {
      coerced = coerceComposedHeaderValue({
        value: coerced,
        schema,
        tracker: activeTracker,
        customFormats,
        ctx,
        validationBoundarySchema: activeValidationBoundary
      });
    }

    return coerced;
  });

  if (result === CYCLE_DETECTED) {
    return value;
  }

  return result;
}

/** @internal */
export function normalizeHeaders(
  headers: Record<string, string | string[]> | undefined
): Record<string, string | string[]> {
  if (!headers) {
    return Object.create(null) as Record<string, string | string[]>;
  }
  const result = Object.create(null) as Record<string, string | string[]>;
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    const existing = result[lowerKey];
    if (existing !== undefined) {
      result[lowerKey] = Array.isArray(existing)
        ? existing.concat(value)
        : Array.isArray(value)
          ? [existing, ...value]
          : [existing, value];
    } else {
      result[lowerKey] = value;
    }
  }
  return result;
}
