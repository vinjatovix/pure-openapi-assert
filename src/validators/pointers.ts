import { isDeepStrictEqual } from 'node:util';
import type { OpenAPIV3 } from 'openapi-types';
import {
  JSON_POINTER_SLASH_REGEX,
  JSON_POINTER_TILDE_REGEX
} from '../core/constants.js';
import { FIFOCache } from '../core/FIFOCache.js';
import { isSchemaObject } from '../core/utils.js';
import { ValidationContext } from '../core/ValidationContext.js';
import { stateManager } from '../core/StateManager.js';

function getOrInitSpecCache(
  spec: OpenAPIV3.Document
): FIFOCache<string, unknown> {
  return stateManager.getOrInitPointerCache(spec);
}

function traversePointerParts(
  spec: OpenAPIV3.Document,
  parts: string[]
): unknown {
  let current: unknown = spec;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    const decodedKey = part.includes('~')
      ? part
          .replace(JSON_POINTER_SLASH_REGEX, '/')
          .replace(JSON_POINTER_TILDE_REGEX, '~')
      : part;
    if (!Object.prototype.hasOwnProperty.call(current, decodedKey)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[decodedKey];
  }

  return current;
}

export function resolvePointer(
  spec: OpenAPIV3.Document,
  pointer: string
): unknown {
  if (pointer === '#') {
    return spec;
  }

  if (!pointer.startsWith('#/')) {
    return undefined;
  }

  const specCache = getOrInitSpecCache(spec);
  if (specCache.has(pointer)) {
    return specCache.get(pointer);
  }

  const rawParts = pointer.slice(2).split('/');
  const parts = rawParts.map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  const target = traversePointerParts(spec, parts);

  specCache.set(pointer, target);

  return target;
}

function getOrInitPointerMatchCache(
  spec: OpenAPIV3.Document,
  schemas: Array<OpenAPIV3.SchemaObject>
): FIFOCache<string, OpenAPIV3.SchemaObject | undefined> {
  return stateManager.getOrInitSchemaPointerMatchCache(spec, schemas);
}

function findBestSchemaMatch(
  schemas: Array<OpenAPIV3.SchemaObject>,
  target: OpenAPIV3.SchemaObject
): OpenAPIV3.SchemaObject | undefined {
  const refMatch = schemas.find((s) => s === target);
  if (refMatch) return refMatch;

  let titleMatch: OpenAPIV3.SchemaObject | undefined;
  let titleMatchCount = 0;

  for (const schema of schemas) {
    if (isDeepStrictEqual(schema, target)) {
      return schema;
    }
    if (schema.title !== undefined && schema.title === target.title) {
      titleMatch = schema;
      titleMatchCount++;
    }
  }

  return titleMatchCount === 1 ? titleMatch : undefined;
}

export function findSchemaByPointer(args: {
  spec: OpenAPIV3.Document;
  pointer: string;
  schemas: Array<OpenAPIV3.SchemaObject>;
}): OpenAPIV3.SchemaObject | undefined {
  const { spec, pointer, schemas } = args;
  const cache = getOrInitPointerMatchCache(spec, schemas);
  if (cache.has(pointer)) {
    return cache.get(pointer);
  }

  const fullPointer = pointer.startsWith('#/')
    ? pointer
    : `#/components/schemas/${pointer}`;
  const target = resolvePointer(spec, fullPointer);

  if (!isSchemaObject(target)) {
    cache.set(pointer, undefined);
    return undefined;
  }

  const match = findBestSchemaMatch(schemas, target);
  cache.set(pointer, match);

  return match;
}

export function resolveSchema(
  schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject | undefined,
  ctx?: ValidationContext
): OpenAPIV3.SchemaObject | undefined {
  if (!schema) {
    return undefined;
  }

  if (isSchemaObject(schema)) {
    return schema;
  }

  if (ctx?.spec) {
    const resolved = resolvePointer(ctx.spec, schema.$ref);
    if (isSchemaObject(resolved)) {
      return resolved;
    }
  }

  const refMsg = `Unresolved $ref: '${schema.$ref}'. Ensure your OpenAPI spec is fully dereferenced.`;

  if (ctx) {
    ctx.addError(refMsg, { code: 'UNRESOLVED_REF' });
  } else {
    throw new Error(refMsg);
  }

  return undefined;
}
