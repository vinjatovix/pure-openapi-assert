import { isPlainObject } from '../core/utils.js';
import { type ValidationArgs } from './args.js';
import { resolveSchema } from './pointers.js';
import { checkPolymorphism } from './polymorphism.js';
import {
  validateArray,
  validateBaseType,
  validateConst,
  validateEnum,
  validateObject
} from './type-validators.js';

const validators: Record<string, (args: ValidationArgs) => void> = {
  string: validateBaseType,
  number: validateBaseType,
  integer: validateBaseType,
  boolean: validateBaseType,
  array: validateArray,
  object: validateObject
};

function shouldStopOnNullValue(
  value: unknown,
  schema: ValidationArgs['schema'],
  ctx: ValidationArgs['ctx']
): boolean {
  if (value !== null) {
    return false;
  }
  const hasConstraints =
    schema.type !== undefined ||
    schema.allOf !== undefined ||
    schema.anyOf !== undefined ||
    schema.oneOf !== undefined ||
    schema.not !== undefined ||
    '$ref' in schema;

  if (!hasConstraints) {
    return false;
  }
  if (!schema.nullable) {
    ctx.addError('Field is not nullable but received null');
  }
  return true;
}

function preValidate(args: ValidationArgs): boolean {
  const { value, schema, ctx } = args;

  if (schema.deprecated) {
    ctx.addWarning('Schema property is deprecated');
  }

  if (schema.writeOnly && value !== undefined) {
    ctx.addError('Field is writeOnly and must not be present in the response');
    return false;
  }

  if (shouldStopOnNullValue(value, schema, ctx)) {
    return false;
  }

  if (value === undefined) {
    ctx.addError('Field is required but received undefined');
    return false;
  }

  return true;
}

function validateNotConstraint(args: ValidationArgs): void {
  const { schema, ctx, value } = args;
  if (schema.not === undefined) {
    return;
  }

  const resolvedNot = resolveSchema(schema.not, ctx);
  if (!resolvedNot) {
    return;
  }

  if (ctx.hasActiveNegation(value, resolvedNot)) {
    ctx.addError('Cyclic not schema detected', { code: 'CYCLIC_NOT_SCHEMA' });
    return;
  }

  ctx.pushNegation(value, resolvedNot);
  try {
    // Clear/reset the visited set so the negated schema can independently
    // traverse references without false-positive cycle detection from the parent
    const childCtx = ctx.createChildContext({ resetVisited: true });
    validateShape({
      ...args,
      schema: resolvedNot,
      ctx: childCtx
    });

    const resolutionErrors = childCtx.issues.filter(
      (issue) =>
        issue.code === 'UNRESOLVED_REF' || issue.code === 'CYCLIC_NOT_SCHEMA'
    );
    if (resolutionErrors.length > 0) {
      ctx.addIssues(resolutionErrors);
      return;
    }

    if (!childCtx.hasErrors()) {
      ctx.addError('Value matches prohibited schema');
    }
  } finally {
    ctx.popNegation(value, resolvedNot);
  }
}

export function validateShape(args: ValidationArgs): void {
  const { schema } = args;
  validateNotConstraint(args);

  if (!preValidate(args)) {
    return;
  }

  validateEnum(args);
  validateConst(args);

  checkPolymorphism(args);

  const { value } = args;
  let validator = schema.type ? validators[schema.type] : undefined;
  if (!validator) {
    if (Array.isArray(value)) {
      validator = validateArray;
    } else if (isPlainObject(value)) {
      validator = validateObject;
    }
  }

  if (validator) {
    validator(args);
  } else {
    validateBaseType(args);
  }
}
