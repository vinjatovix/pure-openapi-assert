import type { OpenAPIV3 } from 'openapi-types';
import { ValidationContext } from '../core/ValidationContext.js';
import { isSchemaObject } from './types.js';
import { validateShape } from './index.js';

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

export function checkPolymorphism(
  value: unknown,
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
  if (schema.allOf) {
    for (const subSchema of schema.allOf) {
      if (isSchemaObject(subSchema)) {
        validateShape(value, subSchema, ctx);
      }
    }
  }

  if (schema.anyOf) {
    let passedAtLeastOne = false;
    const branchErrors: string[][] = [];

    for (let i = 0; i < schema.anyOf.length; i++) {
      const subSchema = schema.anyOf[i];
      if (!isSchemaObject(subSchema)) continue;

      const subCtx = new ValidationContext();
      subCtx.path = [...ctx.path];
      validateShape(value, subSchema, subCtx);

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

  if (schema.oneOf) {
    let passedCount = 0;
    const branchErrors: string[][] = [];

    for (let i = 0; i < schema.oneOf.length; i++) {
      const subSchema = schema.oneOf[i];
      if (!isSchemaObject(subSchema)) continue;

      const subCtx = new ValidationContext();
      subCtx.path = [...ctx.path];
      validateShape(value, subSchema, subCtx);

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
}
