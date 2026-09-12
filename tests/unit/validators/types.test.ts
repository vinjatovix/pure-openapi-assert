import { describe, it, expect, vi } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';

import { validateShape } from '../../../src/validators/shape.js';
import {
  validateObject,
  validateArray,
  validateArrayUnique,
  validateEnum,
  validateConst,
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
  validateMultipleOfConstraint,
  validateStringFormat,
  validateMinConstraint,
  validateMaxConstraint,
  validateObjectBounds
} from '../../../src/validators/types.js';

import {
  assertValid,
  assertHasValidationError
} from '../../helpers/assertions.js';
import { contextMother } from '../../helpers/contextMother.js';
import { SchemaBuilder } from '../../helpers/SchemaBuilder.js';
import { schemaMother } from '../../helpers/schemaMother.js';

describe('Validators types.ts (Unit)', () => {
  describe('validateObject & validateArray (Structural, Circular, and Limits)', () => {
    it('should handle undefined properties in validateObject with Object.keys', () => {
      const ctx = contextMother.empty();

      validateObject({
        value: { id: 123 },
        schema: schemaMother.object(),
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should return early from validateArrayItems if itemsSchema is not a valid SchemaObject', () => {
      const ctx = contextMother.empty();
      const validateShapeSpy = vi.fn(validateShape);

      validateArrayItems({
        value: [1, 2, 3],
        schema: new SchemaBuilder()
          .type('array')
          .items({ $ref: '#/components/schemas/SimpleUser' })
          .build(),
        ctx,
        validateShape: validateShapeSpy
      });

      expect(validateShapeSpy).not.toHaveBeenCalled();
    });

    it('should prevent infinite loops inside validateArray for circular structures using real validateShape', () => {
      const ctx = contextMother.empty();
      const arr: unknown[] = [];
      arr.push(arr);

      const circularSchema =
        schemaMother.array() as OpenAPIV3.ArraySchemaObject;
      circularSchema.items = circularSchema;

      validateArray({
        value: arr,
        schema: circularSchema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should prevent infinite loops inside validateObject for circular structures using real validateShape', () => {
      const ctx = contextMother.empty();
      const obj: Record<string, unknown> = {};
      obj['self'] = obj;

      const circularSchema = new SchemaBuilder().type('object').build();
      circularSchema.properties = { self: circularSchema };

      validateObject({
        value: obj,
        schema: circularSchema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should fail when object has fewer properties than minProperties', () => {
      const ctxMinFail = contextMother.empty();

      validateObject({
        value: { a: 1 },
        schema: new SchemaBuilder().type('object').minProperties(2).build(),
        ctx: ctxMinFail,
        validateShape
      });

      assertHasValidationError(
        ctxMinFail,
        'Object has 1 properties, minimum is 2'
      );
    });

    it('should fail when object has more properties than maxProperties', () => {
      const ctxMaxFail = contextMother.empty();

      validateObject({
        value: { a: 1, b: 2, c: 3 },
        schema: new SchemaBuilder().type('object').maxProperties(2).build(),
        ctx: ctxMaxFail,
        validateShape
      });

      assertHasValidationError(
        ctxMaxFail,
        'Object has 3 properties, maximum is 2'
      );
    });
  });

  describe('validateTypeCheck', () => {
    it('should fail typecheck for wrong expected type and report errors', () => {
      const ctx = contextMother.empty();

      const success = validateTypeCheck({
        value: 'string',
        schema: schemaMother.integer(),
        ctx,
        validateShape
      });

      expect(success).toBe(false);
      assertHasValidationError(ctx, 'Expected integer, received string');
    });
  });

  describe('validateInt64, validateFloat, and validateDouble formats', () => {
    it('should trigger validateInt64 non-number type checks', () => {
      const ctx = contextMother.empty();

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
      const ctx = contextMother.empty();

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
      const ctx = contextMother.empty();

      validateFloat({
        value: 'not-a-number',
        schema: schemaMother.float(),
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Expected 32-bit float, received string');
    });

    it('should trigger validateDouble non-number type checks', () => {
      const ctx = contextMother.empty();

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
      const ctx = contextMother.empty();

      validateMinNumberConstraint({
        value: 10,
        schema: schemaMother.empty(),
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should return early from validateMinNumberConstraint if minimum is explicitly undefined (JS consumer)', () => {
      const ctx = contextMother.empty();
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
      const ctx = contextMother.empty();

      validateMaxNumberConstraint({
        value: 10,
        schema: schemaMother.empty(),
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should return early from validateMaxNumberConstraint if maximum is explicitly undefined (JS consumer)', () => {
      const ctx = contextMother.empty();
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
      const ctx = contextMother.empty();
      validateMultipleOfNumberConstraint({
        value: 0.000003,
        schema: new SchemaBuilder().multipleOf(0.000001).build(),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should fail when value is not a high-precision decimal multiple of standard floating point step', () => {
      const ctx = contextMother.empty();
      validateMultipleOfNumberConstraint({
        value: 0.0000035,
        schema: new SchemaBuilder().multipleOf(0.000001).build(),
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'is not a multiple of 0.000001');
    });

    it('should pass when value is in scientific notation and is a valid multiple of scientific step', () => {
      const ctx = contextMother.empty();
      validateMultipleOfNumberConstraint({
        value: 3e-7,
        schema: new SchemaBuilder().multipleOf(1e-7).build(),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should pass when value is decimal scientific notation and is a valid multiple of decimal scientific step', () => {
      const ctx = contextMother.empty();
      validateMultipleOfNumberConstraint({
        value: 4.5e-7,
        schema: new SchemaBuilder().multipleOf(1.5e-7).build(),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should pass when value is in positive scientific notation and is a valid multiple of positive scientific step', () => {
      const ctx = contextMother.empty();
      validateMultipleOfNumberConstraint({
        value: 1e20,
        schema: new SchemaBuilder().multipleOf(1e18).build(),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });
  });

  describe('validateShape base validation requirements', () => {
    it('should throw error when non-nullable field receives null', () => {
      const ctx = contextMother.empty();
      validateShape({
        value: null,
        schema: new SchemaBuilder().type('string').nullable(false).build(),
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'Field is not nullable but received null');
    });

    it('should throw error when validateShape receives undefined directly', () => {
      const ctx = contextMother.empty();
      validateShape({
        value: undefined,
        schema: schemaMother.string(),
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'Field is required but received undefined');
    });

    it('should not crash or resolve prototype properties as format validators', () => {
      const ctx = contextMother.empty();
      validateShape({
        value: 'some-value',
        schema: new SchemaBuilder()
          .type('string')
          .format('hasOwnProperty')
          .build(),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should ignore custom formats that match prototype properties if not defined on customFormats', () => {
      const ctx = contextMother.empty();
      validateShape({
        value: 'some-value',
        schema: new SchemaBuilder().type('string').format('toString').build(),
        ctx,
        validateShape,
        customFormats: {}
      });
      assertValid(ctx);
    });
  });

  describe('BigInt constraint validation (int64)', () => {
    const checkMinBigInt = (
      value: string,
      min: number,
      exclusive?: boolean
    ) => {
      const ctx = contextMother.empty();
      const overrides: Partial<OpenAPIV3.SchemaObject> = { minimum: min };
      if (exclusive !== undefined) overrides.exclusiveMinimum = exclusive;
      validateMinBigIntConstraint({
        value,
        schema: schemaMother.int64(overrides),
        ctx,
        validateShape
      });
      return ctx;
    };

    const checkMaxBigInt = (
      value: string,
      max: number,
      exclusive?: boolean
    ) => {
      const ctx = contextMother.empty();
      const overrides: Partial<OpenAPIV3.SchemaObject> = { maximum: max };
      if (exclusive !== undefined) overrides.exclusiveMaximum = exclusive;
      validateMaxBigIntConstraint({
        value,
        schema: schemaMother.int64(overrides),
        ctx,
        validateShape
      });
      return ctx;
    };

    const checkMultBigInt = (value: string, multipleOf: number) => {
      const ctx = contextMother.empty();
      validateMultipleOfBigIntConstraint({
        value,
        schema: schemaMother.int64({ multipleOf }),
        ctx,
        validateShape
      });
      return ctx;
    };

    describe('Decimal format limits on BigInt', () => {
      it('should pass when exclusiveMinimum is true and value is greater than decimal minimum limit', () => {
        const ctx = contextMother.empty();
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
        const ctx = contextMother.empty();
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
        const ctx = contextMother.empty();
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
        const ctx = contextMother.empty();
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
        const ctx = checkMinBigInt(value, limit, excl);
        if (shouldPass) assertValid(ctx);
        else assertHasValidationError(ctx, expectedErr!);
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
        const ctx = checkMaxBigInt(value, limit, excl);
        if (shouldPass) assertValid(ctx);
        else assertHasValidationError(ctx, expectedErr!);
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
        const ctx = checkMultBigInt(value, multipleOf);
        if (shouldPass) assertValid(ctx);
        else assertHasValidationError(ctx, expectedErr!);
      }
    );

    it('should throw exceptions on Infinity and -Infinity boundaries for BigInt constraints', () => {
      expect(() => checkMinBigInt('10', Infinity)).toThrow(TypeError);
      expect(() => checkMaxBigInt('10', -Infinity)).toThrow(TypeError);
      expect(() => checkMultBigInt('10', Infinity)).not.toThrow();
    });

    it('should ignore empty string bounds gracefully without treating them as 0', () => {
      const ctxMin = contextMother.empty();
      validateMinBigIntConstraint({
        value: '-10',
        schema: new SchemaBuilder()
          .type('string')
          .format('int64')
          .minimum('' as unknown as number)
          .build(),
        ctx: ctxMin,
        validateShape
      });
      assertValid(ctxMin);

      const ctxMax = contextMother.empty();
      validateMaxBigIntConstraint({
        value: '10',
        schema: new SchemaBuilder()
          .type('string')
          .format('int64')
          .maximum('   ' as unknown as number)
          .build(),
        ctx: ctxMax,
        validateShape
      });
      assertValid(ctxMax);
    });

    it('should handle multipleOf returning 0n due to floating point rounding limits gracefully', () => {
      assertValid(checkMultBigInt('123', 0.000000000000000001));
    });

    it('should handle fractional bounds that parse as integers (e.g. "10.0")', () => {
      const ctx = contextMother.empty();
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
      const ctx = contextMother.empty();
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

    it('should return early on invalid integer strings in validateMinBigIntConstraint and validateMaxBigIntConstraint', () => {
      assertValid(checkMinBigInt('abc', 10));
      assertValid(checkMaxBigInt('abc', 10));
    });

    it('should return early in validateObject if value is an array', () => {
      const ctx = contextMother.empty();
      validateObject({
        value: [1, 2, 3],
        schema: schemaMother.object(),
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'Expected object, received object');
    });

    it('should format type validation error for null values correctly', () => {
      const ctx = contextMother.empty();
      validateTypeCheck({
        value: null,
        schema: schemaMother.string(),
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'received null');
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
          const ctx = checkMinBigInt(value, min, excl);
          if (shouldPass) assertValid(ctx);
          else assertHasValidationError(ctx, expectedErr!);
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
          const ctx = checkMaxBigInt(value, max, excl);
          if (shouldPass) assertValid(ctx);
          else assertHasValidationError(ctx, expectedErr!);
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
        const ctx = contextMother.empty();
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
        const ctx = contextMother.empty();
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
      const ctx = contextMother.empty();
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
      const ctx = contextMother.empty();
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

    it('should fail validation when validating null value in validateObject', () => {
      const ctx = contextMother.empty();
      validateObject({
        value: null,
        schema: schemaMother.object(),
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'Expected object, received null');
    });

    it('should return early in validateRequiredFields if required is undefined', () => {
      const ctx = contextMother.empty();
      validateRequiredFields({
        value: { id: 123 },
        schema: schemaMother.empty(),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should support additionalProperties: true', () => {
      const ctx = contextMother.empty();
      validateObject({
        value: { foo: 'bar', extra: 123 },
        schema: schemaMother.object({
          properties: { foo: schemaMother.string() },
          additionalProperties: true
        }),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should support direct call of validateAdditionalProperties without passing keys', () => {
      const ctx = contextMother.empty();
      validateAdditionalProperties({
        value: { foo: 'bar', extra: 123 },
        schema: schemaMother.object({
          properties: { foo: schemaMother.string() },
          additionalProperties: false
        }),
        ctx,
        validateShape
      });
      assertHasValidationError(
        ctx,
        "Key 'extra' is not allowed by OpenAPI schema"
      );
    });

    it('should handle extremely small multipleOf causing Infinity error and fallback to 0n gracefully', () => {
      assertValid(checkMultBigInt('10', 1e-310));
    });

    it('should handle positive scientific notation exponents in getDecimalPlaces', () => {
      const ctx = contextMother.empty();
      validateMultipleOfConstraint({
        value: 1e21,
        schema: schemaMother.number({ multipleOf: 1e21 }),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should return early in validateMultipleOfNumberConstraint if multipleOf is undefined', () => {
      const ctx = contextMother.empty();
      validateMultipleOfNumberConstraint({
        value: 10,
        schema: schemaMother.empty(),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });
  });

  describe('Robustness tests for string format and multipleOf constraints', () => {
    it('should fall back to default format registry when customFormats contains a non-function value', () => {
      const ctx = contextMother.empty();
      validateStringFormat({
        value: 'invalid-uuid',
        schema: new SchemaBuilder().type('string').format('uuid').build(),
        ctx,
        validateShape,
        customFormats: { uuid: true as unknown as (value: string) => boolean }
      });
      assertHasValidationError(ctx, "Expected string format 'uuid'");
    });

    it('should pass validation when value is valid and customFormats contains a non-function value', () => {
      const ctx = contextMother.empty();
      validateStringFormat({
        value: '123e4567-e89b-12d3-a456-426614174000',
        schema: new SchemaBuilder().type('string').format('uuid').build(),
        ctx,
        validateShape,
        customFormats: { uuid: true as unknown as (value: string) => boolean }
      });
      assertValid(ctx);
    });

    describe('validateMultipleOfNumberConstraint robustness', () => {
      it('should gracefully ignore validation when multipleOf is 0', () => {
        const ctx = contextMother.empty();
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
        const ctx = contextMother.empty();
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
        const ctx = contextMother.empty();
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
        const ctx = contextMother.empty();
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
        const ctx = contextMother.empty();
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
        const ctx = contextMother.empty();
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

  describe('Fallback handling and edge-case boundaries', () => {
    it('should bypass numeric constraint validations when the value is neither a number nor an int64 string', () => {
      const ctx = contextMother.empty();
      const args = {
        value: true,
        schema: new SchemaBuilder()
          .minimum(5)
          .maximum(10)
          .multipleOf(2)
          .build(),
        ctx,
        validateShape
      };

      validateMinConstraint(args);
      validateMaxConstraint(args);
      validateMultipleOfConstraint(args);

      assertValid(ctx);
    });

    it('should correctly report "null" as the received type when array validation fails for a null value', () => {
      const ctx = contextMother.empty();
      validateArray({
        value: null,
        schema: new SchemaBuilder()
          .type('array')
          .items(schemaMother.empty())
          .build(),
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Expected array, received null');
    });

    it('should default properties count to 0 in validateObjectBounds when keys array is omitted', () => {
      const ctx = contextMother.empty();
      validateObjectBounds({
        value: {},
        schema: new SchemaBuilder().minProperties(1).build(),
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Object has 0 properties, minimum is 1');
    });

    it('should default properties to an empty object in validateAdditionalProperties when schema properties are omitted', () => {
      const ctx = contextMother.empty();
      validateAdditionalProperties({
        value: { extraProp: 'val' },
        schema: new SchemaBuilder().additionalProperties(false).build(),
        ctx,
        validateShape
      });

      assertHasValidationError(
        ctx,
        "Key 'extraProp' is not allowed by OpenAPI schema"
      );
    });

    it('should bypass shape validation in validateAdditionalProperties when additionalProperties is a reference object', () => {
      const ctx = contextMother.empty();
      validateAdditionalProperties({
        value: { extraProp: 'val' },
        schema: new SchemaBuilder()
          .properties({})
          .additionalProperties({ $ref: '#/components/schemas/SomeSchema' })
          .build(),
        ctx,
        validateShape
      });

      assertValid(ctx);
    });
  });

  describe('Optimizations and fast paths', () => {
    it('validateArrayUnique should correctly validate uniqueness for primitives and objects', () => {
      const ctx = contextMother.empty();
      const value = [1, 2, 3, 2];
      const schema = new SchemaBuilder()
        .type('array')
        .uniqueItems(true)
        .items(schemaMother.empty())
        .build();

      validateArrayUnique({
        value,
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Array elements must be unique');
    });

    it('validateArrayUnique should handle object uniqueness correctly', () => {
      const ctx = contextMother.empty();
      const value = [{ a: 1 }, { b: 2 }, { a: 1 }];
      const schema = new SchemaBuilder()
        .type('array')
        .uniqueItems(true)
        .items(schemaMother.empty())
        .build();

      validateArrayUnique({
        value,
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Array elements must be unique');
    });

    it('validateArrayUnique should recognize object uniqueness even with different key order', () => {
      const ctx = contextMother.empty();
      const value = [
        { a: 1, b: 2 },
        { b: 2, a: 1 }
      ];
      const schema = new SchemaBuilder()
        .type('array')
        .uniqueItems(true)
        .items(schemaMother.empty())
        .build();

      validateArrayUnique({
        value,
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Array elements must be unique');
    });

    it('validateArrayUnique should correctly handle null, undefined, and nested arrays in objects', () => {
      const ctx = contextMother.empty();
      const value = [
        { a: null, b: undefined, c: [1, undefined, 2] },
        { c: [1, undefined, 2], a: null }
      ];
      const schema = new SchemaBuilder()
        .type('array')
        .uniqueItems(true)
        .items(schemaMother.empty())
        .build();

      validateArrayUnique({
        value,
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Array elements must be unique');
    });

    it('validateArrayUnique should correctly handle circular references inside objects and prevent RangeErrors', () => {
      const ctx = contextMother.empty();

      const cyclicObj1 = { name: 'cyclic', self: {} as unknown };
      cyclicObj1.self = cyclicObj1;

      const cyclicObj2 = { name: 'cyclic', self: {} as unknown };
      cyclicObj2.self = cyclicObj2;

      const value = [cyclicObj1, cyclicObj2];
      const schema = new SchemaBuilder()
        .type('array')
        .uniqueItems(true)
        .items(schemaMother.empty())
        .build();

      validateArrayUnique({
        value,
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Array elements must be unique');
    });

    it('validateArrayUnique should not confuse a string value "[Circular]" with an actual circular reference (no collision)', () => {
      const ctx = contextMother.empty();

      const cyclicObj = { self: {} as unknown };
      cyclicObj.self = cyclicObj;

      const literalObj = { self: '[Circular]' };

      const value = [cyclicObj, literalObj];
      const schema = new SchemaBuilder()
        .type('array')
        .uniqueItems(true)
        .items(schemaMother.empty())
        .build();

      validateArrayUnique({
        value,
        schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('validateEnum should cache and validate correctly', () => {
      const ctx = contextMother.empty();
      const schema = new SchemaBuilder()
        .type('string')
        .enum(['admin', 'user'])
        .build();

      validateEnum({
        value: 'guest',
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Expected one of [admin, user]');
    });

    it('validateConst should use strict identity checking', () => {
      const ctx = contextMother.empty();
      const schema = new SchemaBuilder().type('number').const(42).build();

      validateConst({
        value: 42,
        schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('validateMultipleOfNumberConstraint should fast path integers', () => {
      const ctx = contextMother.empty();
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
});
