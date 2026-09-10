import { describe, it, expect, vi } from 'vitest';
import { ValidationContext } from '../../../src/core/ValidationContext.js';
import { validateShape } from '../../../src/validators/shape.js';
import {
  validateObject,
  validateArray,
  validateArrayItems,
  validateTypeCheck,
  validateInt64,
  validateFloat,
  validateDouble,
  validateMinNumberConstraint,
  validateMaxNumberConstraint,
  validateMinBigIntConstraint,
  validateMaxBigIntConstraint,
  validateMultipleOfBigIntConstraint,
  validateRequiredFields,
  validateAdditionalProperties,
  validateMultipleOfNumberConstraint,
  validateMultipleOfConstraint
} from '../../../src/validators/types.js';

describe('Validators types.ts (Unit)', () => {
  it('should handle undefined properties in validateObject with Object.keys', () => {
    const ctx = new ValidationContext();
    const mockValidateShape = vi.fn();

    validateObject({
      value: { id: 123 },
      schema: {
        type: 'object'
      },
      ctx,
      validateShape: mockValidateShape
    });

    expect(ctx.hasErrors()).toBe(false);
  });

  it('should return early from validateArrayItems if itemsSchema is not a valid SchemaObject', () => {
    const ctx = new ValidationContext();
    const mockValidateShape = vi.fn();

    validateArrayItems({
      value: [1, 2, 3],
      schema: {
        type: 'array',
        items: { $ref: '#/components/schemas/SimpleUser' }
      },
      ctx,
      validateShape: mockValidateShape
    });

    expect(mockValidateShape).not.toHaveBeenCalled();
  });

  it('should prevent infinite loops inside validateArray for circular structures using real validateShape', () => {
    const ctx = new ValidationContext();
    const arr: unknown[] = [];
    arr.push(arr);

    const circularSchema: Record<string, unknown> = {
      type: 'array'
    };
    circularSchema.items = circularSchema;

    validateArray({
      value: arr,
      schema: circularSchema,
      ctx,
      validateShape
    });

    expect(ctx.hasErrors()).toBe(false);
  });

  it('should prevent infinite loops inside validateObject for circular structures using real validateShape', () => {
    const ctx = new ValidationContext();
    const obj: Record<string, unknown> = {};
    obj['self'] = obj;

    const circularSchema: Record<string, unknown> = {
      type: 'object',
      properties: {}
    };
    (circularSchema.properties as Record<string, unknown>).self = circularSchema;

    validateObject({
      value: obj,
      schema: circularSchema,
      ctx,
      validateShape
    });

    expect(ctx.hasErrors()).toBe(false);
  });

  it('should fail typecheck for wrong expected type and report errors', () => {
    const ctx = new ValidationContext();
    const success = validateTypeCheck({
      value: 'string',
      schema: { type: 'integer' },
      ctx,
      validateShape: vi.fn()
    });

    expect(success).toBe(false);
    expect(ctx.errors[0]).toContain('Expected integer, received string');
  });

  it('should trigger validateInt64 non-number type checks', () => {
    const ctx = new ValidationContext();
    validateInt64({
      value: true,
      schema: { format: 'int64' },
      ctx,
      validateShape: vi.fn()
    });
    expect(ctx.errors[0]).toContain(
      'Expected 64-bit integer, received boolean'
    );
  });

  it('should trigger validateInt64 with non-integer string format failure', () => {
    const ctx = new ValidationContext();
    validateInt64({
      value: 'not-a-valid-bigint-string',
      schema: { format: 'int64' },
      ctx,
      validateShape: vi.fn()
    });
    expect(ctx.errors[0]).toContain(
      'Value not-a-valid-bigint-string is not a valid 64-bit integer'
    );
  });

  it('should trigger validateFloat non-number type checks', () => {
    const ctx = new ValidationContext();
    validateFloat({
      value: 'not-a-number',
      schema: { format: 'float' },
      ctx,
      validateShape: vi.fn()
    });
    expect(ctx.errors[0]).toContain('Expected 32-bit float, received string');
  });

  it('should trigger validateDouble non-number type checks', () => {
    const ctx = new ValidationContext();
    validateDouble({
      value: 'not-a-number',
      schema: { format: 'double' },
      ctx,
      validateShape: vi.fn()
    });
    expect(ctx.errors[0]).toContain(
      'Expected 64-bit float, received not-a-number'
    );
  });

  it('should return early from validateMinNumberConstraint if minimum is undefined', () => {
    const ctx = new ValidationContext();
    validateMinNumberConstraint({
      value: 10,
      schema: { minimum: undefined },
      ctx,
      validateShape: vi.fn()
    });
    expect(ctx.hasErrors()).toBe(false);
  });

  it('should return early from validateMaxNumberConstraint if maximum is undefined', () => {
    const ctx = new ValidationContext();
    validateMaxNumberConstraint({
      value: 10,
      schema: { maximum: undefined },
      ctx,
      validateShape: vi.fn()
    });
    expect(ctx.hasErrors()).toBe(false);
  });

  it('should validate multipleOf correctly with high floating-point precision', () => {
    const ctx = new ValidationContext();
    validateMultipleOfNumberConstraint({
      value: 0.000003,
      schema: { multipleOf: 0.000001 },
      ctx,
      validateShape: vi.fn()
    });
    expect(ctx.hasErrors()).toBe(false);

    const ctxFail = new ValidationContext();
    validateMultipleOfNumberConstraint({
      value: 0.0000035,
      schema: { multipleOf: 0.000001 },
      ctx: ctxFail,
      validateShape: vi.fn()
    });
    expect(ctxFail.hasErrors()).toBe(true);
    expect(ctxFail.errors[0]).toContain('is not a multiple of 0.000001');

    const ctxScientific = new ValidationContext();
    validateMultipleOfNumberConstraint({
      value: 3e-7,
      schema: { multipleOf: 1e-7 },
      ctx: ctxScientific,
      validateShape: vi.fn()
    });
    expect(ctxScientific.hasErrors()).toBe(false);

    const ctxScientificDecimal = new ValidationContext();
    validateMultipleOfNumberConstraint({
      value: 4.5e-7,
      schema: { multipleOf: 1.5e-7 },
      ctx: ctxScientificDecimal,
      validateShape: vi.fn()
    });
    expect(ctxScientificDecimal.hasErrors()).toBe(false);

    const ctxScientificPositive = new ValidationContext();
    validateMultipleOfNumberConstraint({
      value: 1e20,
      schema: { multipleOf: 1e18 },
      ctx: ctxScientificPositive,
      validateShape: vi.fn()
    });
    expect(ctxScientificPositive.hasErrors()).toBe(false);
  });

  it('should validate minProperties and maxProperties constraints on objects', () => {
    const ctxMinFail = new ValidationContext();
    validateObject({
      value: { a: 1 },
      schema: { type: 'object', minProperties: 2 },
      ctx: ctxMinFail,
      validateShape: vi.fn()
    });
    expect(ctxMinFail.errors[0]).toContain(
      'Object has 1 properties, minimum is 2'
    );

    const ctxMaxFail = new ValidationContext();
    validateObject({
      value: { a: 1, b: 2, c: 3 },
      schema: { type: 'object', maxProperties: 2 },
      ctx: ctxMaxFail,
      validateShape: vi.fn()
    });
    expect(ctxMaxFail.errors[0]).toContain(
      'Object has 3 properties, maximum is 2'
    );
  });

  it('should throw error when non-nullable field receives null', () => {
    const ctx = new ValidationContext();
    validateShape({
      value: null,
      schema: { type: 'string', nullable: false },
      ctx,
      validateShape: vi.fn()
    });
    expect(ctx.errors[0]).toContain('Field is not nullable but received null');
  });

  it('should throw error when validateShape receives undefined directly', () => {
    const ctx = new ValidationContext();
    validateShape({
      value: undefined,
      schema: { type: 'string' },
      ctx,
      validateShape: vi.fn()
    });
    expect(ctx.errors[0]).toContain('Field is required but received undefined');
  });

  it('should not crash or resolve prototype properties as format validators', () => {
    const ctx = new ValidationContext();
    validateShape({
      value: 'some-value',
      schema: { type: 'string', format: 'hasOwnProperty' },
      ctx,
      validateShape
    });
    expect(ctx.hasErrors()).toBe(false);
  });

  it('should ignore custom formats that match prototype properties if not defined on customFormats', () => {
    const ctx = new ValidationContext();
    validateShape({
      value: 'some-value',
      schema: { type: 'string', format: 'toString' },
      ctx,
      validateShape,
      customFormats: {}
    });
    expect(ctx.hasErrors()).toBe(false);
  });

  describe('BigInt constraint validation (int64)', () => {
    it('should correctly handle integer limits defined as decimals (e.g. minimum: "1.0")', () => {
      const ctxExclusivePass = new ValidationContext();
      validateMinBigIntConstraint({
        value: '2',
        schema: {
          type: 'string',
          format: 'int64',
          minimum: '1.0' as unknown as number,
          exclusiveMinimum: true
        },
        ctx: ctxExclusivePass,
        validateShape: vi.fn()
      });
      expect(ctxExclusivePass.hasErrors()).toBe(false);

      const ctxExclusiveFail = new ValidationContext();
      validateMinBigIntConstraint({
        value: '1',
        schema: {
          type: 'string',
          format: 'int64',
          minimum: '1.0' as unknown as number,
          exclusiveMinimum: true
        },
        ctx: ctxExclusiveFail,
        validateShape: vi.fn()
      });
      expect(ctxExclusiveFail.hasErrors()).toBe(true);
      expect(ctxExclusiveFail.errors[0]).toContain(
        'Value 1 is less than or equal to minimum 1.0'
      );

      const ctxMaxExclusivePass = new ValidationContext();
      validateMaxBigIntConstraint({
        value: '1',
        schema: {
          type: 'string',
          format: 'int64',
          maximum: '2.0' as unknown as number,
          exclusiveMaximum: true
        },
        ctx: ctxMaxExclusivePass,
        validateShape: vi.fn()
      });
      expect(ctxMaxExclusivePass.hasErrors()).toBe(false);

      const ctxMaxExclusiveFail = new ValidationContext();
      validateMaxBigIntConstraint({
        value: '2',
        schema: {
          type: 'string',
          format: 'int64',
          maximum: '2.0' as unknown as number,
          exclusiveMaximum: true
        },
        ctx: ctxMaxExclusiveFail,
        validateShape: vi.fn()
      });
      expect(ctxMaxExclusiveFail.hasErrors()).toBe(true);
      expect(ctxMaxExclusiveFail.errors[0]).toContain(
        'Value 2 is greater than or equal to maximum 2.0'
      );
    });

    it('should validate fractional minimum limits on BigInt (minimum: 1.5)', () => {
      const ctx = new ValidationContext();

      validateMinBigIntConstraint({
        value: '1',
        schema: { type: 'string', format: 'int64', minimum: 1.5 },
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(true);
      expect(ctx.errors[0]).toContain('Value 1 is less than minimum 1.5');

      const ctxPass = new ValidationContext();
      validateMinBigIntConstraint({
        value: '2',
        schema: { type: 'string', format: 'int64', minimum: 1.5 },
        ctx: ctxPass,
        validateShape: vi.fn()
      });
      expect(ctxPass.hasErrors()).toBe(false);

      const ctxExclusivePass = new ValidationContext();
      validateMinBigIntConstraint({
        value: '2',
        schema: {
          type: 'string',
          format: 'int64',
          minimum: 1.5,
          exclusiveMinimum: true
        },
        ctx: ctxExclusivePass,
        validateShape: vi.fn()
      });
      expect(ctxExclusivePass.hasErrors()).toBe(false);
    });

    it('should validate fractional maximum limits on BigInt (maximum: 2.5)', () => {
      const ctx = new ValidationContext();

      validateMaxBigIntConstraint({
        value: '3',
        schema: { type: 'string', format: 'int64', maximum: 2.5 },
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(true);
      expect(ctx.errors[0]).toContain('Value 3 is greater than maximum 2.5');

      const ctxPass = new ValidationContext();
      validateMaxBigIntConstraint({
        value: '2',
        schema: { type: 'string', format: 'int64', maximum: 2.5 },
        ctx: ctxPass,
        validateShape: vi.fn()
      });
      expect(ctxPass.hasErrors()).toBe(false);

      const ctxExclusivePass = new ValidationContext();
      validateMaxBigIntConstraint({
        value: '2',
        schema: {
          type: 'string',
          format: 'int64',
          maximum: 2.5,
          exclusiveMaximum: true
        },
        ctx: ctxExclusivePass,
        validateShape: vi.fn()
      });
      expect(ctxExclusivePass.hasErrors()).toBe(false);
    });

    it('should validate fractional multipleOf on BigInt (multipleOf: 2.5)', () => {
      const ctx = new ValidationContext();

      validateMultipleOfBigIntConstraint({
        value: '6',
        schema: { type: 'string', format: 'int64', multipleOf: 2.5 },
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(true);
      expect(ctx.errors[0]).toContain('Value 6 is not a multiple of 2.5');

      const ctxPass = new ValidationContext();
      validateMultipleOfBigIntConstraint({
        value: '5',
        schema: { type: 'string', format: 'int64', multipleOf: 2.5 },
        ctx: ctxPass,
        validateShape: vi.fn()
      });
      expect(ctxPass.hasErrors()).toBe(false);
    });

    it('should throw exceptions on Infinity and -Infinity boundaries for BigInt constraints', () => {
      const ctxMin = new ValidationContext();
      expect(() => {
        validateMinBigIntConstraint({
          value: '10',
          schema: { type: 'string', format: 'int64', minimum: Infinity },
          ctx: ctxMin,
          validateShape: vi.fn()
        });
      }).toThrow(TypeError);

      const ctxMax = new ValidationContext();
      expect(() => {
        validateMaxBigIntConstraint({
          value: '10',
          schema: { type: 'string', format: 'int64', maximum: -Infinity },
          ctx: ctxMax,
          validateShape: vi.fn()
        });
      }).toThrow(TypeError);

      const ctxMult = new ValidationContext();
      expect(() => {
        validateMultipleOfBigIntConstraint({
          value: '10',
          schema: { type: 'string', format: 'int64', multipleOf: Infinity },
          ctx: ctxMult,
          validateShape: vi.fn()
        });
      }).not.toThrow();
    });

    it('should ignore empty string bounds gracefully without treating them as 0', () => {
      const ctxMin = new ValidationContext();
      validateMinBigIntConstraint({
        value: '-10',
        schema: {
          type: 'string',
          format: 'int64',
          minimum: '' as unknown as number
        },
        ctx: ctxMin,
        validateShape: vi.fn()
      });
      expect(ctxMin.hasErrors()).toBe(false);

      const ctxMax = new ValidationContext();
      validateMaxBigIntConstraint({
        value: '10',
        schema: {
          type: 'string',
          format: 'int64',
          maximum: '   ' as unknown as number
        },
        ctx: ctxMax,
        validateShape: vi.fn()
      });
      expect(ctxMax.hasErrors()).toBe(false);
    });

    it('should handle multipleOf returning 0n due to floating point rounding limits gracefully', () => {
      const ctx = new ValidationContext();
      validateMultipleOfBigIntConstraint({
        value: '123',
        schema: {
          type: 'string',
          format: 'int64',
          multipleOf: 0.000000000000000001
        },
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(false);
    });

    it('should handle fractional bounds that parse as integers (e.g. "10.0")', () => {
      const ctx = new ValidationContext();
      validateMinBigIntConstraint({
        value: '9',
        schema: { type: 'string', format: 'int64', minimum: '10.0' as unknown as number },
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(true);
      expect(ctx.errors[0]).toContain('Value 9 is less than minimum 10.0');
    });

    it('should handle multipleOf in scientific notation (negative exponent)', () => {
      const ctx = new ValidationContext();
      validateMultipleOfBigIntConstraint({
        value: '10000000',
        schema: { type: 'string', format: 'int64', multipleOf: 1e-7 },
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(false);
    });

    it('should handle multipleOf in scientific notation (positive exponent)', () => {
      const ctx = new ValidationContext();
      validateMultipleOfBigIntConstraint({
        value: '1000000000000000000000',
        schema: { type: 'string', format: 'int64', multipleOf: 1e21 },
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(false);
    });

    it('should return undefined if bound parses to NaN', () => {
      const ctx = new ValidationContext();
      validateMinBigIntConstraint({
        value: '10',
        schema: { type: 'string', format: 'int64', minimum: 'not-a-number' as unknown as number },
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(false);
    });

    it('should return early on invalid integer strings in validateMinBigIntConstraint and validateMaxBigIntConstraint', () => {
      const ctxMin = new ValidationContext();
      validateMinBigIntConstraint({
        value: 'abc',
        schema: { type: 'string', format: 'int64', minimum: 10 },
        ctx: ctxMin,
        validateShape: vi.fn()
      });
      expect(ctxMin.hasErrors()).toBe(false);

      const ctxMax = new ValidationContext();
      validateMaxBigIntConstraint({
        value: 'abc',
        schema: { type: 'string', format: 'int64', maximum: 10 },
        ctx: ctxMax,
        validateShape: vi.fn()
      });
      expect(ctxMax.hasErrors()).toBe(false);
    });

    it('should return early in validateObject if value is an array', () => {
      const ctx = new ValidationContext();
      validateObject({
        value: [1, 2, 3],
        schema: { type: 'object' },
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(true);
      expect(ctx.errors[0]).toContain('Expected object, received object');
    });

    it('should format type validation error for null values correctly', () => {
      const ctx = new ValidationContext();
      validateTypeCheck({
        value: null,
        schema: { type: 'string' },
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(true);
      expect(ctx.errors[0]).toContain('received null');
    });

    it('should cover all exclusiveMinimum/exclusiveMaximum branches on BigInt', () => {
      // 1. exclusiveMinimum true with non-fractional
      const ctx1 = new ValidationContext();
      validateMinBigIntConstraint({
        value: '10',
        schema: { type: 'string', format: 'int64', minimum: 10, exclusiveMinimum: true },
        ctx: ctx1,
        validateShape: vi.fn()
      });
      expect(ctx1.hasErrors()).toBe(true);

      // 2. exclusiveMinimum false with non-fractional
      const ctx2 = new ValidationContext();
      validateMinBigIntConstraint({
        value: '10',
        schema: { type: 'string', format: 'int64', minimum: 10, exclusiveMinimum: false },
        ctx: ctx2,
        validateShape: vi.fn()
      });
      expect(ctx2.hasErrors()).toBe(false);

      // 3. exclusiveMinimum true with fractional (isFractional === true)
      const ctx3 = new ValidationContext();
      validateMinBigIntConstraint({
        value: '10',
        schema: { type: 'string', format: 'int64', minimum: 10.5, exclusiveMinimum: true },
        ctx: ctx3,
        validateShape: vi.fn()
      });
      expect(ctx3.hasErrors()).toBe(true);

      // 4. exclusiveMaximum true with non-fractional
      const ctx4 = new ValidationContext();
      validateMaxBigIntConstraint({
        value: '10',
        schema: { type: 'string', format: 'int64', maximum: 10, exclusiveMaximum: true },
        ctx: ctx4,
        validateShape: vi.fn()
      });
      expect(ctx4.hasErrors()).toBe(true);

      // 5. exclusiveMaximum false with non-fractional
      const ctx5 = new ValidationContext();
      validateMaxBigIntConstraint({
        value: '10',
        schema: { type: 'string', format: 'int64', maximum: 10, exclusiveMaximum: false },
        ctx: ctx5,
        validateShape: vi.fn()
      });
      expect(ctx5.hasErrors()).toBe(false);

      // 6. exclusiveMaximum true with fractional (isFractional === true)
      const ctx6 = new ValidationContext();
      validateMaxBigIntConstraint({
        value: '10',
        schema: { type: 'string', format: 'int64', maximum: 9.5, exclusiveMaximum: true },
        ctx: ctx6,
        validateShape: vi.fn()
      });
      expect(ctx6.hasErrors()).toBe(true);
    });

    it('should ignore validation if value is not a valid integer string in validateMultipleOfBigIntConstraint', () => {
      const ctx = new ValidationContext();
      validateMultipleOfBigIntConstraint({
        value: 'abc',
        schema: { type: 'string', format: 'int64', multipleOf: 5 },
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(false);
    });

    it('should ignore validation if multipleOf is undefined, 0, or negative in validateMultipleOfBigIntConstraint', () => {
      // undefined (directly testing helper logic)
      const ctx1 = new ValidationContext();
      validateMultipleOfBigIntConstraint({
        value: '10',
        schema: { type: 'string', format: 'int64' },
        ctx: ctx1,
        validateShape: vi.fn()
      });
      expect(ctx1.hasErrors()).toBe(false);

      // 0
      const ctx2 = new ValidationContext();
      validateMultipleOfBigIntConstraint({
        value: '10',
        schema: { type: 'string', format: 'int64', multipleOf: 0 },
        ctx: ctx2,
        validateShape: vi.fn()
      });
      expect(ctx2.hasErrors()).toBe(false);

      // negative
      const ctx3 = new ValidationContext();
      validateMultipleOfBigIntConstraint({
        value: '10',
        schema: { type: 'string', format: 'int64', multipleOf: -2 },
        ctx: ctx3,
        validateShape: vi.fn()
      });
      expect(ctx3.hasErrors()).toBe(false);
    });

    it('should return undefined in parseBigIntBound if bound is null, empty string, or unsupported type', () => {
      // null
      const ctx1 = new ValidationContext();
      validateMinBigIntConstraint({
        value: '-10',
        schema: { type: 'string', format: 'int64', minimum: null as unknown as number },
        ctx: ctx1,
        validateShape: vi.fn()
      });
      expect(ctx1.hasErrors()).toBe(false);

      // unsupported type (object)
      const ctx2 = new ValidationContext();
      validateMinBigIntConstraint({
        value: '-10',
        schema: { type: 'string', format: 'int64', minimum: {} as unknown as number },
        ctx: ctx2,
        validateShape: vi.fn()
      });
      expect(ctx2.hasErrors()).toBe(false);
    });

    it('should parse non-empty string bounds successfully in parseBigIntBound', () => {
      const ctx = new ValidationContext();
      validateMinBigIntConstraint({
        value: '9',
        schema: { type: 'string', format: 'int64', minimum: '10' as unknown as number },
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(true);
      expect(ctx.errors[0]).toContain('Value 9 is less than minimum 10');
    });

    it('should calculate decimal places for exponential numbers with decimal bases correctly (e.g. 1.5e-7)', () => {
      const ctx = new ValidationContext();
      validateMultipleOfBigIntConstraint({
        value: '15',
        schema: { type: 'string', format: 'int64', multipleOf: 1.5e-7 },
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(false);
    });

    it('should fail validation when validating null value in validateObject', () => {
      const ctx = new ValidationContext();
      validateObject({
        value: null,
        schema: { type: 'object' },
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(true);
      expect(ctx.errors[0]).toContain('Expected object, received null');
    });

    it('should return early in validateRequiredFields if required is undefined', () => {
      const ctx = new ValidationContext();
      validateRequiredFields({
        value: { id: 123 },
        schema: {},
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(false);
    });

    it('should support additionalProperties: true', () => {
      const ctx = new ValidationContext();
      validateObject({
        value: { foo: 'bar', extra: 123 },
        schema: {
          type: 'object',
          properties: {
            foo: { type: 'string' }
          },
          additionalProperties: true
        },
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(false);
    });

    it('should support direct call of validateAdditionalProperties without passing keys', () => {
      const ctx = new ValidationContext();
      validateAdditionalProperties({
        value: { foo: 'bar', extra: 123 },
        schema: {
          type: 'object',
          properties: {
            foo: { type: 'string' }
          },
          additionalProperties: false
        },
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(true);
      expect(ctx.errors[0]).toContain("Key 'extra' is not allowed by OpenAPI schema");
    });

    it('should handle extremely small multipleOf causing Infinity error and fallback to 0n gracefully', () => {
      const ctx = new ValidationContext();
      validateMultipleOfBigIntConstraint({
        value: '10',
        schema: { type: 'string', format: 'int64', multipleOf: 1e-310 },
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(false);
    });

    it('should handle positive scientific notation exponents in getDecimalPlaces', () => {
      const ctx = new ValidationContext();
      validateMultipleOfConstraint({
        value: 1e21,
        schema: { type: 'number', multipleOf: 1e21 },
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(false);
    });

    it('should return early in validateMultipleOfNumberConstraint if multipleOf is undefined', () => {
      const ctx = new ValidationContext();
      validateMultipleOfNumberConstraint({
        value: 10,
        schema: {},
        ctx,
        validateShape: vi.fn()
      });
      expect(ctx.hasErrors()).toBe(false);
    });
  });
});
