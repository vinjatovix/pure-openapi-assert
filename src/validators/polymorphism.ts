import { ValidationContext } from '../core/ValidationContext.js';
import { isSchemaObject, type ValidationArgs } from './types.js';

export function formatBranchErrors(branchErrors: string[][]): string {
  return branchErrors
    .map((errors, index) => {
      const isLast = index === branchErrors.length - 1;
      const branchLine = isLast
        ? `  └─ Branch ${index + 1}:`
        : `  ├─ Branch ${index + 1}:`;
      const prefix = isLast ? '       ' : '  │    ';
      const formattedErrors = errors.map((e) => `${prefix}${e}`).join('\n');
      return `${branchLine}\n${formattedErrors}`;
    })
    .join('\n');
}

export function validateAllOf(args: ValidationArgs<unknown>): void {
  const { value, schema, ctx, validateShape, customFormats } = args;
  const schemas = schema.allOf;
  if (!schemas) {
    return;
  }
  for (const subSchema of schemas) {
    if (isSchemaObject(subSchema)) {
      validateShape({
        value,
        schema: subSchema,
        ctx,
        validateShape,
        customFormats
      });
    }
  }
}

export function validateAnyOf(args: ValidationArgs<unknown>): void {
  const { value, schema, ctx, validateShape, customFormats } = args;
  const schemas = schema.anyOf;
  if (!schemas) {
    return;
  }
  let passedAtLeastOne = false;
  const branchErrors: string[][] = [];

  for (let i = 0; i < schemas.length; i++) {
    const subSchema = schemas[i];
    if (!isSchemaObject(subSchema)) continue;

    const subCtx = new ValidationContext();
    subCtx.currentPath = ctx.currentPath;
    validateShape({
      value,
      schema: subSchema,
      ctx: subCtx,
      validateShape,
      customFormats
    });

    if (!subCtx.hasErrors()) {
      passedAtLeastOne = true;
      break;
    } else {
      branchErrors.push(subCtx.errors);
    }
  }

  if (!passedAtLeastOne) {
    const formatted = formatBranchErrors(branchErrors);
    ctx.addError(`Failed anyOf:\n${formatted}`);
  }
}

export function validateOneOf(args: ValidationArgs<unknown>): void {
  const { value, schema, ctx, validateShape, customFormats } = args;
  const schemas = schema.oneOf;
  if (!schemas) {
    return;
  }
  let passedCount = 0;
  const branchErrors: string[][] = [];

  for (let i = 0; i < schemas.length; i++) {
    const subSchema = schemas[i];
    if (!isSchemaObject(subSchema)) continue;

    const subCtx = new ValidationContext();
    subCtx.currentPath = ctx.currentPath;
    validateShape({
      value,
      schema: subSchema,
      ctx: subCtx,
      validateShape,
      customFormats
    });

    if (!subCtx.hasErrors()) {
      passedCount++;
    } else {
      branchErrors.push(subCtx.errors);
    }
  }

  if (passedCount !== 1) {
    const formatted = formatBranchErrors(branchErrors);
    ctx.addError(
      `Value matches ${passedCount} schemas from 'oneOf' (expected exactly 1):\n${formatted}`
    );
  }
}

export function checkPolymorphism(args: ValidationArgs): void {
  const { schema } = args;
  if (schema.allOf) {
    validateAllOf(args);
  }

  if (schema.anyOf) {
    validateAnyOf(args);
  }

  if (schema.oneOf) {
    validateOneOf(args);
  }
}
