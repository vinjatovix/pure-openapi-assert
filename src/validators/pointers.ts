import { isDeepStrictEqual } from 'node:util';
import type { OpenAPIV3 } from 'openapi-types';
import {
  JSON_POINTER_SLASH_REGEX,
  JSON_POINTER_TILDE_REGEX
} from '../core/constants.js';
import { MAX_CACHE_SIZE } from '../core/constants.js';
import { isSchemaObject } from '../core/utils.js';

const pointerCache = new WeakMap<object, Map<string, unknown>>();
const schemaPointerMatchCache = new WeakMap<
  OpenAPIV3.Document,
  WeakMap<
    Array<OpenAPIV3.SchemaObject>,
    Map<string, OpenAPIV3.SchemaObject | undefined>
  >
>();

function getOrInitSpecCache(spec: OpenAPIV3.Document): Map<string, unknown> {
  let specCache = pointerCache.get(spec);
  if (!specCache) {
    specCache = new Map<string, unknown>();
    pointerCache.set(spec, specCache);
  }

  return specCache;
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

  if (specCache.size >= MAX_CACHE_SIZE) {
    const firstKey = specCache.keys().next().value;
    specCache.delete(firstKey as string);
  }
  specCache.set(pointer, target);

  return target;
}

function getOrInitPointerMatchCache(
  spec: OpenAPIV3.Document,
  schemas: Array<OpenAPIV3.SchemaObject>
): Map<string, OpenAPIV3.SchemaObject | undefined> {
  let docCache = schemaPointerMatchCache.get(spec);
  if (!docCache) {
    docCache = new WeakMap();
    schemaPointerMatchCache.set(spec, docCache);
  }

  let cache = docCache.get(schemas);
  if (!cache) {
    cache = new Map<string, OpenAPIV3.SchemaObject | undefined>();
    docCache.set(schemas, cache);
  }

  return cache;
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
    if (cache.size >= MAX_CACHE_SIZE) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey as string);
    }
    cache.set(pointer, undefined);
    return undefined;
  }

  const match = findBestSchemaMatch(schemas, target);
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey as string);
  }
  cache.set(pointer, match);

  return match;
}
