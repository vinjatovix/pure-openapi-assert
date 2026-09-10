import { loadSpec } from '../openapi/loader.js';
import { getResponseSchema } from '../openapi/router.js';
import { ValidationContext } from '../core/ValidationContext.js';
import { validateShape } from '../validators/index.js';

export type OpenAPIValidatorInput = {
  specPath: string;
  path: string;
  method: string;
  status: number;
  body: unknown;
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
  body
}: OpenAPIValidatorInput): Promise<void> {
  if (status === 204) {
    if (!isResponseBodyEmpty(body)) {
      throw new Error('204 must have empty body');
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
  validateShape({ value: body, schema, ctx, validateShape });
  ctx.popPath();

  if (ctx.hasErrors()) {
    throw new Error(
      `OpenAPI contract violation for ${method} ${reqPath} ${status}.\nValidation errors:\n- ${ctx.errors.join('\n- ')}`
    );
  }
}
