import { coerceHeaderValue, normalizeHeaders } from '../core/coercion.js';
import { EXEMPT_RFC_TRANSPORT_HEADERS } from '../core/constants.js';
import {
  deserializeParameter,
  deserializeQueryParameters
} from '../core/deserialize.js';
import { type ValidationContext } from '../core/ValidationContext.js';
import type {
  OperationRequestContract,
  ResolvedParameter
} from '../openapi/router.js';
import { type ValidationArgs } from './args.js';

export interface RequestParameterInput {
  query?: Record<string, unknown> | URLSearchParams | string | undefined;
  pathParams?: Record<string, string> | undefined;
  headers?: Record<string, string | string[]> | undefined;
  strictParameters?: boolean | undefined;
}

export interface ValidateParametersArgs {
  contract: OperationRequestContract;
  input: RequestParameterInput;
  ctx: ValidationContext;
  customFormats?: Record<string, (val: string) => boolean> | undefined;
  validateShape: (args: ValidationArgs) => void;
  strictParameters?: boolean | undefined;
}

function getRawValue(
  param: ResolvedParameter,
  input: RequestParameterInput,
  normalizedHeaders: Record<string, string | string[]>,
  deserializedQuery: Record<string, unknown>
): unknown {
  if (param.in === 'path') {
    return input.pathParams?.[param.name];
  }
  if (param.in === 'query') {
    return deserializedQuery[param.name];
  }
  return normalizedHeaders[param.name.toLowerCase()];
}

function validateSingleParameter(args: {
  param: ResolvedParameter;
  value: unknown;
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

function validateStrictQuery(
  declaredQueryNames: Set<string>,
  deserializedQuery: Record<string, unknown>,
  ctx: ValidationContext
): void {
  for (const queryKey of Object.keys(deserializedQuery)) {
    if (!declaredQueryNames.has(queryKey)) {
      ctx.pushPath('query');
      ctx.pushPath(queryKey);
      ctx.addError(
        `Query parameter '${queryKey}' is not declared in OpenAPI contract`
      );
      ctx.popPath();
      ctx.popPath();
    }
  }
}

function validateStrictHeaders(
  declaredHeaderNames: Set<string>,
  headers: Record<string, string | string[]>,
  ctx: ValidationContext
): void {
  for (const rawHeaderKey of Object.keys(headers)) {
    const lowerKey = rawHeaderKey.toLowerCase();
    if (
      !EXEMPT_RFC_TRANSPORT_HEADERS.has(lowerKey) &&
      !declaredHeaderNames.has(lowerKey)
    ) {
      ctx.pushPath('header');
      ctx.pushPath(rawHeaderKey);
      ctx.addError(
        `Header '${rawHeaderKey}' is not declared in OpenAPI contract`
      );
      ctx.popPath();
      ctx.popPath();
    }
  }
}

function validateStrictParameters(args: {
  contract: OperationRequestContract;
  input: RequestParameterInput;
  deserializedQuery: Record<string, unknown>;
  ctx: ValidationContext;
}): void {
  const { contract, input, deserializedQuery, ctx } = args;

  const declaredQueryNames = new Set(
    contract.parameters.filter((p) => p.in === 'query').map((p) => p.name)
  );
  validateStrictQuery(declaredQueryNames, deserializedQuery, ctx);

  if (input.headers) {
    const declaredHeaderNames = new Set(
      contract.parameters
        .filter((p) => p.in === 'header')
        .map((p) => p.name.toLowerCase())
    );
    validateStrictHeaders(declaredHeaderNames, input.headers, ctx);
  }
}

/** @internal */
export function validateParameters(args: ValidateParametersArgs): void {
  const { contract, input, ctx, customFormats, validateShape } = args;
  const isStrict = args.strictParameters ?? input.strictParameters ?? false;

  validateTemplateAlignment(contract, ctx);

  const normalizedHeaders = normalizeHeaders(input.headers);
  const deserializedQuery = deserializeQueryParameters({
    declaredParameters: contract.parameters,
    queryInput: input.query,
    ctx
  });

  if (isStrict) {
    validateStrictParameters({
      contract,
      input,
      deserializedQuery,
      ctx
    });
  }

  for (const param of contract.parameters) {
    const value = getRawValue(
      param,
      input,
      normalizedHeaders,
      deserializedQuery
    );
    validateSingleParameter({
      param,
      value,
      ctx,
      customFormats,
      validateShape
    });
  }
}
