import type { OpenAPIV3 } from 'openapi-types';
import { ValidationContext } from '../core/ValidationContext.js';
import { validateBaseType, validateArray, validateObject } from './types.js';
import { checkPolymorphism } from './polymorphism.js';

const validators: Record<
  string,
  (
    value: unknown,
    schema: OpenAPIV3.SchemaObject,
    ctx: ValidationContext
  ) => void
> = {
  string: validateBaseType,
  number: validateBaseType,
  integer: validateBaseType,
  boolean: validateBaseType,
  array: validateArray,
  object: validateObject
};

export function validateShape(
  value: unknown,
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
  if (schema.writeOnly && value !== undefined) {
    ctx.addError('Field is writeOnly and must not be present in the response');
    return;
  }

  if (value === null) {
    if (!schema.nullable) {
      ctx.addError('Field is not nullable but received null');
    }
    return;
  }

  if (value === undefined) {
    ctx.addError('Field is required but received undefined');
    return;
  }

  checkPolymorphism(value, schema, ctx);

  if (schema.type) {
    const validator = validators[schema.type];
    if (validator) {
      validator(value, schema, ctx);
    } else {
      validateBaseType(value, schema, ctx);
    }
  }
}
