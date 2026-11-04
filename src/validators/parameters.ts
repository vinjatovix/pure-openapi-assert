import { coerceHeaderValue, normalizeHeaders } from '../core/coercion.js';
import { deserializeParameter } from '../core/deserialize.js';
import { type ValidationContext } from '../core/ValidationContext.js';
import type {
  OperationRequestContract,
  ResolvedParameter
} from '../openapi/router.js';
import { type ValidationArgs } from './args.js';

export interface RequestParameterInput {
  query?: Record<string, string | string[]> | undefined;
  pathParams?: Record<string, string> | undefined;
  headers?: Record<string, string | string[]> | undefined;
}

export interface ValidateParametersArgs {
  contract: OperationRequestContract;
  input: RequestParameterInput;
  ctx: ValidationContext;
  customFormats?: Record<string, (val: string) => boolean> | undefined;
  validateShape: (args: ValidationArgs) => void;
}

function getRawValue(
  param: ResolvedParameter,
  input: RequestParameterInput,
  normalizedHeaders: Record<string, string | string[]>
): string | string[] | undefined {
  if (param.in === 'path') {
    return input.pathParams?.[param.name];
  }
  if (param.in === 'query') {
    return input.query?.[param.name];
  }
  return normalizedHeaders[param.name.toLowerCase()];
}

function validateSingleParameter(args: {
  param: ResolvedParameter;
  value: string | string[] | undefined;
  ctx: ValidationContext;
  customFormats?: Record<string, (val: string) => boolean> | undefined;
  validateShape: (args: ValidationArgs) => void;
}): void {
  const { param, value, ctx, customFormats, validateShape } = args;
  ctx.pushPath(param.in);
  ctx.pushPath(param.name);
  try {
    if (value === undefined) {
      if (param.required) {
        ctx.addError(`Missing required ${param.in} parameter: ${param.name}`);
      }
      return;
    }

    const deserialized = deserializeParameter({
      location: param.in,
      style: param.style,
      explode: param.explode,
      schema: param.schema,
      value
    });
    const coerced = coerceHeaderValue({
      value: deserialized,
      schema: param.schema,
      customFormats,
      ctx
    });
    validateShape({
      value: coerced,
      schema: param.schema,
      ctx,
      validateShape,
      customFormats
    });
  } finally {
    ctx.popPath();
    ctx.popPath();
  }
}

function reportMisalignment(
  ctx: ValidationContext,
  name: string,
  message: string
): void {
  ctx.pushPath('path');
  ctx.pushPath(name);
  ctx.addError(message);
  ctx.popPath();
  ctx.popPath();
}

function validateTemplateAlignment(
  contract: OperationRequestContract,
  ctx: ValidationContext
): void {
  const declared = new Set(
    contract.parameters.filter((p) => p.in === 'path').map((p) => p.name)
  );
  const template = new Set(contract.templatePathParamNames);

  for (const name of template) {
    if (!declared.has(name)) {
      reportMisalignment(
        ctx,
        name,
        `Path parameter '${name}' is present in the path template but is not declared`
      );
    }
  }
  for (const name of declared) {
    if (!template.has(name)) {
      reportMisalignment(
        ctx,
        name,
        `Path parameter '${name}' is declared but absent from the path template`
      );
    }
  }
}

/** @internal */
export function validateParameters(args: ValidateParametersArgs): void {
  const { contract, input, ctx, customFormats, validateShape } = args;

  validateTemplateAlignment(contract, ctx);

  const normalizedHeaders = normalizeHeaders(input.headers);

  for (const param of contract.parameters) {
    const value = getRawValue(param, input, normalizedHeaders);
    validateSingleParameter({
      param,
      value,
      ctx,
      customFormats,
      validateShape
    });
  }
}
