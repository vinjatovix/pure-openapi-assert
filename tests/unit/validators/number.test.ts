import { describe, it, expect, beforeEach } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';
import { validateShape } from '../../../src/validators/shape.js';
import {
  validateInt64,
  validateFloat,
  validateDouble,
  validateMinNumberConstraint,
  validateMaxNumberConstraint,
  validateMinBigIntConstraint,
  validateMaxBigIntConstraint,
  validateMultipleOfBigIntConstraint,
  validateMultipleOfNumberConstraint,
  validateMultipleOfConstraint
} from '../../../src/validators/types.js';

import {
  assertValid,
  assertHasValidationError
} from '../../helpers/assertions.js';
import { contextMother } from '../../helpers/contextMother.js';
import { SchemaBuilder } from '../../helpers/SchemaBuilder.js';
import { schemaMother } from '../../helpers/schemaMother.js';

describe('Validators number (Unit)', () => {
  let ctx: ReturnType<typeof contextMother.empty>;

  beforeEach(() => {
    ctx = contextMother.empty();
  });

  describe('validateInt64, validateFloat, and validateDouble formats', () => {
    it('should trigger validateInt64 non-number type checks', () => {
      validateInt64({
        value: true,
        schema: schemaMother.int64(),
        ctx,
        validateShape
      });

      assertHasValidationError(
        ctx,
        'Expected 64-bit integer, received boolean'
      );
    });

    it('should trigger validateInt64 with non-integer string format failure', () => {
      validateInt64({
        value: 'not-a-valid-bigint-string',
        schema: schemaMother.int64(),
        ctx,
        validateShape
      });

      assertHasValidationError(
        ctx,
        'Value not-a-valid-bigint-string is not a valid 64-bit integer'
      );
    });

    it('should trigger validateFloat non-number type checks', () => {
      validateFloat({
        value: 'not-a-number',
        schema: schemaMother.float(),
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Expected 32-bit float, received string');
    });

    it('should trigger validateDouble non-number type checks', () => {
      validateDouble({
        value: 'not-a-number',
        schema: schemaMother.double(),
        ctx,
        validateShape
      });

      assertHasValidationError(
        ctx,
        'Expected 64-bit float, received not-a-number'
      );
    });
  });

  describe('validateMinNumberConstraint and validateMaxNumberConstraint', () => {
    it('should return early from validateMinNumberConstraint if minimum is missing', () => {
      validateMinNumberConstraint({
        value: 10,
        schema: schemaMother.empty(),
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should return early from validateMinNumberConstraint if minimum is explicitly undefined (JS consumer)', () => {
      const schema = new SchemaBuilder()
        .minimum(undefined as unknown as number)
        .build();

      validateMinNumberConstraint({
        value: 10,
        schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should return early from validateMaxNumberConstraint if maximum is missing', () => {
      validateMaxNumberConstraint({
        value: 10,
        schema: schemaMother.empty(),
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should return early from validateMaxNumberConstraint if maximum is explicitly undefined (JS consumer)', () => {
      const schema = new SchemaBuilder()
        .maximum(undefined as unknown as number)
        .build();

      validateMaxNumberConstraint({
        value: 10,
        schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });
  });

  describe('validateMultipleOfNumberConstraint base precision validation', () => {
    it('should pass when value is a high-precision decimal multiple of standard floating point step', () => {
      validateMultipleOfNumberConstraint({
        value: 0.000003,
        schema: new SchemaBuilder().multipleOf(0.000001).build(),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should fail when value is not a high-precision decimal multiple of standard floating point step', () => {
      validateMultipleOfNumberConstraint({
        value: 0.0000035,
        schema: new SchemaBuilder().multipleOf(0.000001).build(),
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'is not a multiple of 0.000001');
    });

    it('should pass when value is in scientific notation and is a valid multiple of scientific step', () => {
      validateMultipleOfNumberConstraint({
        value: 3e-7,
        schema: new SchemaBuilder().multipleOf(1e-7).build(),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should pass when value is decimal scientific notation and is a valid multiple of decimal scientific step', () => {
      validateMultipleOfNumberConstraint({
        value: 4.5e-7,
        schema: new SchemaBuilder().multipleOf(1.5e-7).build(),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should pass when value is in positive scientific notation and is a valid multiple of positive scientific step', () => {
      validateMultipleOfNumberConstraint({
        value: 1e20,
        schema: new SchemaBuilder().multipleOf(1e18).build(),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('validateMultipleOfNumberConstraint should fast path integers', () => {
      const schema = new SchemaBuilder().type('number').multipleOf(5).build();

      validateMultipleOfNumberConstraint({
        value: 12,
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'is not a multiple of 5');
    });
  });

  describe('BigInt constraint validation (int64)', () => {
    const checkBigIntConstraint = (args: {
      type: 'min' | 'max';
      value: string;
      limit: number;
      exclusive?: boolean | undefined;
    }) => {
      const { type, value, limit, exclusive } = args;
      const testCtx = contextMother.empty();
      const key = type === 'min' ? 'minimum' : 'maximum';
      const exclKey = type === 'min' ? 'exclusiveMinimum' : 'exclusiveMaximum';
      const validateFn =
        type === 'min'
          ? validateMinBigIntConstraint
          : validateMaxBigIntConstraint;

      const overrides: Partial<OpenAPIV3.SchemaObject> = { [key]: limit };
      if (exclusive !== undefined) overrides[exclKey] = exclusive;

      validateFn({
        value,
        schema: schemaMother.int64(overrides),
        ctx: testCtx,
        validateShape
      });
      return testCtx;
    };

    const checkMinBigInt = (value: string, min: number, exclusive?: boolean) =>
      checkBigIntConstraint({ type: 'min', value, limit: min, exclusive });

    const checkMaxBigInt = (value: string, max: number, exclusive?: boolean) =>
      checkBigIntConstraint({ type: 'max', value, limit: max, exclusive });

    const checkMultBigInt = (value: string, multipleOf: number) => {
      const testCtx = contextMother.empty();
      validateMultipleOfBigIntConstraint({
        value,
        schema: schemaMother.int64({ multipleOf }),
        ctx: testCtx,
        validateShape
      });
      return testCtx;
    };

    describe('Decimal format limits on BigInt', () => {
      it('should pass when exclusiveMinimum is true and value is greater than decimal minimum limit', () => {
        validateMinBigIntConstraint({
          value: '2',
          schema: new SchemaBuilder()
            .type('string')
            .format('int64')
            .minimum('1.0' as unknown as number)
            .exclusiveMinimum(true)
            .build(),
          ctx,
          validateShape
        });
        assertValid(ctx);
      });

      it('should fail when exclusiveMinimum is true and value is equal to decimal minimum limit', () => {
        validateMinBigIntConstraint({
          value: '1',
          schema: new SchemaBuilder()
            .type('string')
            .format('int64')
            .minimum('1.0' as unknown as number)
            .exclusiveMinimum(true)
            .build(),
          ctx,
          validateShape
        });
        assertHasValidationError(
          ctx,
          'Value 1 is less than or equal to minimum 1.0'
        );
      });

      it('should pass when exclusiveMaximum is true and value is less than decimal maximum limit', () => {
        validateMaxBigIntConstraint({
          value: '1',
          schema: new SchemaBuilder()
            .type('string')
            .format('int64')
            .maximum('2.0' as unknown as number)
            .exclusiveMaximum(true)
            .build(),
          ctx,
          validateShape
        });
        assertValid(ctx);
      });

      it('should fail when exclusiveMaximum is true and value is equal to decimal maximum limit', () => {
        validateMaxBigIntConstraint({
          value: '2',
          schema: new SchemaBuilder()
            .type('string')
            .format('int64')
            .maximum('2.0' as unknown as number)
            .exclusiveMaximum(true)
            .build(),
          ctx,
          validateShape
        });
        assertHasValidationError(
          ctx,
          'Value 2 is greater than or equal to maximum 2.0'
        );
      });
    });

    it.each([
      {
        value: '1',
        limit: 1.5,
        excl: false,
        shouldPass: false,
        expectedErr: 'Value 1 is less than minimum 1.5'
      },
      { value: '2', limit: 1.5, excl: false, shouldPass: true },
      { value: '2', limit: 1.5, excl: true, shouldPass: true }
    ])(
      'validateMinBigIntConstraint fractional minimum: value=$value, min=$limit, exclusive=$excl',
      ({ value, limit, excl, shouldPass, expectedErr }) => {
        const testCtx = checkMinBigInt(value, limit, excl);
        if (shouldPass) assertValid(testCtx);
        else assertHasValidationError(testCtx, expectedErr!);
      }
    );

    it.each([
      {
        value: '3',
        limit: 2.5,
        excl: false,
        shouldPass: false,
        expectedErr: 'Value 3 is greater than maximum 2.5'
      },
      { value: '2', limit: 2.5, excl: false, shouldPass: true },
      { value: '2', limit: 2.5, excl: true, shouldPass: true }
    ])(
      'validateMaxBigIntConstraint fractional maximum: value=$value, max=$limit, exclusive=$excl',
      ({ value, limit, excl, shouldPass, expectedErr }) => {
        const testCtx = checkMaxBigInt(value, limit, excl);
        if (shouldPass) assertValid(testCtx);
        else assertHasValidationError(testCtx, expectedErr!);
      }
    );

    it.each([
      {
        value: '6',
        multipleOf: 2.5,
        shouldPass: false,
        expectedErr: 'Value 6 is not a multiple of 2.5'
      },
      { value: '5', multipleOf: 2.5, shouldPass: true }
    ])(
      'validateMultipleOfBigIntConstraint: value=$value, multipleOf=$multipleOf',
      ({ value, multipleOf, shouldPass, expectedErr }) => {
        const testCtx = checkMultBigInt(value, multipleOf);
        if (shouldPass) assertValid(testCtx);
        else assertHasValidationError(testCtx, expectedErr!);
      }
    );

    it('should throw exceptions on Infinity and -Infinity boundaries for BigInt constraints', () => {
      expect(() => checkMinBigInt('10', Infinity)).toThrow(TypeError);
      expect(() => checkMaxBigInt('10', -Infinity)).toThrow(TypeError);
      expect(() => checkMultBigInt('10', Infinity)).not.toThrow();
    });

    it('should ignore empty string minimum bound gracefully without treating it as 0', () => {
      validateMinBigIntConstraint({
        value: '-10',
        schema: new SchemaBuilder()
          .type('string')
          .format('int64')
          .minimum('' as unknown as number)
          .build(),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should ignore empty string maximum bound gracefully without treating it as 0', () => {
      validateMaxBigIntConstraint({
        value: '10',
        schema: new SchemaBuilder()
          .type('string')
          .format('int64')
          .maximum('   ' as unknown as number)
          .build(),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should handle multipleOf returning 0n due to floating point rounding limits gracefully', () => {
      assertValid(checkMultBigInt('123', 0.000000000000000001));
    });

    it('should handle fractional bounds that parse as integers (e.g. "10.0")', () => {
      validateMinBigIntConstraint({
        value: '9',
        schema: new SchemaBuilder()
          .type('string')
          .format('int64')
          .minimum('10.0' as unknown as number)
          .build(),
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'Value 9 is less than minimum 10.0');
    });

    it('should handle multipleOf in scientific notation (negative exponent)', () => {
      assertValid(checkMultBigInt('10000000', 1e-7));
    });

    it('should handle multipleOf in scientific notation (positive exponent)', () => {
      assertValid(checkMultBigInt('1000000000000000000000', 1e21));
    });

    it('should return undefined if bound parses to NaN', () => {
      validateMinBigIntConstraint({
        value: '10',
        schema: new SchemaBuilder()
          .type('string')
          .format('int64')
          .minimum('not-a-number' as unknown as number)
          .build(),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should return early on invalid integer strings in validateMinBigIntConstraint', () => {
      assertValid(checkMinBigInt('abc', 10));
    });

    it('should return early on invalid integer strings in validateMaxBigIntConstraint', () => {
      assertValid(checkMaxBigInt('abc', 10));
    });

    describe('BigInt exclusive boundary constraints', () => {
      it.each([
        {
          value: '10',
          min: 10,
          excl: true,
          shouldPass: false,
          expectedErr: 'is less than or equal to minimum 10'
        },
        { value: '10', min: 10, excl: false, shouldPass: true },
        {
          value: '10',
          min: 10.5,
          excl: true,
          shouldPass: false,
          expectedErr: 'is less than or equal to minimum 10.5'
        }
      ])(
        'validateMinBigIntConstraint: value=$value, min=$min, excl=$excl',
        ({ value, min, excl, shouldPass, expectedErr }) => {
          const testCtx = checkMinBigInt(value, min, excl);
          if (shouldPass) assertValid(testCtx);
          else assertHasValidationError(testCtx, expectedErr!);
        }
      );

      it.each([
        {
          value: '10',
          max: 10,
          excl: true,
          shouldPass: false,
          expectedErr: 'is greater than or equal to maximum 10'
        },
        { value: '10', max: 10, excl: false, shouldPass: true },
        {
          value: '10',
          max: 9.5,
          excl: true,
          shouldPass: false,
          expectedErr: 'is greater than or equal to maximum 9.5'
        }
      ])(
        'validateMaxBigIntConstraint: value=$value, max=$max, excl=$excl',
        ({ value, max, excl, shouldPass, expectedErr }) => {
          const testCtx = checkMaxBigInt(value, max, excl);
          if (shouldPass) assertValid(testCtx);
          else assertHasValidationError(testCtx, expectedErr!);
        }
      );
    });

    it('should ignore validation if value is not a valid integer string in validateMultipleOfBigIntConstraint', () => {
      assertValid(checkMultBigInt('abc', 5));
    });

    describe('validateMultipleOfBigIntConstraint handling', () => {
      it.each([
        { value: '10', mult: undefined },
        { value: '10', mult: 0 },
        { value: '10', mult: -2 },
        { value: '11', mult: -2 }
      ])('should ignore validation for multipleOf=$mult', ({ value, mult }) => {
        assertValid(checkMultBigInt(value, mult!));
      });
    });

    describe('parseBigIntBound handling', () => {
      it('should return undefined when bound is null', () => {
        validateMinBigIntConstraint({
          value: '-10',
          schema: new SchemaBuilder()
            .type('string')
            .format('int64')
            .minimum(null as unknown as number)
            .build(),
          ctx,
          validateShape
        });
        assertValid(ctx);
      });

      it('should return undefined when bound is an unsupported object type', () => {
        validateMinBigIntConstraint({
          value: '-10',
          schema: new SchemaBuilder()
            .type('string')
            .format('int64')
            .minimum({} as unknown as number)
            .build(),
          ctx,
          validateShape
        });
        assertValid(ctx);
      });
    });

    it('should support schema bound defined directly as bigint', () => {
      validateMinBigIntConstraint({
        value: '9',
        schema: new SchemaBuilder()
          .type('string')
          .format('int64')
          .minimum(10n as unknown as number)
          .build(),
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'Value 9 is less than minimum 10');
    });

    it('should parse non-empty string bounds successfully in parseBigIntBound', () => {
      validateMinBigIntConstraint({
        value: '9',
        schema: new SchemaBuilder()
          .type('string')
          .format('int64')
          .minimum('10' as unknown as number)
          .build(),
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'Value 9 is less than minimum 10');
    });

    it('should calculate decimal places for exponential numbers with decimal bases correctly (e.g. 1.5e-7)', () => {
      assertValid(checkMultBigInt('15', 1.5e-7));
    });

    it('should handle positive scientific notation exponents in getDecimalPlaces', () => {
      validateMultipleOfConstraint({
        value: 1e21,
        schema: schemaMother.number({ multipleOf: 1e21 }),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should return early in validateMultipleOfNumberConstraint if multipleOf is undefined', () => {
      validateMultipleOfNumberConstraint({
        value: 10,
        schema: schemaMother.empty(),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });
  });

  describe('Robustness tests for multipleOf constraints', () => {
    describe('validateMultipleOfNumberConstraint robustness', () => {
      it('should gracefully ignore validation when multipleOf is 0', () => {
        expect(() => {
          validateMultipleOfNumberConstraint({
            value: 10,
            schema: new SchemaBuilder().type('number').multipleOf(0).build(),
            ctx,
            validateShape
          });
        }).not.toThrow();
        assertValid(ctx);
      });

      it('should gracefully ignore validation when multipleOf is negative', () => {
        expect(() => {
          validateMultipleOfNumberConstraint({
            value: 10,
            schema: new SchemaBuilder().type('number').multipleOf(-2).build(),
            ctx,
            validateShape
          });
        }).not.toThrow();
        assertValid(ctx);
      });

      it('should gracefully ignore validation when multipleOf is non-numeric', () => {
        expect(() => {
          validateMultipleOfNumberConstraint({
            value: 10,
            schema: new SchemaBuilder()
              .type('number')
              .multipleOf('not-a-number' as unknown as number)
              .build(),
            ctx,
            validateShape
          });
        }).not.toThrow();
        assertValid(ctx);
      });

      it('should gracefully ignore validation when multipleOf is Infinity', () => {
        expect(() => {
          validateMultipleOfNumberConstraint({
            value: 10,
            schema: new SchemaBuilder()
              .type('number')
              .multipleOf(Infinity)
              .build(),
            ctx,
            validateShape
          });
        }).not.toThrow();
        assertValid(ctx);
      });

      it('should handle extreme multipliers that overflow to Infinity without throwing', () => {
        expect(() => {
          validateMultipleOfNumberConstraint({
            value: 10,
            schema: new SchemaBuilder()
              .type('number')
              .multipleOf(Number.MIN_VALUE)
              .build(),
            ctx,
            validateShape
          });
        }).not.toThrow();
        assertValid(ctx);
      });

      it('should handle calculations that overflow during rounding without throwing', () => {
        expect(() => {
          validateMultipleOfNumberConstraint({
            value: 1.0000000001,
            schema: new SchemaBuilder()
              .type('number')
              .multipleOf(1e300)
              .build(),
            ctx,
            validateShape
          });
        }).not.toThrow();
        assertValid(ctx);
      });
    });
  });
});
