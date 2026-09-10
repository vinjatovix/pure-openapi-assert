import { HTTP_STATUS_NO_CONTENT } from '../core/constants.js';
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

export async function assertResponseMatchesOpenAPI({
  specPath,
  path: reqPath,
  method,
  status,
  body,
  customFormats
}: OpenAPIValidatorInput): Promise<void> {
  if (status === HTTP_STATUS_NO_CONTENT) {
    if (!isResponseBodyEmpty(body)) {
      throw new Error(`${HTTP_STATUS_NO_CONTENT} must have empty body`);
    }
    return;
  }

  const spec = await loadSpec(specPath);
  const schema = getResponseSchema(spec, reqPath, method, status);

  if (!schema) {
    throw new Error(`No schema found for ${method} ${reqPath} ${status}`);
  }

  const ctx = new ValidationContext();
  ctx.pushPath('body');
  validateShape({ value: body, schema, ctx, validateShape, customFormats });
  ctx.popPath();

  if (ctx.hasErrors()) {
    throw new Error(
      `OpenAPI contract violation for ${method} ${reqPath} ${status}.\nValidation errors:\n- ${ctx.errors.join('\n- ')}`
    );
  }
}
