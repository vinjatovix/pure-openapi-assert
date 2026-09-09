import type { OpenAPIV3 } from 'openapi-types';
import { ValidationContext } from '../core/ValidationContext.js';

export type ValidatorFn = (
  value: unknown,
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
) => void;

let validateShapeFn: ValidatorFn | null = null;

export function registerValidateShape(fn: ValidatorFn): void {
  validateShapeFn = fn;
}

export function validateShape(
  value: unknown,
  schema: OpenAPIV3.SchemaObject,
  ctx: ValidationContext
): void {
  if (!validateShapeFn) {
    throw new Error('validateShape is not registered');
  }
  validateShapeFn(value, schema, ctx);
}
