import type { OpenAPIV3 } from 'openapi-types';

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
  const escapedPath = escapeRegex(openApiPath);
  const regexPattern = escapedPath.replace(/\\{[^\\}]+\\}/g, '[^/]+');
  const rx = new RegExp('^' + regexPattern + '$');
  regexCache.set(cacheKey, rx);
  return rx;
}

function findExactPathMatch(
  spec: OpenAPIV3.Document,
  normalizedPath: string,
  lowercaseMethod: string
): string | null {
  if (!spec.paths) {
    return null;
  }
  const pathItem = spec.paths[normalizedPath];
  if (!pathItem || !(lowercaseMethod in pathItem)) {
    return null;
  }
  return normalizedPath;
}

function findDynamicPathMatch(
  spec: OpenAPIV3.Document,
  normalizedPath: string,
  lowercaseMethod: string
): string | null {
  if (!spec.paths) {
    return null;
  }
  for (const openApiPath of Object.keys(spec.paths)) {
    const pathItem = spec.paths[openApiPath];
    if (!pathItem || !(lowercaseMethod in pathItem)) {
      continue;
    }

    const pathRegExp = convertOpenApiPathToRegExp(openApiPath);
    if (pathRegExp.test(normalizedPath)) {
      return openApiPath;
    }
  }
  return null;
}

export function matchPath(
  spec: OpenAPIV3.Document,
  inputPath: string,
  method: string
): string | null {
  const normalizedPath = normalizePath(inputPath);
  const lowercaseMethod = method.toLowerCase();

  const exactMatch = findExactPathMatch(spec, normalizedPath, lowercaseMethod);
  if (exactMatch) {
    return exactMatch;
  }
  return findDynamicPathMatch(spec, normalizedPath, lowercaseMethod);
}

export function extractPathnameWithoutQueryParams(pathString: string): string {
  return new URL(pathString, 'http://localhost').pathname;
}

function getOperation(
  spec: OpenAPIV3.Document,
  matchedPath: string,
  method: string,
  reqPath: string
): OpenAPIV3.OperationObject {
  if (!spec.paths) {
    throw new Error('Paths not found in OpenAPI spec');
  }
  const pathItem = spec.paths[matchedPath];
  if (!pathItem) {
    throw new Error(`Operation not found: ${method} ${reqPath}`);
  }
  const operation =
    pathItem[method.toLowerCase() as keyof OpenAPIV3.PathItemObject];

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
  if (!operation.responses) {
    throw new Error(`Response not found: ${method} ${reqPath} ${status}`);
  }
  const response = operation.responses[String(status)];

  if (response && typeof response === 'object' && 'content' in response) {
    const schema = response.content?.['application/json']?.schema;
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
  const matchedPath = matchPath(spec, pathWithoutQueryParams, method);

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
