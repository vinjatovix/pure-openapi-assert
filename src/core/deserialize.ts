import type { OpenAPIV3 } from 'openapi-types';
import { isArraySchema, isPlainObject } from './utils.js';

export interface DeserializeParameterArgs {
  location: 'path' | 'query' | 'header';
  style: string;
  explode: boolean;
  schema: OpenAPIV3.SchemaObject;
  value: unknown;
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
