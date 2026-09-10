import { describe, it, expect, vi } from 'vitest';
import { ValidationContext } from '../../../src/core/ValidationContext.js';
import {
  validateAllOf,
  validateAnyOf,
  validateOneOf
} from '../../../src/validators/polymorphism.js';

describe('Validators polymorphism.ts (Unit)', () => {
  it('should ignore non-object schemas in validateAllOf', () => {
    const ctx = new ValidationContext();
    const mockValidateShape = vi.fn();

    validateAllOf({
      value: 'any-value',
      schema: {
        allOf: [{ $ref: '#/components/schemas/SimpleUser' }, { type: 'string' }]
      },
      ctx,
      validateShape: mockValidateShape
    });

    expect(mockValidateShape).toHaveBeenCalledTimes(1);
  });

  it('should ignore non-object schemas in validateAnyOf', () => {
    const ctx = new ValidationContext();
    const mockValidateShape = vi.fn();

    validateAnyOf({
      value: 'any-value',
      schema: {
        anyOf: [{ $ref: '#/components/schemas/SimpleUser' }, { type: 'string' }]
      },
      ctx,
      validateShape: mockValidateShape
    });

    expect(mockValidateShape).toHaveBeenCalledTimes(1);
  });

  it('should ignore non-object schemas in validateOneOf', () => {
    const ctx = new ValidationContext();
    const mockValidateShape = vi.fn();

    validateOneOf({
      value: 'any-value',
      schema: {
        oneOf: [{ $ref: '#/components/schemas/SimpleUser' }, { type: 'string' }]
      },
      ctx,
      validateShape: mockValidateShape
    });

    expect(mockValidateShape).toHaveBeenCalledTimes(1);
  });

  it('should return early from validateAllOf if allOf is undefined', () => {
    const ctx = new ValidationContext();
    validateAllOf({
      value: 'any',
      schema: {},
      ctx,
      validateShape: vi.fn()
    });
    expect(ctx.hasErrors()).toBe(false);
  });

  it('should return early from validateAnyOf if anyOf is undefined', () => {
    const ctx = new ValidationContext();
    validateAnyOf({
      value: 'any',
      schema: {},
      ctx,
      validateShape: vi.fn()
    });
    expect(ctx.hasErrors()).toBe(false);
  });

  it('should return early from validateOneOf if oneOf is undefined', () => {
    const ctx = new ValidationContext();
    validateOneOf({
      value: 'any',
      schema: {},
      ctx,
      validateShape: vi.fn()
    });
    expect(ctx.hasErrors()).toBe(false);
  });
});
