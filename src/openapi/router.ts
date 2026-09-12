import type { OpenAPIV3 } from 'openapi-types';
import {
  DEFAULT_CONTENT_TYPE,
  DUMMY_BASE_URL,
  ESCAPED_WILDCARD_REGEX,
  MAX_CACHE_SIZE,
  OPENAPI_PATH_PARAM_REGEX,
  REGEX_ESCAPE_CHARS_REGEX,
  TRAILING_SLASHES_REGEX
} from '../core/constants.js';
import { isJson, normalizeMediaType } from '../core/utils.js';

const regexCache = new Map<string, RegExp>();

const escapeRegex = (str: string): string =>
  str.replace(REGEX_ESCAPE_CHARS_REGEX, '\\$&');

const normalizePath = (p: string): string =>
  p.replace(TRAILING_SLASHES_REGEX, '');

function convertOpenApiPathToRegExp(openApiPath: string): RegExp {
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
  const regexPattern = escapedPath.replace(OPENAPI_PATH_PARAM_REGEX, '[^/]+');
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

function matchPath(spec: OpenAPIV3.Document, inputPath: string): string | null {
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

function extractPathnameWithoutQueryParams(pathString: string): string {
  return new URL(pathString, DUMMY_BASE_URL).pathname;
}

interface GetOperationOptions {
  spec: OpenAPIV3.Document;
  matchedPath: string;
  method: string;
  reqPath: string;
}

function getOperation(options: GetOperationOptions): OpenAPIV3.OperationObject {
  const { spec, matchedPath, method, reqPath } = options;
  const pathItem = spec.paths[matchedPath];
  const operation =
    pathItem?.[method.toLowerCase() as keyof OpenAPIV3.PathItemObject];

  if (operation && typeof operation === 'object' && 'responses' in operation) {
    return operation;
  }
  throw new Error(`Operation not found: ${method} ${reqPath}`);
}

const wildcardRegexCache = new Map<string, RegExp>();

function matchWildcard(req: string, declared: string): boolean {
  let rx = wildcardRegexCache.get(declared);
  if (!rx) {
    const regexPattern =
      '^' + escapeRegex(declared).replace(ESCAPED_WILDCARD_REGEX, '.*') + '$';
    rx = new RegExp(regexPattern);
    wildcardRegexCache.set(declared, rx);
  }
  return rx.test(req);
}

function isJsonMatch(req: string, declared: string): boolean {
  const isEitherJson =
    req === 'application/json' || declared === 'application/json';
  return isEitherJson && isJson(req) && isJson(declared);
}

function isMediaTypeMatch(req: string, declared: string): boolean {
  const normalizedRequest = normalizeMediaType(req);
  const normalizedDeclared = normalizeMediaType(declared);

  if (
    normalizedDeclared === '*/*' ||
    normalizedRequest === normalizedDeclared
  ) {
    return true;
  }

  if (normalizedDeclared.includes('*')) {
    return matchWildcard(normalizedRequest, normalizedDeclared);
  }

  if (normalizedRequest.includes('*')) {
    return false;
  }

  return isJsonMatch(normalizedRequest, normalizedDeclared);
}

interface ResolveMediaTypeSchemaOptions {
  responseContent: Record<string, OpenAPIV3.MediaTypeObject>;
  contentType: string;
  method: string;
  reqPath: string;
  status: number;
}

function resolveMediaTypeSchema(options: ResolveMediaTypeSchemaOptions): {
  schema: OpenAPIV3.SchemaObject | null;
  matchedContentType: string;
} {
  const { responseContent, contentType, method, reqPath, status } = options;
  const declaredMediaTypes = Object.keys(responseContent);
  if (declaredMediaTypes.length === 0) {
    throw new Error(
      `Content-Type '${contentType}' is not declared for ${method} ${reqPath} ${status}. No content declared in OpenAPI spec.`
    );
  }

  const normalizedContentType = normalizeMediaType(contentType);
  const matchedKey =
    declaredMediaTypes.find(
      (declared) => normalizeMediaType(declared) === normalizedContentType
    ) ??
    declaredMediaTypes.find((declared) =>
      isMediaTypeMatch(contentType, declared)
    );

  if (!matchedKey) {
    throw new Error(
      `Content-Type '${contentType}' is not declared for ${method} ${reqPath} ${status}. Declared: ${declaredMediaTypes.join(', ')}`
    );
  }

  const mediaTypeObject = responseContent[matchedKey];
  const schema = (mediaTypeObject?.schema as OpenAPIV3.SchemaObject) ?? null;

  return { schema, matchedContentType: matchedKey };
}

function getResponseObject(
  operation: OpenAPIV3.OperationObject,
  status: number
): unknown {
  return operation.responses?.[String(status)] || operation.responses?.default;
}

interface ExtractSchemaFromOperationOptions {
  operation: OpenAPIV3.OperationObject;
  status: number;
  method: string;
  reqPath: string;
  contentType?: string | undefined;
}

function extractSchemaFromOperation(
  options: ExtractSchemaFromOperationOptions
): {
  schema: OpenAPIV3.SchemaObject | null;
  operation: OpenAPIV3.OperationObject;
  matchedContentType?: string;
} {
  const { operation, status, method, reqPath, contentType } = options;
  const response = getResponseObject(operation, status) as
    OpenAPIV3.ResponseObject | undefined;

  if (!response || typeof response !== 'object') {
    throw new Error(`Response not found: ${method} ${reqPath} ${status}`);
  }

  if (!response.content) {
    if (contentType) {
      throw new Error(
        `Content-Type '${contentType}' is not declared for ${method} ${reqPath} ${status}. No content declared in OpenAPI spec.`
      );
    }
    return { schema: null, operation };
  }

  const actualContentType = contentType || DEFAULT_CONTENT_TYPE;
  const { schema, matchedContentType } = resolveMediaTypeSchema({
    responseContent: response.content,
    contentType: actualContentType,
    method,
    reqPath,
    status
  });

  return {
    schema,
    operation,
    matchedContentType
  };
}

interface GetResponseSchemaOptions {
  spec: OpenAPIV3.Document;
  path: string;
  method: string;
  status: number;
  contentType?: string | undefined;
}

export function getResponseSchema(options: GetResponseSchemaOptions): {
  schema: OpenAPIV3.SchemaObject | null;
  operation: OpenAPIV3.OperationObject;
  matchedContentType?: string;
} {
  const { spec, path, method, status, contentType } = options;
  const pathWithoutQueryParams = extractPathnameWithoutQueryParams(path);
  const matchedPath = matchPath(spec, pathWithoutQueryParams);

  if (!matchedPath) {
    throw new Error(`Path not found in OpenAPI: ${pathWithoutQueryParams}`);
  }

  const operation = getOperation({
    spec,
    matchedPath,
    method,
    reqPath: pathWithoutQueryParams
  });
  return extractSchemaFromOperation({
    operation,
    status,
    method,
    reqPath: pathWithoutQueryParams,
    contentType
  });
}
