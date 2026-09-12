import { describe, it, expect, vi } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';

import { checkPolymorphism } from '../../../src/validators/polymorphism.js';
import { validateShape } from '../../../src/validators/shape.js';

import { SchemaBuilder } from '../../helpers/SchemaBuilder.js';
import { ValidationContextBuilder } from '../../helpers/ValidationContextBuilder.js';
import { contextMother } from '../../helpers/contextMother.js';
import {
  assertValid,
  assertHasValidationError
} from '../../helpers/assertions.js';

describe('Validators polymorphism.ts (Unit)', () => {
  it('should return early from checkPolymorphism if no polymorphism properties are present', () => {
    const ctx = new ValidationContextBuilder().build();
    checkPolymorphism({
      value: 'any',
      schema: new SchemaBuilder().build(),
      ctx,
      validateShape
    });
    assertValid(ctx);
  });

  describe('Validation state management across branches', () => {
    it('should ensure the branch root is deleted from visited in validateSubSchema to allow full branch validation', () => {
      const ctx = new ValidationContextBuilder().build();
      const cyclicValue: Record<string, unknown> = {};
      cyclicValue.self = cyclicValue;

      ctx.visited.add(cyclicValue);

      const targetSchema = new SchemaBuilder()
        .type('object')
        .properties({
          self: new SchemaBuilder().type('object')
        })
        .build();

      checkPolymorphism({
        value: cyclicValue,
        schema: new SchemaBuilder().oneOf(targetSchema).build(),
        ctx,
        validateShape: (args) => {
          expect(args.ctx.visited.has(cyclicValue)).toBe(false);
        }
      });
    });
  });

  describe('unresolved $ref filtering', () => {
    it('should skip bare $ref objects in allOf', () => {
      const ctx = new ValidationContextBuilder().build();
      const validateShapeSpy = vi.fn(validateShape);

      const unresolvedRef: OpenAPIV3.ReferenceObject = {
        $ref: '#/components/schemas/Unresolved'
      };
      const stringSchema = new SchemaBuilder().type('string').build();

      checkPolymorphism({
        value: 'any',
        schema: new SchemaBuilder().allOf(unresolvedRef, stringSchema).build(),
        ctx,
        validateShape: validateShapeSpy
      });

      expect(validateShapeSpy).toHaveBeenCalledTimes(1);
      expect(validateShapeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          schema: stringSchema
        })
      );
    });

    it('should skip bare $ref objects in anyOf', () => {
      const ctx = new ValidationContextBuilder().build();
      const stringSchema = new SchemaBuilder().type('string').build();
      const unresolvedRef: OpenAPIV3.ReferenceObject = {
        $ref: '#/components/schemas/Unresolved'
      };

      checkPolymorphism({
        value: 123, // Passing number fails string type check in real validateShape
        schema: new SchemaBuilder().anyOf(unresolvedRef, stringSchema).build(),
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Failed anyOf');
    });

    it('should skip bare $ref objects in oneOf', () => {
      const ctx = new ValidationContextBuilder().build();
      const stringSchema = new SchemaBuilder().type('string').build();
      const unresolvedRef: OpenAPIV3.ReferenceObject = {
        $ref: '#/components/schemas/Unresolved'
      };

      checkPolymorphism({
        value: 123, // Passing number fails string type check in real validateShape
        schema: new SchemaBuilder().oneOf(unresolvedRef, stringSchema).build(),
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'matches 0 schemas');
    });
  });

  describe('Cyclic references and recursion prevention', () => {
    it('should not bypass branch validation for cyclic properties in oneOf (using const)', () => {
      const ctx = new ValidationContextBuilder().build();

      const cyclicValue: Record<string, unknown> = {
        name: 'test-user',
        role: 'user'
      };
      cyclicValue.self = cyclicValue;

      ctx.visited.add(cyclicValue);

      const schema1 = new SchemaBuilder()
        .type('object')
        .required('name', 'role', 'self')
        .properties({
          name: new SchemaBuilder().type('string'),
          role: new SchemaBuilder().const('admin'),
          self: new SchemaBuilder().type('object')
        })
        .build();

      const schema2 = new SchemaBuilder()
        .type('object')
        .required('name', 'role', 'self')
        .properties({
          name: new SchemaBuilder().type('string'),
          role: new SchemaBuilder().const('user'),
          self: new SchemaBuilder().type('object')
        })
        .build();

      checkPolymorphism({
        value: cyclicValue,
        schema: new SchemaBuilder().oneOf(schema1, schema2).build(),
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should not bypass branch validation for cyclic properties in oneOf (using enum)', () => {
      const ctx = new ValidationContextBuilder().build();

      const cyclicValue: Record<string, unknown> = {
        name: 'test-user',
        role: 'user'
      };
      cyclicValue.self = cyclicValue;

      ctx.visited.add(cyclicValue);

      const schema1 = new SchemaBuilder()
        .type('object')
        .required('name', 'role', 'self')
        .properties({
          name: new SchemaBuilder().type('string'),
          role: new SchemaBuilder().enum(['admin']),
          self: new SchemaBuilder().type('object')
        })
        .build();

      const schema2 = new SchemaBuilder()
        .type('object')
        .required('name', 'role', 'self')
        .properties({
          name: new SchemaBuilder().type('string'),
          role: new SchemaBuilder().enum(['user']),
          self: new SchemaBuilder().type('object')
        })
        .build();

      checkPolymorphism({
        value: cyclicValue,
        schema: new SchemaBuilder().oneOf(schema1, schema2).build(),
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should not bypass branch validation for cyclic properties in tryValidateDiscriminator', () => {
      const dogSchema = new SchemaBuilder()
        .type('object')
        .title('Dog')
        .required('petType', 'bark', 'self')
        .properties({
          petType: new SchemaBuilder().const('dog'),
          bark: new SchemaBuilder().type('boolean'),
          self: new SchemaBuilder().type('object')
        })
        .build();

      const parentSchema = new SchemaBuilder()
        .oneOf(dogSchema)
        .discriminator('petType')
        .build();

      const ctx = contextMother.withSchemas({ Dog: dogSchema });

      const cyclicValue: Record<string, unknown> = {
        petType: 'dog',
        bark: 'not-a-boolean'
      };
      cyclicValue.self = cyclicValue;

      ctx.visited.add(cyclicValue);

      checkPolymorphism({
        value: cyclicValue,
        schema: parentSchema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Expected boolean, received string');
    });

    it('should prevent stack overflow in recursive discriminator resolution', () => {
      const parentSchema = new SchemaBuilder()
        .type('object')
        .discriminator('type')
        .build();

      const childSchema = new SchemaBuilder()
        .title('Child')
        .allOf(parentSchema)
        .properties({
          type: new SchemaBuilder().const('child'),
          valid: new SchemaBuilder().type('boolean')
        })
        .build();

      parentSchema.oneOf = [childSchema];

      const ctx = contextMother.withSchemas({
        Parent: parentSchema,
        Child: childSchema
      });
      const cyclicValue = { type: 'child', valid: true };

      checkPolymorphism({
        value: cyclicValue,
        schema: parentSchema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should prevent stack overflow in recursive compositions without a discriminator', () => {
      const recursiveSchema = new SchemaBuilder()
        .type('object')
        .properties({
          nested: new SchemaBuilder().build()
        })
        .build();

      const parentSchema = new SchemaBuilder().oneOf(recursiveSchema).build();

      if (recursiveSchema.properties) {
        recursiveSchema.properties.nested = parentSchema;
      }

      const ctx = new ValidationContextBuilder().build();
      interface CyclicObject {
        nested?: CyclicObject;
      }
      const cyclicValue: CyclicObject = {};
      cyclicValue.nested = cyclicValue;

      checkPolymorphism({
        value: cyclicValue,
        schema: parentSchema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should prevent stack overflow in recursive compositions with primitive values', () => {
      const recursiveSchema = new SchemaBuilder().type('string').build();
      recursiveSchema.allOf = [];

      const parentSchema = new SchemaBuilder().oneOf(recursiveSchema).build();

      recursiveSchema.allOf = [parentSchema];

      const ctx = new ValidationContextBuilder().build();
      const primitiveValue = 'hello';

      checkPolymorphism({
        value: primitiveValue,
        schema: parentSchema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });
  });

  describe('oneOf short-circuit optimization', () => {
    it('should stop evaluating schemas as soon as more than one schema passes', () => {
      const ctx = new ValidationContextBuilder().build();
      const schema1 = new SchemaBuilder().type('string').build();
      const schema2 = new SchemaBuilder().type('string').build();
      const schema3 = new SchemaBuilder().type('string').build();

      const validateShapeSpy = vi.fn(validateShape);

      checkPolymorphism({
        value: 'any',
        schema: new SchemaBuilder().oneOf(schema1, schema2, schema3).build(),
        ctx,
        validateShape: validateShapeSpy
      });

      expect(validateShapeSpy).toHaveBeenCalledTimes(2);
      expect(validateShapeSpy).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ schema: schema1 })
      );
      expect(validateShapeSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ schema: schema2 })
      );
    });
  });
});
