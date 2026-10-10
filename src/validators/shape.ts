import type { OpenAPIV3 } from 'openapi-types';
import {
  formatNullableError,
  formatWriteOnlyError,
  formatRequiredPropertyError,
  formatCyclicNotSchemaError,
  formatProhibitedSchemaError
} from '../core/errors.js';
import { isResolutionIssue } from '../core/ValidationContext.js';
import { isPlainObject, isReferenceObject } from '../core/utils.js';
import { type ValidationArgs } from './args.js';
import { resolvePointer, resolveSchema } from './pointers.js';
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

type NullOutcome = 'reject' | 'composition-only' | 'full';

/**
 * Without `type`, `nullable` has no effect (OAS 3.0.3): null goes through
 * full validation, so enum, const and compositions decide on it.
 */
function resolveNullOutcome(schema: ValidationArgs['schema']): NullOutcome {
  if (schema.type === undefined) {
    return 'full';
  }
  return schema.nullable === true ? 'composition-only' : 'reject';
}

function preValidate(args: ValidationArgs): boolean {
  const { value, schema, ctx } = args;

  if (schema.deprecated) {
    ctx.addWarning('Schema property is deprecated');
  }

  if (schema.writeOnly && value !== undefined) {
    ctx.addError(formatWriteOnlyError());
    return false;
  }

  if (value === undefined) {
    ctx.addError(formatRequiredPropertyError());
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
    ctx.addError(formatCyclicNotSchemaError(), { code: 'CYCLIC_NOT_SCHEMA' });
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

    const resolutionErrors = childCtx.issues.filter(isResolutionIssue);
    if (resolutionErrors.length > 0) {
      ctx.addIssues(resolutionErrors);
      return;
    }

    if (!childCtx.hasErrors()) {
      ctx.addError(formatProhibitedSchemaError());
    }
  } finally {
    ctx.popNegation(value, resolvedNot);
  }
}

/**
 * Applies the null outcome and reports whether it settled validation.
 */
function settleNullValue(args: ValidationArgs): boolean {
  const { schema, value, ctx } = args;
  if (value !== null) {
    return false;
  }
  const nullOutcome = resolveNullOutcome(schema);
  switch (nullOutcome) {
    case 'reject':
      ctx.addError(formatNullableError());
      return true;
    case 'composition-only':
      // enum and const are not evaluated against a null admitted by
      // type + nullable (see "Known limitations" in CHANGELOG.md).
      checkPolymorphism(args);
      return true;
    case 'full':
      return false;
    default: {
      const unhandled: never = nullOutcome;
      throw new Error(`Unhandled null outcome: ${String(unhandled)}`);
    }
  }
}

/**
 * Follows a chain of Reference Objects (`A: { $ref: B }`) to the last one,
 * stopping on a cycle.
 */
function followReferenceChain(
  ref: OpenAPIV3.ReferenceObject,
  spec: OpenAPIV3.Document | undefined
): OpenAPIV3.ReferenceObject {
  if (!spec) {
    return ref;
  }
  const seen = new Set<string>([ref.$ref]);
  let current = ref;
  for (;;) {
    const next = resolvePointer(spec, current.$ref);
    if (!isReferenceObject(next) || seen.has(next.$ref)) {
      return current;
    }
    seen.add(next.$ref);
    current = next;
  }
}

/**
 * Only reachable from direct validateShape calls: loadSpec already
 * dereferences. OAS 3.0.3 ignores $ref siblings, so only the target counts.
 */
function validateReferenceTarget(
  args: ValidationArgs,
  ref: OpenAPIV3.ReferenceObject
): void {
  const lastRef = followReferenceChain(ref, args.ctx.spec);
  const target = resolveSchema(lastRef, args.ctx);
  if (target) {
    validateShape({ ...args, schema: target });
  }
}

export function validateShape(args: ValidationArgs): void {
  const { schema, value } = args;
  if (isReferenceObject(schema)) {
    validateReferenceTarget(args, schema);
    return;
  }

  validateNotConstraint(args);

  if (!preValidate(args) || settleNullValue(args)) {
    return;
  }

  validateEnum(args);
  validateConst(args);

  checkPolymorphism(args);

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
