import type { OpenAPIV3 } from 'openapi-types';
import { parseJSONLossless } from '../core/coercion.js';
import { DEFAULT_CONTENT_TYPE } from '../core/constants.js';
import { isJson } from '../core/utils.js';
import { ValidationContext } from '../core/ValidationContext.js';
import { loadSpec } from '../openapi/loader.js';
import {
  getRequestContract,
  type OperationRequestContract
} from '../openapi/router.js';
import { validateShape } from '../validators/index.js';
import { validateParameters } from '../validators/parameters.js';

export interface OpenAPIRequestValidatorInput {
  specPath: string;
  path: string;
  method: string;
  body?: unknown;
  query?: Record<string, string | string[]> | undefined;
  pathParams?: Record<string, string> | undefined;
  headers?: Record<string, string | string[]> | undefined;
  contentType?: string | undefined;
  customFormats?: Record<string, (val: string) => boolean> | undefined;
}

const BODY_PARSE_FAILED = Symbol('BODY_PARSE_FAILED');

function parseBody(
  body: unknown,
  contentType: string,
  ctx: ValidationContext
): unknown {
  if (typeof body === 'string' && isJson(contentType)) {
    try {
      return parseJSONLossless(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.pushPath('body');
      ctx.addError(`Malformed JSON body: ${message}`);
      ctx.popPath();
      return BODY_PARSE_FAILED;
    }
  }
  return body;
}

interface ValidateRequestBodyArgs {
  body: unknown;
  contract: OperationRequestContract;
  contentType: string;
  ctx: ValidationContext;
  customFormats: Record<string, (val: string) => boolean> | undefined;
}

function validateRequestBody(args: ValidateRequestBodyArgs): void {
  const { body, contract, contentType, ctx, customFormats } = args;

  if (body === undefined) {
    if (contract.bodyRequired) {
      ctx.pushPath('body');
      ctx.addError('request body is required');
      ctx.popPath();
    }
    return;
  }

  if (!contract.bodySchema) {
    return;
  }

  const parsed = parseBody(body, contentType, ctx);
  if (parsed === BODY_PARSE_FAILED) {
    return;
  }

  const schema: OpenAPIV3.SchemaObject = contract.bodySchema;
  ctx.pushPath('body');
  validateShape({ value: parsed, schema, ctx, validateShape, customFormats });
  ctx.popPath();
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

function handleRequestValidationErrors(args: {
  ctx: ValidationContext;
  method: string;
  reqPath: string;
}): void {
  const { ctx, method, reqPath } = args;
  if (ctx.hasErrors()) {
    const formattedErrors = ctx.errors.map(
      (err) => `[${err.path || 'root'}] ${err.message}`
    );
    throw new Error(
      `OpenAPI contract violation for ${method} ${reqPath}.\nValidation errors:\n- ${formattedErrors.join('\n- ')}`
    );
  }
}

export async function assertRequestMatchesOpenApi(
  input: OpenAPIRequestValidatorInput
): Promise<void> {
  const { specPath, path: reqPath, method, customFormats } = input;
  const contentType = input.contentType ?? DEFAULT_CONTENT_TYPE;

  const spec = await loadSpec(specPath);
  const contract = getRequestContract({
    spec,
    path: reqPath,
    method,
    contentType
  });

  const ctx = new ValidationContext({ spec, direction: 'request' });

  if (contract.operation.deprecated) {
    ctx.addWarning(`Endpoint '${method} ${reqPath}' is deprecated`);
  }

  validateRequestBody({
    body: input.body,
    contract,
    contentType,
    ctx,
    customFormats
  });

  validateParameters({
    contract,
    input,
    ctx,
    customFormats,
    validateShape
  });

  printWarnings(ctx);

  handleRequestValidationErrors({ ctx, method, reqPath });
}

export const assertRequest = assertRequestMatchesOpenApi;
