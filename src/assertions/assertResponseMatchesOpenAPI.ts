import type { OpenAPIV3 } from 'openapi-types';
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

function printWarnings(ctx: ValidationContext): void {
  if (ctx.warnings.length === 0) return;

  const YELLOW = '\x1b[33m';
  const RESET = '\x1b[0m';
  const PREFIX = `${YELLOW}[OpenAPI-Assert] ⚠️  Warning:${RESET}`;

  ctx.warnings.forEach((w) => {
    const pathStr = w.path ? ` [${w.path}]` : '';
    console.warn(`${PREFIX}${pathStr} ${w.message}`);
  });
}

function validateResponseBody(args: {
  status: number;
  actualContentType: string | undefined;
  body: unknown;
  schema: OpenAPIV3.SchemaObject | null;
  ctx: ValidationContext;
  customFormats: Record<string, (val: string) => boolean> | undefined;
  method: string;
  reqPath: string;
}): void {
  const {
    status,
    actualContentType,
    body,
    schema,
    ctx,
    customFormats,
    method,
    reqPath
  } = args;

  if (status === HTTP_STATUS_NO_CONTENT) {
    if (!isResponseBodyEmpty(body)) {
      ctx.addError(`${HTTP_STATUS_NO_CONTENT} must have empty body`);
    }
  } else if (actualContentType && !isJson(actualContentType)) {
    if (isTextContentType(actualContentType)) {
      if (typeof body !== 'string') {
        ctx.addError(
          `Expected body to be a string for Content-Type '${actualContentType}', received ${typeof body}`
        );
      }
    } else {
      if (!Buffer.isBuffer(body)) {
        ctx.addError(
          `Expected body to be a Buffer for binary Content-Type '${actualContentType}', received ${typeof body}`
        );
      }
    }
  } else {
    if (!schema) {
      ctx.addError(`No schema found for ${method} ${reqPath} ${status}`);
    } else {
      ctx.pushPath('body');
      validateShape({ value: body, schema, ctx, validateShape, customFormats });
      ctx.popPath();
    }
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
      (err) => `[${err.path || 'root'}] ${err.message}`
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

  validateResponseBody({
    status,
    actualContentType,
    body,
    schema,
    ctx,
    customFormats,
    method,
    reqPath
  });

  printWarnings(ctx);

  handleValidationErrors({ ctx, method, reqPath, status });
}
