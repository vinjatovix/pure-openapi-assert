import {
  formatStringMinLengthError,
  formatStringMaxLengthError,
  formatStringPatternError,
  formatStringFormatError
} from '../core/errors.js';
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
    ctx.addError(formatStringFormatError(schema.format, value));
  }
}

function validateStringLength(args: ValidationArgs<string>): void {
  const { value, schema, ctx } = args;
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    ctx.addError(formatStringMinLengthError(value.length, schema.minLength));
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    ctx.addError(formatStringMaxLengthError(value.length, schema.maxLength));
  }
}

function validateStringPattern(args: ValidationArgs<string>): void {
  const { value, schema, ctx } = args;
  if (schema.pattern) {
    const regex = getCachedRegex(schema.pattern);
    if (!regex.test(value)) {
      ctx.addError(formatStringPatternError(schema.pattern));
    }
  }
}

export function validateStringConstraints(args: ValidationArgs<string>): void {
  validateStringLength(args);
  validateStringPattern(args);
  validateStringFormat(args);
}
