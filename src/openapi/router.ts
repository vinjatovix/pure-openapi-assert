import type { OpenAPIV3 } from 'openapi-types';
import {
  DEFAULT_CONTENT_TYPE,
  DUMMY_BASE_URL,
  MAX_CACHE_SIZE
} from '../core/constants.js';

const regexCache = new Map<string, RegExp>();

const escapeRegex = (str: string): string =>
  str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizePath = (p: string): string => p.replace(/\/+$/, '');

export function convertOpenApiPathToRegExp(openApiPath: string): RegExp {
  const cacheKey = `path:${openApiPath}`;
  const cached = regexCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  if (regexCache.size >= MAX_CACHE_SIZE) {
    const firstKey = regexCache.keys().next().value;
    regexCache.delete(firstKey as string);
  }
  const escapedPath = escapeRegex(openApiPath);
  const regexPattern = escapedPath.replace(/\\{[^\\}]+\\}/g, '[^/]+');
  const rx = new RegExp('^' + regexPattern + '$');
  regexCache.set(cacheKey, rx);
  return rx;
}

function findExactPathMatch(
  spec: OpenAPIV3.Document,
  normalizedPath: string
): string | null {
  const pathItem = spec.paths[normalizedPath];
  if (!pathItem) {
    return null;
  }
  return normalizedPath;
}

function findDynamicPathMatch(
  spec: OpenAPIV3.Document,
  normalizedPath: string
): string | null {
  for (const openApiPath of Object.keys(spec.paths)) {
    const pathRegExp = convertOpenApiPathToRegExp(openApiPath);
    if (pathRegExp.test(normalizedPath)) {
      return openApiPath;
    }
  }
  return null;
}

export function matchPath(
  spec: OpenAPIV3.Document,
  inputPath: string
): string | null {
  if (!spec?.paths) {
    return null;
  }
  const normalizedPath = normalizePath(inputPath);

  const exactMatch = findExactPathMatch(spec, normalizedPath);
  if (exactMatch) {
    return exactMatch;
  }
  return findDynamicPathMatch(spec, normalizedPath);
}

export function extractPathnameWithoutQueryParams(pathString: string): string {
  return new URL(pathString, DUMMY_BASE_URL).pathname;
}

function getOperation(
  spec: OpenAPIV3.Document,
  matchedPath: string,
  method: string,
  reqPath: string
): OpenAPIV3.OperationObject {
  const pathItem = spec.paths[matchedPath];
  const operation =
    pathItem?.[method.toLowerCase() as keyof OpenAPIV3.PathItemObject];

  if (operation && typeof operation === 'object' && 'responses' in operation) {
    return operation;
  }
  throw new Error(`Operation not found: ${method} ${reqPath}`);
}

function extractSchemaFromOperation(
  operation: OpenAPIV3.OperationObject,
  status: number,
  method: string,
  reqPath: string
): OpenAPIV3.SchemaObject | null {
  const response = operation.responses?.[String(status)];

  if (response && typeof response === 'object' && 'content' in response) {
    const schema = response.content?.[DEFAULT_CONTENT_TYPE]?.schema;
    return (schema as OpenAPIV3.SchemaObject) ?? null;
  }
  throw new Error(`Response not found: ${method} ${reqPath} ${status}`);
}

export function getResponseSchema(
  spec: OpenAPIV3.Document,
  p: string,
  method: string,
  status: number
): OpenAPIV3.SchemaObject | null {
  const pathWithoutQueryParams = extractPathnameWithoutQueryParams(p);
  const matchedPath = matchPath(spec, pathWithoutQueryParams);

  if (!matchedPath) {
    throw new Error(`Path not found in OpenAPI: ${pathWithoutQueryParams}`);
  }

  const operation = getOperation(
    spec,
    matchedPath,
    method,
    pathWithoutQueryParams
  );
  return extractSchemaFromOperation(
    operation,
    status,
    method,
    pathWithoutQueryParams
  );
}
