import { describe, it, expect, beforeEach } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';
import { validateShape } from '../../../src/validators/shape.js';
import {
  validateMinConstraint,
  validateMaxConstraint,
  validateMultipleOfConstraint,
  validateNumberFormatConstraint,
  validateNumberConstraints
} from '../../../src/validators/number.js';

import {
  assertValid,
  assertHasValidationError
} from '../../helpers/assertions.js';
import { contextMother } from '../../helpers/contextMother.js';
import { schemaMother } from '../../helpers/schemaMother.js';

describe('validators/number', () => {
  let ctx: ReturnType<typeof contextMother.empty>;

  beforeEach(() => {
    ctx = contextMother.empty();
  });

  describe('validateNumberFormatConstraint formats', () => {
    it('should trigger validateInt64 non-number type checks', () => {
      validateNumberFormatConstraint({
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
      validateNumberFormatConstraint({
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
      validateNumberFormatConstraint({
        value: 'not-a-number',
        schema: schemaMother.float(),
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Expected 32-bit float, received string');
    });

    it('should trigger validateDouble non-number type checks', () => {
      validateNumberFormatConstraint({
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

  describe('validateNumberConstraints bounds checks', () => {
    it('should return early if minimum is missing', () => {
      const schema = schemaMother.empty();
      validateNumberConstraints({
        value: 10,
        schema: schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should return early if minimum is explicitly undefined (JS consumer)', () => {
      const schema = schemaMother.empty({
        minimum: undefined as unknown as number
      });

      validateNumberConstraints({
        value: 10,
        schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should return early if maximum is missing', () => {
      const schema = schemaMother.empty();
      validateNumberConstraints({
        value: 10,
        schema: schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should return early if maximum is explicitly undefined (JS consumer)', () => {
      const schema = schemaMother.empty({
        maximum: undefined as unknown as number
      });

      validateNumberConstraints({
        value: 10,
        schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });
  });

  describe('MultipleOf base precision validation', () => {
    it('should pass when value is a high-precision decimal multiple of standard floating point step', () => {
      const schema = schemaMother.empty({ multipleOf: 0.000001 });
      validateNumberConstraints({
        value: 0.000003,
        schema: schema,
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should fail when value is not a high-precision decimal multiple of standard floating point step', () => {
      const schema = schemaMother.empty({ multipleOf: 0.000001 });
      validateNumberConstraints({
        value: 0.0000035,
        schema: schema,
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'is not a multiple of 0.000001');
    });

    it('should pass when value is in scientific notation and is a valid multiple of scientific step', () => {
      const schema = schemaMother.empty({ multipleOf: 1e-7 });
      validateNumberConstraints({
        value: 3e-7,
        schema: schema,
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should pass when value is decimal scientific notation and is a valid multiple of decimal scientific step', () => {
      const schema = schemaMother.empty({ multipleOf: 1.5e-7 });
      validateNumberConstraints({
        value: 4.5e-7,
        schema: schema,
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should pass when value is in positive scientific notation and is a valid multiple of positive scientific step', () => {
      const schema = schemaMother.empty({ multipleOf: 1e18 });
      validateNumberConstraints({
        value: 1e20,
        schema: schema,
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should fast path integers', () => {
      const schema = schemaMother.number({ multipleOf: 5 });

      validateNumberConstraints({
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
        type === 'min' ? validateMinConstraint : validateMaxConstraint;

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
      validateMultipleOfConstraint({
        value,
        schema: schemaMother.int64({ multipleOf }),
        ctx: testCtx,
        validateShape
      });
      return testCtx;
    };

    describe('Decimal format limits on BigInt', () => {
      it('should pass when exclusiveMinimum is true and value is greater than decimal minimum limit', () => {
        const schema = schemaMother.int64({
          minimum: '1.0' as unknown as number,
          exclusiveMinimum: true
        });
        validateMinConstraint({
          value: '2',
          schema: schema,
          ctx,
          validateShape
        });
        assertValid(ctx);
      });

      it('should fail when exclusiveMinimum is true and value is equal to decimal minimum limit', () => {
        const schema = schemaMother.int64({
          minimum: '1.0' as unknown as number,
          exclusiveMinimum: true
        });
        validateMinConstraint({
          value: '1',
          schema: schema,
          ctx,
          validateShape
        });
        assertHasValidationError(
          ctx,
          'Value 1 is less than or equal to minimum 1.0'
        );
      });

      it('should pass when exclusiveMaximum is true and value is less than decimal maximum limit', () => {
        const schema = schemaMother.int64({
          maximum: '2.0' as unknown as number,
          exclusiveMaximum: true
        });
        validateMaxConstraint({
          value: '1',
          schema: schema,
          ctx,
          validateShape
        });
        assertValid(ctx);
      });

      it('should fail when exclusiveMaximum is true and value is equal to decimal maximum limit', () => {
        const schema = schemaMother.int64({
          maximum: '2.0' as unknown as number,
          exclusiveMaximum: true
        });
        validateMaxConstraint({
          value: '2',
          schema: schema,
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
      'validateMinConstraint fractional minimum: value=$value, min=$limit, exclusive=$excl',
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
      'validateMaxConstraint fractional maximum: value=$value, max=$limit, exclusive=$excl',
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
      'validateMultipleOfConstraint multipleOf: value=$value, multipleOf=$multipleOf',
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
      const schema = schemaMother.int64({ minimum: '' as unknown as number });
      validateMinConstraint({
        value: '-10',
        schema: schema,
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should ignore empty string maximum bound gracefully without treating it as 0', () => {
      const schema = schemaMother.int64({
        maximum: '   ' as unknown as number
      });
      validateMaxConstraint({
        value: '10',
        schema: schema,
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should handle multipleOf returning 0n due to floating point rounding limits gracefully', () => {
      assertValid(checkMultBigInt('123', 0.000000000000000001));
    });

    it('should handle fractional bounds that parse as integers (e.g. "10.0")', () => {
      const schema = schemaMother.int64({
        minimum: '10.0' as unknown as number
      });
      validateMinConstraint({
        value: '9',
        schema: schema,
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
      const schema = schemaMother.int64({
        minimum: 'not-a-number' as unknown as number
      });
      validateMinConstraint({
        value: '10',
        schema: schema,
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should return early on invalid integer strings in minimum validations', () => {
      assertValid(checkMinBigInt('abc', 10));
    });

    it('should return early on invalid integer strings in maximum validations', () => {
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
        'validateMinConstraint bounds: value=$value, min=$min, excl=$excl',
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
        'validateMaxConstraint bounds: value=$value, max=$max, excl=$excl',
        ({ value, max, excl, shouldPass, expectedErr }) => {
          const testCtx = checkMaxBigInt(value, max, excl);
          if (shouldPass) assertValid(testCtx);
          else assertHasValidationError(testCtx, expectedErr!);
        }
      );
    });

    it('should ignore validation if value is not a valid integer string in validateMultipleOfConstraint', () => {
      assertValid(checkMultBigInt('abc', 5));
    });

    describe('validateMultipleOfConstraint handling', () => {
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
        const schema = schemaMother.int64({
          minimum: null as unknown as number
        });
        validateMinConstraint({
          value: '-10',
          schema: schema,
          ctx,
          validateShape
        });
        assertValid(ctx);
      });

      it('should return undefined when bound is an unsupported object type', () => {
        const schema = schemaMother.int64({ minimum: {} as unknown as number });
        validateMinConstraint({
          value: '-10',
          schema: schema,
          ctx,
          validateShape
        });
        assertValid(ctx);
      });
    });

    it('should support schema bound defined directly as bigint', () => {
      const schema = schemaMother.int64({ minimum: 10n as unknown as number });
      validateMinConstraint({
        value: '9',
        schema: schema,
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'Value 9 is less than minimum 10');
    });

    it('should support input value defined directly as native bigint', () => {
      const schema = schemaMother.int64({ minimum: 10 });
      validateMinConstraint({
        value: 9n,
        schema: schema,
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'Value 9 is less than minimum 10');

      ctx = contextMother.empty();
      const schema1 = schemaMother.int64({ maximum: 10 });
      validateMaxConstraint({
        value: 11n,
        schema: schema1,
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'Value 11 is greater than maximum 10');

      ctx = contextMother.empty();
      validateMultipleOfConstraint({
        value: 7n,
        schema: schemaMother.int64({ multipleOf: 3 }),
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'Value 7 is not a multiple of 3');
    });

    it('should support native bigint with integer type in validateShape', () => {
      const schema = schemaMother.int64({ minimum: 10 });
      validateShape({
        value: 9n,
        schema: schema,
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'Value 9 is less than minimum 10');

      ctx = contextMother.empty();
      const schema1 = schemaMother.int64({ minimum: 10 });
      validateShape({
        value: 10n,
        schema: schema1,
        ctx,
        validateShape
      });
      assertValid(ctx);

      ctx = contextMother.empty();
      const valueExceedingInt64Max = 9223372036854775808n;
      const schema2 = schemaMother.int64();
      validateShape({
        value: valueExceedingInt64Max,
        schema: schema2,
        ctx,
        validateShape
      });
      assertHasValidationError(
        ctx,
        'Value 9223372036854775808 exceeds 64-bit integer limits'
      );
    });

    it('should parse non-empty string bounds successfully in parseBigIntBound', () => {
      const schema = schemaMother.int64({ minimum: '10' as unknown as number });
      validateMinConstraint({
        value: '9',
        schema: schema,
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

    it('should return early if multipleOf is undefined', () => {
      validateMultipleOfConstraint({
        value: 10,
        schema: schemaMother.empty(),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });
  });

  describe('Robustness tests for multipleOf constraints', () => {
    describe('validateMultipleOfConstraint robustness', () => {
      it('should gracefully ignore validation when multipleOf is 0', () => {
        expect(() => {
          validateMultipleOfConstraint({
            value: 10,
            schema: schemaMother.number({ multipleOf: 0 }),
            ctx,
            validateShape
          });
        }).not.toThrow();
        assertValid(ctx);
      });

      it('should gracefully ignore validation when multipleOf is negative', () => {
        expect(() => {
          validateMultipleOfConstraint({
            value: 10,
            schema: schemaMother.number({ multipleOf: -2 }),
            ctx,
            validateShape
          });
        }).not.toThrow();
        assertValid(ctx);
      });

      it('should gracefully ignore validation when multipleOf is non-numeric', () => {
        expect(() => {
          validateMultipleOfConstraint({
            value: 10,
            schema: schemaMother.number({
              multipleOf: 'not-a-number' as unknown as number
            }),
            ctx,
            validateShape
          });
        }).not.toThrow();
        assertValid(ctx);
      });

      it('should gracefully ignore validation when multipleOf is Infinity', () => {
        expect(() => {
          validateMultipleOfConstraint({
            value: 10,
            schema: schemaMother.number({ multipleOf: Infinity }),
            ctx,
            validateShape
          });
        }).not.toThrow();
        assertValid(ctx);
      });

      it('should handle extreme multipliers that overflow to Infinity without throwing', () => {
        expect(() => {
          validateMultipleOfConstraint({
            value: 10,
            schema: schemaMother.number({ multipleOf: Number.MIN_VALUE }),
            ctx,
            validateShape
          });
        }).not.toThrow();
        assertValid(ctx);
      });

      it('should gracefully handle Number.MIN_VALUE multipleOf for bigint/int64 values without throwing (RangeError crash prevention)', () => {
        expect(() => {
          validateMultipleOfConstraint({
            value: 10n,
            schema: schemaMother.int64({ multipleOf: Number.MIN_VALUE }),
            ctx,
            validateShape
          });
        }).not.toThrow();
        assertValid(ctx);
      });

      it('should handle calculations that overflow during rounding without throwing', () => {
        expect(() => {
          validateMultipleOfConstraint({
            value: 1.0000000001,
            schema: schemaMother.number({ multipleOf: 1e300 }),
            ctx,
            validateShape
          });
        }).not.toThrow();
        assertValid(ctx);
      });
    });
  });

  describe('Robustness and fallback checks on constraint dispatchers', () => {
    it('should bypass minimum, maximum, and multipleOf validations inside validateNumberConstraints when the value is a boolean', () => {
      const schema = schemaMother.empty({
        minimum: 5,
        maximum: 10,
        multipleOf: 2
      });
      validateNumberConstraints({
        value: true,
        schema: schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should bypass validations inside validateNumberConstraints when the value is a non-int64 string', () => {
      const schema = schemaMother.empty({
        minimum: 5,
        maximum: 10,
        multipleOf: 2
      });
      validateNumberConstraints({
        value: 'not-int64',
        schema: schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });
  });

  describe('Global BigInt constraint validation (without int64 / with int32)', () => {
    it('should validate minimum/maximum/multipleOf for native bigint on an integer type schema without any format', () => {
      const schema = schemaMother.integer({ minimum: 10 });
      validateShape({
        value: 9n,
        schema: schema,
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'Value 9 is less than minimum 10');

      ctx = contextMother.empty();
      const schema1 = schemaMother.integer({ maximum: 10 });
      validateShape({
        value: 11n,
        schema: schema1,
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'Value 11 is greater than maximum 10');

      ctx = contextMother.empty();
      const schema2 = schemaMother.integer({ multipleOf: 3 });
      validateShape({
        value: 7n,
        schema: schema2,
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'Value 7 is not a multiple of 3');
    });

    it('should accept valid 32-bit bigint on int32 format and reject out-of-bounds bigint', () => {
      const schema = schemaMother.integer({ format: 'int32' });
      validateShape({
        value: 10n,
        schema: schema,
        ctx,
        validateShape
      });
      assertValid(ctx);

      ctx = contextMother.empty();
      const valueExceedingInt32Max = 2147483648n;
      const schema1 = schemaMother.integer({ format: 'int32' });
      validateShape({
        value: valueExceedingInt32Max,
        schema: schema1,
        ctx,
        validateShape
      });
      assertHasValidationError(
        ctx,
        'Expected 32-bit integer, received 2147483648'
      );

      ctx = contextMother.empty();
      const valueBelowInt32Min = -2147483649n;
      const schema2 = schemaMother.integer({ format: 'int32' });
      validateShape({
        value: valueBelowInt32Min,
        schema: schema2,
        ctx,
        validateShape
      });
      assertHasValidationError(
        ctx,
        'Expected 32-bit integer, received -2147483649'
      );
    });

    it('should gracefully ignore validation for NaN, negative, and infinite multipleOf values (T011)', () => {
      const schemaNaN = schemaMother.number({ multipleOf: NaN });
      const schemaNeg = schemaMother.number({ multipleOf: -5 });
      const schemaInf = schemaMother.number({ multipleOf: Infinity });

      validateMultipleOfConstraint({
        value: 10,
        schema: schemaNaN,
        ctx,
        validateShape
      });
      validateMultipleOfConstraint({
        value: 10,
        schema: schemaNeg,
        ctx,
        validateShape
      });
      validateMultipleOfConstraint({
        value: 10,
        schema: schemaInf,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });
  });

  describe('unified numeric limits validations', () => {
    it('should correctly assert standard minimum boundaries using unified checks', () => {
      const schema = schemaMother.number({ minimum: 10 });
      ctx = contextMother.empty();

      validateMinConstraint({
        value: 9,
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Value 9 is less than minimum 10');
    });

    it('should correctly assert exclusive minimum boundaries using unified checks', () => {
      const schema = schemaMother.number({ minimum: 10, exclusiveMinimum: true });
      ctx = contextMother.empty();

      validateMinConstraint({
        value: 10,
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Value 10 is less than or equal to minimum 10');
    });

    it('should correctly assert standard maximum boundaries using unified checks', () => {
      const schema = schemaMother.number({ maximum: 20 });
      ctx = contextMother.empty();

      validateMaxConstraint({
        value: 21,
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Value 21 is greater than maximum 20');
    });

    it('should correctly assert exclusive maximum boundaries using unified checks', () => {
      const schema = schemaMother.number({ maximum: 20, exclusiveMaximum: true });
      ctx = contextMother.empty();

      validateMaxConstraint({
        value: 20,
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Value 20 is greater than or equal to maximum 20');
    });
  });
});
