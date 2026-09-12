import { describe, it, beforeEach } from 'vitest';
import { validateShape } from '../../../src/validators/shape.js';
import { validateObject } from '../../../src/validators/type-validators.js';

import {
  assertValid,
  assertHasValidationError
} from '../../helpers/assertions.js';
import { contextMother } from '../../helpers/contextMother.js';
import { SchemaBuilder } from '../../helpers/SchemaBuilder.js';
import { schemaMother } from '../../helpers/schemaMother.js';

describe('Validators object (Unit)', () => {
  let ctx: ReturnType<typeof contextMother.empty>;

  beforeEach(() => {
    ctx = contextMother.empty();
  });

  describe('Structural, Circular, and Limits', () => {
    it('should handle undefined properties in validateObject with Object.keys', () => {
      validateObject({
        value: { id: 123 },
        schema: schemaMother.object(),
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should prevent infinite loops inside validateObject for circular structures using real validateShape', () => {
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

    it('should return early in validateObject if value is an array', () => {
      validateObject({
        value: [1, 2, 3],
        schema: schemaMother.object(),
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'Expected object, received object');
    });

    it('should fail validation when validating null value in validateObject', () => {
      validateObject({
        value: null,
        schema: schemaMother.object(),
        ctx,
        validateShape
      });
      assertHasValidationError(ctx, 'Expected object, received null');
    });
  });

  describe('Required Fields and Additional Properties edge cases (via validateObject)', () => {
    it('should not fail validation when required is undefined in schema', () => {
      validateObject({
        value: { id: 123 },
        schema: schemaMother.empty(),
        ctx,
        validateShape
      });
      assertValid(ctx);
    });

    it('should support additionalProperties: true', () => {
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

    it('should disallow additional properties when additionalProperties is false', () => {
      validateObject({
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

    it('should default properties count to 0 when keys array is calculated internally', () => {
      validateObject({
        value: {},
        schema: new SchemaBuilder().minProperties(1).build(),
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Object has 0 properties, minimum is 1');
    });

    it('should default properties to an empty object when schema properties are omitted', () => {
      validateObject({
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

    it('should bypass shape validation when additionalProperties is a reference object', () => {
      validateObject({
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
});
