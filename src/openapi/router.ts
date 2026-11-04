import type { OpenAPIV3 } from 'openapi-types';
import {
  DEFAULT_CONTENT_TYPE,
  DUMMY_BASE_URL,
  ESCAPED_WILDCARD_REGEX,
  OPENAPI_PATH_PARAM_REGEX,
  PARAM_STYLE_DEFAULTS,
  REGEX_ESCAPE_CHARS_REGEX,
  TRAILING_SLASHES_REGEX
} from '../core/constants.js';
import {
  isJson,
  isReferenceObject,
  normalizeMediaType
} from '../core/utils.js';
import { stateManager } from '../core/StateManager.js';

const TEMPLATE_PARAM_REGEX = /{([^}]+)}/g;

const escapeRegex = (str: string): string =>
  str.replace(REGEX_ESCAPE_CHARS_REGEX, '\\$&');

const normalizePath = (p: string): string =>
  p.replace(TRAILING_SLASHES_REGEX, '');

function convertOpenApiPathToRegExp(openApiPath: string): RegExp {
  const cacheKey = `path:${openApiPath}`;
  const cached = stateManager.pathRegexCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const escapedPath = escapeRegex(openApiPath);
  const regexPattern = escapedPath.replace(OPENAPI_PATH_PARAM_REGEX, '[^/]+');
  const rx = new RegExp('^' + regexPattern + '$');
  stateManager.pathRegexCache.set(cacheKey, rx);
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

function matchWildcard(req: string, declared: string): boolean {
  let rx = stateManager.wildcardRegexCache.get(declared);
  if (!rx) {
    const regexPattern =
      '^' + escapeRegex(declared).replace(ESCAPED_WILDCARD_REGEX, '.*') + '$';
    rx = new RegExp(regexPattern);
    stateManager.wildcardRegexCache.set(declared, rx);
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

function getSpecificity(
  declared: string,
  normalizedContentType: string
): number {
  const norm = normalizeMediaType(declared);
  if (norm === normalizedContentType) return 1;
  if (!norm.includes('*')) return 2; // e.g. json alias match
  if (norm !== '*/*') return 3; // e.g. type/*
  return 4; // */*
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

  const matches = declaredMediaTypes.filter((declared) =>
    isMediaTypeMatch(contentType, declared)
  );

  if (matches.length === 0) {
    throw new Error(
      `Content-Type '${contentType}' is not declared for ${method} ${reqPath} ${status}. Declared: ${declaredMediaTypes.join(', ')}`
    );
  }

  matches.sort(
    (a, b) =>
      getSpecificity(a, normalizedContentType) -
      getSpecificity(b, normalizedContentType)
  );
  const matchedKey = matches[0];

  if (matchedKey === undefined) {
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
  matchedContentType?: string | undefined;
  declaredHeaders?:
    | Record<string, OpenAPIV3.HeaderObject | OpenAPIV3.ReferenceObject>
    | undefined;
} {
  const { operation, status, method, reqPath, contentType } = options;
  const response = getResponseObject(operation, status) as
    OpenAPIV3.ResponseObject | undefined;

  if (!response || typeof response !== 'object') {
    throw new Error(`Response not found: ${method} ${reqPath} ${status}`);
  }

  const declaredHeaders = response.headers;

  if (!response.content) {
    if (contentType) {
      throw new Error(
        `Content-Type '${contentType}' is not declared for ${method} ${reqPath} ${status}. No content declared in OpenAPI spec.`
      );
    }
    return { schema: null, operation, declaredHeaders };
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
    matchedContentType,
    declaredHeaders
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
  matchedContentType?: string | undefined;
  declaredHeaders?:
    | Record<string, OpenAPIV3.HeaderObject | OpenAPIV3.ReferenceObject>
    | undefined;
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

// ---------------------------------------------------------------------------
// Request contract extraction (requestBody + parameters)
// ---------------------------------------------------------------------------

export type ParameterStyle =
  | 'form'
  | 'spaceDelimited'
  | 'pipeDelimited'
  | 'deepObject'
  | 'simple'
  | 'label'
  | 'matrix';

export type ParameterLocation = 'path' | 'query' | 'header';

export interface ResolvedParameter {
  name: string;
  in: ParameterLocation;
  required: boolean;
  schema: OpenAPIV3.SchemaObject;
  style: ParameterStyle;
  explode: boolean;
}

export interface OperationRequestContract {
  operation: OpenAPIV3.OperationObject;
  bodySchema: OpenAPIV3.SchemaObject | null;
  bodyRequired: boolean;
  hasRequestBody: boolean;
  matchedContentType: string | null;
  parameters: ResolvedParameter[];
  templatePathParamNames: string[];
}

function resolveRequestMediaTypeSchema(options: {
  content: Record<string, OpenAPIV3.MediaTypeObject>;
  contentType: string;
  method: string;
  reqPath: string;
}): { schema: OpenAPIV3.SchemaObject | null; matchedContentType: string } {
  const { content, contentType, method, reqPath } = options;
  const declaredMediaTypes = Object.keys(content);
  const normalizedContentType = normalizeMediaType(contentType);

  const matches = declaredMediaTypes.filter((declared) =>
    isMediaTypeMatch(contentType, declared)
  );

  const matchedKey = matches.sort(
    (a, b) =>
      getSpecificity(a, normalizedContentType) -
      getSpecificity(b, normalizedContentType)
  )[0];

  if (matchedKey === undefined) {
    throw new Error(
      `Content-Type '${contentType}' is not declared for ${method} ${reqPath}. Declared: ${declaredMediaTypes.join(', ')}`
    );
  }

  const schema =
    (content[matchedKey]?.schema as OpenAPIV3.SchemaObject) ?? null;
  return { schema, matchedContentType: matchedKey };
}

function resolveRequestBody(options: {
  operation: OpenAPIV3.OperationObject;
  contentType: string;
  method: string;
  reqPath: string;
}): {
  bodySchema: OpenAPIV3.SchemaObject | null;
  bodyRequired: boolean;
  hasRequestBody: boolean;
  matchedContentType: string | null;
} {
  const { operation, contentType, method, reqPath } = options;
  const requestBody = operation.requestBody;

  if (!requestBody) {
    return {
      bodySchema: null,
      bodyRequired: false,
      hasRequestBody: false,
      matchedContentType: null
    };
  }

  if (isReferenceObject(requestBody)) {
    throw new Error(
      `Request body for ${method} ${reqPath} contains an unresolved $ref. Ensure your OpenAPI spec is fully dereferenced.`
    );
  }

  const bodyRequired = requestBody.required === true;
  const content = requestBody.content;

  if (!content || Object.keys(content).length === 0) {
    return {
      bodySchema: null,
      bodyRequired,
      hasRequestBody: true,
      matchedContentType: null
    };
  }

  const { schema, matchedContentType } = resolveRequestMediaTypeSchema({
    content,
    contentType,
    method,
    reqPath
  });

  return {
    bodySchema: schema,
    bodyRequired,
    hasRequestBody: true,
    matchedContentType
  };
}

function isSupportedLocation(value: string): value is ParameterLocation {
  return value === 'path' || value === 'query' || value === 'header';
}

function resolveParameterSchema(
  param: OpenAPIV3.ParameterObject
): OpenAPIV3.SchemaObject {
  if (!param.schema) {
    return {};
  }
  if (isReferenceObject(param.schema)) {
    throw new Error(
      `Schema for parameter '${param.name}' (in: ${param.in}) contains an unresolved $ref. Ensure your OpenAPI spec is fully dereferenced.`
    );
  }
  return param.schema;
}

function normalizeParameter(
  param: OpenAPIV3.ParameterObject,
  location: ParameterLocation
): ResolvedParameter {
  const schema = resolveParameterSchema(param);
  const style =
    (param.style as ParameterStyle | undefined) ??
    PARAM_STYLE_DEFAULTS[location];
  const explode = param.explode ?? style === 'form';
  const required = location === 'path' ? true : param.required === true;

  return { name: param.name, in: location, required, schema, style, explode };
}

function collectParameters(
  source: (OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject)[] | undefined,
  target: Map<string, ResolvedParameter>,
  method: string,
  reqPath: string
): void {
  if (!source) {
    return;
  }
  for (const param of source) {
    if (isReferenceObject(param)) {
      throw new Error(
        `A parameter for ${method} ${reqPath} contains an unresolved $ref. Ensure your OpenAPI spec is fully dereferenced.`
      );
    }
    if (!isSupportedLocation(param.in)) {
      continue;
    }
    target.set(
      `${param.name}|${param.in}`,
      normalizeParameter(param, param.in)
    );
  }
}

function resolveParameters(options: {
  pathItem: OpenAPIV3.PathItemObject;
  operation: OpenAPIV3.OperationObject;
  method: string;
  reqPath: string;
}): ResolvedParameter[] {
  const { pathItem, operation, method, reqPath } = options;
  const merged = new Map<string, ResolvedParameter>();
  // Path item first, operation overrides (OpenAPI 3.0 precedence).
  collectParameters(pathItem.parameters, merged, method, reqPath);
  collectParameters(operation.parameters, merged, method, reqPath);
  return [...merged.values()];
}

function extractTemplatePathParamNames(matchedPath: string): string[] {
  const names: string[] = [];
  let match: RegExpExecArray | null;
  TEMPLATE_PARAM_REGEX.lastIndex = 0;
  while ((match = TEMPLATE_PARAM_REGEX.exec(matchedPath)) !== null) {
    if (match[1]) {
      names.push(match[1]);
    }
  }
  return names;
}

interface GetRequestContractOptions {
  spec: OpenAPIV3.Document;
  path: string;
  method: string;
  contentType: string;
}

export function getRequestContract(
  options: GetRequestContractOptions
): OperationRequestContract {
  const { spec, path, method, contentType } = options;
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
  const pathItem = spec.paths[matchedPath] as OpenAPIV3.PathItemObject;

  const { bodySchema, bodyRequired, hasRequestBody, matchedContentType } =
    resolveRequestBody({
      operation,
      contentType,
      method,
      reqPath: pathWithoutQueryParams
    });

  const parameters = resolveParameters({
    pathItem,
    operation,
    method,
    reqPath: pathWithoutQueryParams
  });

  return {
    operation,
    bodySchema,
    bodyRequired,
    hasRequestBody,
    matchedContentType,
    parameters,
    templatePathParamNames: extractTemplatePathParamNames(matchedPath)
  };
}
