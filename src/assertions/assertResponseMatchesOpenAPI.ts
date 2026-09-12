import {
  DEFAULT_CONTENT_TYPE,
  HTTP_STATUS_NO_CONTENT
} from '../core/constants.js';
import { isJson, isTextContentType } from '../core/utils.js';
import { ValidationContext } from '../core/ValidationContext.js';
import { loadSpec } from '../openapi/loader.js';
import { getResponseSchema } from '../openapi/router.js';
import { validateShape } from '../validators/index.js';

export type OpenAPIValidatorInput = {
  specPath: string;
  path: string;
  method: string;
  status: number;
  body: unknown;
  contentType?: string;
  customFormats?: Record<string, (val: string) => boolean> | undefined;
};

function isResponseBodyEmpty(body: unknown): boolean {
  if (body === undefined || body === null) {
    return true;
  }
  if (typeof body === 'object') {
    return Object.keys(body).length === 0;
  }
  return false;
}

function validateNonJsonBody(contentType: string, body: unknown): void {
  if (isTextContentType(contentType)) {
    if (typeof body !== 'string') {
      throw new Error(
        `Expected body to be a string for Content-Type '${contentType}', received ${typeof body}`
      );
    }
  } else {
    if (!Buffer.isBuffer(body)) {
      throw new Error(
        `Expected body to be a Buffer for binary Content-Type '${contentType}', received ${typeof body}`
      );
    }
  }
}

function printWarnings(ctx: ValidationContext): void {
  ctx.warnings.forEach((w) => {
    console.warn(w.path ? `[${w.path}] ${w.message}` : `[] ${w.message}`);
  });
}

function handleNoContentResponse(body: unknown, ctx: ValidationContext): void {
  try {
    if (!isResponseBodyEmpty(body)) {
      throw new Error(`${HTTP_STATUS_NO_CONTENT} must have empty body`);
    }
  } finally {
    printWarnings(ctx);
  }
}

function handleNonJsonResponse(args: {
  contentType: string;
  body: unknown;
  ctx: ValidationContext;
}): void {
  const { contentType, body, ctx } = args;
  try {
    validateNonJsonBody(contentType, body);
  } finally {
    printWarnings(ctx);
  }
}

function handleValidationErrors(args: {
  ctx: ValidationContext;
  method: string;
  reqPath: string;
  status: number;
}): void {
  const { ctx, method, reqPath, status } = args;
  if (ctx.hasErrors()) {
    const formattedErrors = ctx.errors.map(
      (err) => `[${err.path}] ${err.message}`
    );
    throw new Error(
      `OpenAPI contract violation for ${method} ${reqPath} ${status}.\nValidation errors:\n- ${formattedErrors.join('\n- ')}`
    );
  }
}

export async function assertResponseMatchesOpenAPI(
  input: OpenAPIValidatorInput
): Promise<void> {
  const {
    specPath,
    path: reqPath,
    method,
    status,
    body,
    contentType,
    customFormats
  } = input;

  const spec = await loadSpec(specPath);
  const actualContentType =
    contentType ||
    (status === HTTP_STATUS_NO_CONTENT ? undefined : DEFAULT_CONTENT_TYPE);

  const { schema, operation } = getResponseSchema({
    spec,
    path: reqPath,
    method,
    status,
    contentType: actualContentType
  });

  const ctx = new ValidationContext(spec);

  if (operation.deprecated) {
    ctx.addWarning(`Endpoint '${method} ${reqPath}' is deprecated`);
  }

  if (status === HTTP_STATUS_NO_CONTENT) {
    handleNoContentResponse(body, ctx);
    return;
  }

  if (actualContentType && !isJson(actualContentType)) {
    handleNonJsonResponse({ contentType: actualContentType, body, ctx });
    return;
  }

  if (!schema) {
    throw new Error(`No schema found for ${method} ${reqPath} ${status}`);
  }

  ctx.pushPath('body');
  validateShape({ value: body, schema, ctx, validateShape, customFormats });
  ctx.popPath();

  printWarnings(ctx);

  handleValidationErrors({ ctx, method, reqPath, status });
}
