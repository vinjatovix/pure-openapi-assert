import type { OpenAPIV3 } from 'openapi-types';
import {
  ValidationContext,
  type ValidationIssue
} from '../core/ValidationContext.js';
import { isPlainObject, isSchemaObject } from '../core/utils.js';
import { type ValidationArgs } from './args.js';
import { resolveDiscriminatorSchema } from './discriminator.js';

function formatBranchErrors(branchErrors: ValidationIssue[][]): string {
  return branchErrors
    .map((errors, index) => {
      const isLast = index === branchErrors.length - 1;
      const branchLine = isLast
        ? `  └─ Branch ${index + 1}:`
        : `  ├─ Branch ${index + 1}:`;
      const prefix = isLast ? '       ' : '  │    ';
      const formattedErrors = errors
        .map((e) => `${prefix}[${e.path}] ${e.message}`)
        .join('\n');
      return `${branchLine}\n${formattedErrors}`;
    })
    .join('\n');
}

function validateSubSchema(
  subSchema: OpenAPIV3.SchemaObject,
  args: ValidationArgs<unknown>
): { issues: ValidationIssue[] } {
  const { value, ctx, validateShape, customFormats } = args;
  let subCtx: ValidationContext | undefined;

  ctx.trackPolymorphism(value, subSchema, () => {
    subCtx = ctx.createChildContext();
    if (isPlainObject(value) || Array.isArray(value)) {
      subCtx.visited.delete(value);
    }
    validateShape({
      value,
      schema: subSchema,
      ctx: subCtx,
      validateShape,
      customFormats
    });
  });
  return {
    issues: subCtx ? subCtx.issues : []
  };
}

function tryValidateDiscriminator(args: {
  validationArgs: ValidationArgs<unknown>;
  schemas: Array<OpenAPIV3.SchemaObject>;
  compositionType: 'oneOf' | 'anyOf';
}): boolean {
  const { validationArgs, schemas, compositionType } = args;
  const result = resolveDiscriminatorSchema({
    validationArgs,
    schemas,
    compositionType
  });
  if (result.type === 'failed') {
    return true;
  }
  if (result.type === 'resolved') {
    const { issues } = validateSubSchema(result.schema, validationArgs);
    validationArgs.ctx.addIssues(issues);
    return true;
  }
  return false;
}

function validateAllOf(args: ValidationArgs<unknown>): void {
  const { schema, ctx } = args;
  const schemas = schema.allOf as OpenAPIV3.SchemaObject[];
  for (const subSchema of schemas) {
    if (!isSchemaObject(subSchema)) continue;
    const { issues } = validateSubSchema(subSchema, args);
    ctx.addIssues(issues);
  }
}

function validateAnyOf(args: ValidationArgs<unknown>): void {
  const { schema, ctx } = args;
  const schemas = schema.anyOf as OpenAPIV3.SchemaObject[];

  if (
    tryValidateDiscriminator({
      validationArgs: args,
      schemas,
      compositionType: 'anyOf'
    })
  ) {
    return;
  }

  const branchErrors: ValidationIssue[][] = [];

  for (const subSchema of schemas) {
    if (!isSchemaObject(subSchema)) continue;
    const { issues } = validateSubSchema(subSchema, args);
    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length === 0) {
      ctx.addIssues(issues.filter((i) => i.severity === 'warning'));
      return;
    }
    branchErrors.push(errors);
  }

  const formatted = formatBranchErrors(branchErrors);
  ctx.addError(`Failed anyOf:\n${formatted}`, branchErrors);
}

function validateOneOf(args: ValidationArgs<unknown>): void {
  const { schema, ctx } = args;
  const schemas = schema.oneOf as OpenAPIV3.SchemaObject[];

  if (
    tryValidateDiscriminator({
      validationArgs: args,
      schemas,
      compositionType: 'oneOf'
    })
  ) {
    return;
  }

  let passedCount = 0;
  const branchErrors: ValidationIssue[][] = [];
  let successfulBranchWarnings: ValidationIssue[] = [];

  for (const subSchema of schemas) {
    if (!isSchemaObject(subSchema)) continue;
    const { issues } = validateSubSchema(subSchema, args);
    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length === 0) {
      passedCount++;
      successfulBranchWarnings = issues.filter((i) => i.severity === 'warning');
      if (passedCount > 1) {
        break;
      }
    } else {
      branchErrors.push(errors);
    }
  }

  if (passedCount === 1) {
    ctx.addIssues(successfulBranchWarnings);
    return;
  }

  const formatted = formatBranchErrors(branchErrors);
  ctx.addError(
    `Value matches ${passedCount} schemas from 'oneOf' (expected exactly 1):\n${formatted}`,
    branchErrors
  );
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
