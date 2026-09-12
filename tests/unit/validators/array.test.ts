import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';
import { validateShape } from '../../../src/validators/shape.js';
import { validateArray } from '../../../src/validators/type-validators.js';

import {
  assertValid,
  assertHasValidationError
} from '../../helpers/assertions.js';
import { contextMother } from '../../helpers/contextMother.js';
import { SchemaBuilder } from '../../helpers/SchemaBuilder.js';
import { schemaMother } from '../../helpers/schemaMother.js';

describe('Validators array (Unit)', () => {
  let ctx: ReturnType<typeof contextMother.empty>;

  beforeEach(() => {
    ctx = contextMother.empty();
  });

  describe('Structural, Circular, and Limits', () => {
    it('should return early from validateArrayItems if itemsSchema is not a valid SchemaObject', () => {
      const validateShapeSpy = vi.fn(validateShape);

      validateArray({
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

    it('should correctly report "null" as the received type when array validation fails for a null value', () => {
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
  });

  describe('Uniqueness and fast paths (validateArrayUnique via validateArray)', () => {
    it('should correctly validate uniqueness for primitives and objects', () => {
      const value = [1, 2, 3, 2];
      const schema = new SchemaBuilder()
        .type('array')
        .uniqueItems(true)
        .items(schemaMother.empty())
        .build();

      validateArray({
        value,
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Array elements must be unique');
    });

    it('should handle object uniqueness correctly', () => {
      const value = [{ a: 1 }, { b: 2 }, { a: 1 }];
      const schema = new SchemaBuilder()
        .type('array')
        .uniqueItems(true)
        .items(schemaMother.empty())
        .build();

      validateArray({
        value,
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Array elements must be unique');
    });

    it('should recognize object uniqueness even with different key order', () => {
      const value = [
        { a: 1, b: 2 },
        { b: 2, a: 1 }
      ];
      const schema = new SchemaBuilder()
        .type('array')
        .uniqueItems(true)
        .items(schemaMother.empty())
        .build();

      validateArray({
        value,
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Array elements must be unique');
    });

    it('should correctly handle null, undefined, and nested arrays in objects', () => {
      const value = [
        { a: null, b: undefined, c: [1, undefined, 2] },
        { c: [1, undefined, 2], a: null }
      ];
      const schema = new SchemaBuilder()
        .type('array')
        .uniqueItems(true)
        .items(schemaMother.empty())
        .build();

      validateArray({
        value,
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Array elements must be unique');
    });

    it('should correctly handle circular references inside objects and prevent RangeErrors', () => {
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

      validateArray({
        value,
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Array elements must be unique');
    });

    it('should not confuse a string value "[Circular]" with an actual circular reference (no collision)', () => {
      const cyclicObj = { self: {} as unknown };
      cyclicObj.self = cyclicObj;
      const literalObj = { self: '[Circular]' };
      const value = [cyclicObj, literalObj];
      const schema = new SchemaBuilder()
        .type('array')
        .uniqueItems(true)
        .items(schemaMother.empty())
        .build();

      validateArray({
        value,
        schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });
  });
});
