import type { OpenAPIV3 } from 'openapi-types';
import { isArraySchema, isPlainObject } from './utils.js';
import type { ValidationContext } from './ValidationContext.js';
import type { ResolvedParameter } from '../openapi/router.js';

export interface DeserializeParameterArgs {
  location: 'path' | 'query' | 'header';
  style: string;
  explode: boolean;
  schema: OpenAPIV3.SchemaObject;
  value: unknown;
}

export interface BracketParseResult {
  rootKey: string;
  segments: string[];
}

export interface DeserializeQueryArgs {
  declaredParameters: ResolvedParameter[];
  queryInput: Record<string, unknown> | URLSearchParams | string | undefined;
  ctx: ValidationContext;
}

interface RawQueryEntry {
  key: string;
  value: unknown;
}

const FORBIDDEN_PROTOTYPE_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype'
]);

function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_PROTOTYPE_KEYS.has(key);
}

function isPrototypePollutionKey(key: string): boolean {
  return (
    key.includes('__proto__') ||
    key.includes('constructor') ||
    key.includes('prototype')
  );
}

export function parseBracketKey(rawKey: string): BracketParseResult | null {
  if (!rawKey.includes('[') && !rawKey.includes(']')) {
    return null;
  }

  const rootMatch = rawKey.match(/^([^[\]]+)/);
  if (!rootMatch || !rootMatch[1]) {
    return null;
  }

  const rootKey = rootMatch[1];
  if (isForbiddenKey(rootKey)) {
    return null;
  }

  const remainder = rawKey.slice(rootKey.length);
  if (!/^(\[[^[\]]*\])+$/.test(remainder)) {
    return null;
  }

  const segments: string[] = [];
  const segmentRegex = /\[([^[\]]*)\]/g;
  let match: RegExpExecArray | null;
  while ((match = segmentRegex.exec(remainder)) !== null) {
    const seg = match[1];
    if (seg !== undefined) {
      if (isForbiddenKey(seg)) {
        return null;
      }
      segments.push(seg);
    }
  }

  return { rootKey, segments };
}

function assignNestedSegment(
  target: Record<string, unknown>,
  segments: string[],
  value: unknown
): void {
  let current: Record<string, unknown> = target;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    if (i === segments.length - 1) {
      current[segment] = value;
    } else {
      if (!isPlainObject(current[segment])) {
        current[segment] = Object.create(null) as Record<string, unknown>;
      }
      current = current[segment] as Record<string, unknown>;
    }
  }
}

function collectRawQueryEntries(
  queryInput: Record<string, unknown> | URLSearchParams | string | undefined
): RawQueryEntry[] {
  if (queryInput === undefined || queryInput === null) {
    return [];
  }
  if (typeof queryInput === 'string') {
    const stripped = queryInput.startsWith('?')
      ? queryInput.slice(1)
      : queryInput;
    if (stripped === '') return [];
    const searchParams = new URLSearchParams(stripped);
    return Array.from(searchParams.entries()).map(([key, value]) => ({
      key,
      value
    }));
  }
  if (queryInput instanceof URLSearchParams) {
    return Array.from(queryInput.entries()).map(([key, value]) => ({
      key,
      value
    }));
  }
  if (isPlainObject(queryInput)) {
    return Object.entries(queryInput).map(([key, value]) => ({ key, value }));
  }
  return [];
}

function reportMalformedBracket(rawKey: string, ctx: ValidationContext): void {
  const rootMatch = rawKey.match(/^([^[\]]+)/);
  ctx.pushPath('query');
  if (rootMatch?.[1]) {
    ctx.pushPath(rootMatch[1]);
  }
  ctx.addError(`Malformed bracket syntax in query parameter '${rawKey}'`);
  if (rootMatch?.[1]) {
    ctx.popPath();
  }
  ctx.popPath();
}

function processBracketEntry(
  bracket: BracketParseResult,
  entry: RawQueryEntry,
  param: ResolvedParameter | undefined,
  result: Record<string, unknown>
): void {
  const { rootKey, segments } = bracket;
  if (param?.schema.type === 'array') {
    if (!Array.isArray(result[rootKey])) {
      result[rootKey] = [];
    }
    (result[rootKey] as unknown[]).push(entry.value);
  } else {
    if (!isPlainObject(result[rootKey])) {
      result[rootKey] = Object.create(null) as Record<string, unknown>;
    }
    assignNestedSegment(
      result[rootKey] as Record<string, unknown>,
      segments,
      entry.value
    );
  }
}

function processFlatEntry(
  entry: RawQueryEntry,
  param: ResolvedParameter | undefined,
  ctx: ValidationContext,
  result: Record<string, unknown>
): void {
  const rootKey = entry.key;
  if (param?.schema.type === 'object' && typeof entry.value === 'string') {
    ctx.pushPath('query');
    ctx.pushPath(rootKey);
    ctx.addError('Expected type object, received string');
    ctx.popPath();
    ctx.popPath();
    result[rootKey] = entry.value;
    return;
  }

  if (isPlainObject(entry.value)) {
    result[rootKey] = entry.value;
  } else if (result[rootKey] !== undefined) {
    if (Array.isArray(result[rootKey])) {
      (result[rootKey] as unknown[]).push(entry.value);
    } else {
      result[rootKey] = [result[rootKey], entry.value];
    }
  } else {
    result[rootKey] = entry.value;
  }
}

export function deserializeQueryParameters(
  args: DeserializeQueryArgs
): Record<string, unknown> {
  const { declaredParameters, queryInput, ctx } = args;
  const entries = collectRawQueryEntries(queryInput);
  if (entries.length === 0) {
    return Object.create(null) as Record<string, unknown>;
  }

  const paramMap = new Map<string, ResolvedParameter>();
  for (const param of declaredParameters) {
    if (param.in === 'query') {
      paramMap.set(param.name, param);
    }
  }

  const result: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;

  for (const entry of entries) {
    const bracket = parseBracketKey(entry.key);
    if (bracket) {
      const param = paramMap.get(bracket.rootKey);
      processBracketEntry(bracket, entry, param, result);
    } else if (entry.key.includes('[') || entry.key.includes(']')) {
      if (!isPrototypePollutionKey(entry.key)) {
        reportMalformedBracket(entry.key, ctx);
      }
    } else {
      const param = paramMap.get(entry.key);
      processFlatEntry(entry, param, ctx, result);
    }
  }

  return result;
}

const ARRAY_DELIMITERS: Record<string, string> = {
  form: ',',
  simple: ',',
  spaceDelimited: ' ',
  pipeDelimited: '|'
};

function stripPrefix(value: string, style: string): string {
  if (style === 'label') {
    return value.startsWith('.') ? value.slice(1) : value;
  }
  if (style === 'matrix') {
    return value.startsWith(';') ? value.slice(1) : value;
  }
  return value;
}

function afterFirstEquals(value: string): string {
  const eq = value.indexOf('=');
  return eq >= 0 ? value.slice(eq + 1) : value;
}

function parseArrayFromString(
  value: string,
  style: string,
  explode: boolean
): string[] {
  const stripped = stripPrefix(value, style);

  if (style === 'label') {
    return stripped.split(explode ? '.' : ',');
  }
  if (style === 'matrix') {
    if (explode) {
      return stripped.split(';').map((segment) => afterFirstEquals(segment));
    }
    return afterFirstEquals(stripped).split(',');
  }

  const delimiter = ARRAY_DELIMITERS[style] ?? ',';
  return stripped.split(delimiter);
}

function objectFromKeyValueSegments(
  segments: string[]
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const segment of segments) {
    const eq = segment.indexOf('=');
    if (eq >= 0) {
      result[segment.slice(0, eq)] = segment.slice(eq + 1);
    }
  }
  return result;
}

function objectFromFlatPairs(parts: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const key = parts[i];
    const val = parts[i + 1];
    if (key !== undefined && val !== undefined) {
      result[key] = val;
    }
  }
  return result;
}

function parseObjectFromString(
  value: string,
  style: string,
  explode: boolean
): Record<string, string> {
  const stripped = stripPrefix(value, style);

  if (style === 'matrix' && explode) {
    return objectFromKeyValueSegments(stripped.split(';'));
  }
  if (style === 'label' && explode) {
    return objectFromKeyValueSegments(stripped.split('.'));
  }
  if (explode) {
    return objectFromKeyValueSegments(stripped.split(','));
  }

  const flat = style === 'matrix' ? afterFirstEquals(stripped) : stripped;
  return objectFromFlatPairs(flat.split(','));
}

/**
 * Converts the transport representation of a parameter value into a structured
 * value (scalar, array or object) according to the OpenAPI 3.0 `style`/`explode`
 * matrix, before type coercion and schema validation.
 *
 * @internal
 */
export function deserializeParameter(args: DeserializeParameterArgs): unknown {
  const { style, explode, schema, value } = args;

  if (isArraySchema(schema)) {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string') {
      return parseArrayFromString(value, style, explode);
    }
    return value;
  }

  if (schema.type === 'object') {
    if (isPlainObject(value)) {
      return value;
    }
    if (typeof value === 'string') {
      return parseObjectFromString(value, style, explode);
    }
    return value;
  }

  return value;
}
