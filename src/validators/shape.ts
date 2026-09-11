import { checkPolymorphism } from './polymorphism.js';
import {
  type ValidationArgs,
  validateArray,
  validateBaseType,
  validateObject,
  validateConst,
  validateEnum
} from './types.js';

const validators: Record<string, (args: ValidationArgs) => void> = {
  string: validateBaseType,
  number: validateBaseType,
  integer: validateBaseType,
  boolean: validateBaseType,
  array: validateArray,
  object: validateObject
};

export function validateShape(args: ValidationArgs): void {
  const { value, schema, ctx } = args;

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

  validateEnum(args);
  validateConst(args);

  checkPolymorphism(args);

  const validator = schema.type ? validators[schema.type] : undefined;
  if (validator) {
    validator(args);
  } else {
    validateBaseType(args);
  }
}
