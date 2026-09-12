import { type ValidationArgs } from './args.js';
import { formatRegistry, getCachedRegex } from './format.js';

function validateStringFormat(args: ValidationArgs<string>): void {
  const { value, schema, ctx, customFormats } = args;
  if (!schema.format) return;

  const customFormatCheck =
    customFormats && Object.hasOwn(customFormats, schema.format)
      ? customFormats[schema.format]
      : undefined;

  const formatCheck =
    typeof customFormatCheck === 'function'
      ? customFormatCheck
      : Object.hasOwn(formatRegistry, schema.format)
        ? formatRegistry[schema.format]
        : undefined;

  if (typeof formatCheck === 'function' && !formatCheck(value)) {
    ctx.addError(
      `Expected string format '${schema.format}', received '${value}'`
    );
  }
}

function validateStringLength(args: ValidationArgs<string>): void {
  const { value, schema, ctx } = args;
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    ctx.addError(
      `String length ${value.length} is less than minimum ${schema.minLength}`
    );
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    ctx.addError(
      `String length ${value.length} exceeds maximum ${schema.maxLength}`
    );
  }
}

function validateStringPattern(args: ValidationArgs<string>): void {
  const { value, schema, ctx } = args;
  if (schema.pattern) {
    const regex = getCachedRegex(schema.pattern);
    if (!regex.test(value)) {
      ctx.addError(`String does not match pattern ${schema.pattern}`);
    }
  }
}

export function validateStringConstraints(args: ValidationArgs<string>): void {
  validateStringLength(args);
  validateStringPattern(args);
  validateStringFormat(args);
}
