import { describe, it, beforeEach } from 'vitest';
import { validateShape } from '../../../src/validators/shape.js';
import { validateObject } from '../../../src/validators/type-validators.js';

import {
  assertValid,
  assertHasValidationError
} from '../../helpers/assertions.js';
import { contextMother } from '../../helpers/contextMother.js';
import { schemaMother } from '../../helpers/schemaMother.js';

describe('validators/object', () => {
  let ctx: ReturnType<typeof contextMother.empty>;

  beforeEach(() => {
    ctx = contextMother.empty();
  });

  describe('Structural, Circular, and Limits', () => {
    it('should handle undefined properties in validateObject with Object.keys', () => {
      const schema = schemaMother.object();
      validateObject({
        value: { id: 123 },
        schema: schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should prevent infinite loops inside validateObject for circular structures using real validateShape', () => {
      const obj: Record<string, unknown> = {};
      obj['self'] = obj;

      const circularSchema = schemaMother.object();
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
      const schema = schemaMother.object({ minProperties: 2 });

      validateObject({
        value: { a: 1 },
        schema: schema,
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
      const schema = schemaMother.object({ maxProperties: 2 });

      validateObject({
        value: { a: 1, b: 2, c: 3 },
        schema: schema,
        ctx: ctxMaxFail,
        validateShape
      });

      assertHasValidationError(
        ctxMaxFail,
        'Object has 3 properties, maximum is 2'
      );
    });

    it('should return early in validateObject if value is an array', () => {
      const schema = schemaMother.object();
      validateObject({
        value: [1, 2, 3],
        schema: schema,
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'Expected object, received array');
    });

    it.each([
      { value: [1, 2, 3], expectedType: 'array' },
      { value: 'not-an-object', expectedType: 'string' },
      { value: 42, expectedType: 'number' },
      { value: true, expectedType: 'boolean' },
      { value: null, expectedType: 'null' }
    ])(
      'should report "Expected object, received $expectedType" when value is not a plain object',
      ({ value, expectedType }) => {
        const schema = schemaMother.object();
        validateObject({
          value,
          schema,
          ctx,
          validateShape
        });
        assertHasValidationError(
          ctx,
          `Expected object, received ${expectedType}`
        );
      }
    );

    it('should fail validation when validating null value in validateObject', () => {
      const schema = schemaMother.object();
      validateObject({
        value: null,
        schema: schema,
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'Expected object, received null');
    });
  });

  describe('Required Fields and Additional Properties edge cases (via validateObject)', () => {
    it('should not fail validation when required is undefined in schema', () => {
      const schema = schemaMother.empty();
      validateObject({
        value: { id: 123 },
        schema: schema,
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should support additionalProperties: true', () => {
      const schema = schemaMother.object({
        properties: { foo: schemaMother.string() },
        additionalProperties: true
      });
      validateObject({
        value: { foo: 'bar', extra: 123 },
        schema: schema,
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should disallow additional properties when additionalProperties is false', () => {
      const schema = schemaMother.object({
        properties: { foo: schemaMother.string() },
        additionalProperties: false
      });
      validateObject({
        value: { foo: 'bar', extra: 123 },
        schema: schema,
        ctx,
        validateShape
      });
      assertHasValidationError(
        ctx,
        "Key 'extra' is not allowed by OpenAPI schema"
      );
    });

    it('should default properties count to 0 when keys array is calculated internally', () => {
      const schema = schemaMother.empty({ minProperties: 1 });
      validateObject({
        value: {},
        schema: schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Object has 0 properties, minimum is 1');
    });

    it('should default properties to an empty object when schema properties are omitted', () => {
      const schema = schemaMother.empty({ additionalProperties: false });
      validateObject({
        value: { extraProp: 'val' },
        schema: schema,
        ctx,
        validateShape
      });

      assertHasValidationError(
        ctx,
        "Key 'extraProp' is not allowed by OpenAPI schema"
      );
    });

    it('should bypass shape validation when additionalProperties is a reference object', () => {
      const schema = schemaMother.empty({
        properties: {},
        additionalProperties: { $ref: '#/components/schemas/SomeSchema' }
      });
      validateObject({
        value: { extraProp: 'val' },
        schema: schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });
  });
});
