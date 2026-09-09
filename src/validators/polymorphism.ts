import type { OpenAPIV3 } from 'openapi-types';
import { ValidationContext } from '../core/ValidationContext.js';
import { isSchemaObject } from './types.js';
import { validateShape } from './registry.js';

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

export function validateAllOf(
  value: unknown,
  schemas: (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)[],
  ctx: ValidationContext
): void {
  for (const subSchema of schemas) {
    if (isSchemaObject(subSchema)) {
      validateShape(value, subSchema, ctx);
    }
  }
}

export function validateAnyOf(
  value: unknown,
  schemas: (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)[],
  ctx: ValidationContext
): void {
  let passedAtLeastOne = false;
  const branchErrors: string[][] = [];

  for (let i = 0; i < schemas.length; i++) {
    const subSchema = schemas[i];
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

export function validateOneOf(
  value: unknown,
  schemas: (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)[],
  ctx: ValidationContext
): void {
  let passedCount = 0;
  const branchErrors: string[][] = [];

  for (let i = 0; i < schemas.length; i++) {
    const subSchema = schemas[i];
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

export function checkPolymorphism(
  value: unknown,
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
  if (schema.allOf) {
    validateAllOf(value, schema.allOf, ctx);
  }

  if (schema.anyOf) {
    validateAnyOf(value, schema.anyOf, ctx);
  }

  if (schema.oneOf) {
    validateOneOf(value, schema.oneOf, ctx);
  }
}
