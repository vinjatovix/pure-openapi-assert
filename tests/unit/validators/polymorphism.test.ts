import { describe, it, expect, vi } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';
import { ValidationContext } from '../../../src/core/ValidationContext.js';
import type { ValidationArgs } from '../../../src/validators/types.js';
import { checkPolymorphism } from '../../../src/validators/polymorphism.js';
import { validateShape } from '../../../src/validators/shape.js';

describe('Validators polymorphism.ts (Unit)', () => {
  it('should return early from checkPolymorphism if no polymorphism properties are present', () => {
    const ctx = new ValidationContext();
    checkPolymorphism({
      value: 'any',
      schema: {},
      ctx,
      validateShape: vi.fn()
    });
    expect(ctx.hasErrors()).toBe(false);
  });

  describe('Validation state management across branches', () => {
    it('should ensure the branch root is deleted from visited in validateSubSchema to allow full branch validation', () => {
      const ctx = new ValidationContext();
      const cyclicValue: Record<string, unknown> = {};
      cyclicValue.self = cyclicValue;

      ctx.visited.add(cyclicValue);

      const targetSchema = {
        type: 'object' as const,
        properties: {
          self: { type: 'object' as const }
        }
      } as OpenAPIV3.SchemaObject;

      checkPolymorphism({
        value: cyclicValue,
        schema: {
          oneOf: [targetSchema]
        },
        ctx,
        validateShape: (args) => {
          expect(args.ctx.visited.has(cyclicValue)).toBe(false);
        }
      });
    });
  });

  describe('unresolved $ref filtering', () => {
    it('should skip bare $ref objects in allOf', () => {
      const ctx = new ValidationContext();
      const validateShape = vi.fn();

      const unresolvedRef: OpenAPIV3.ReferenceObject = {
        $ref: '#/components/schemas/Unresolved'
      };
      const stringSchema: OpenAPIV3.SchemaObject = { type: 'string' };

      checkPolymorphism({
        value: 'any',
        schema: {
          allOf: [unresolvedRef, stringSchema]
        },
        ctx,
        validateShape
      });

      expect(validateShape).toHaveBeenCalledTimes(1);
      expect(validateShape).toHaveBeenCalledWith(
        expect.objectContaining({
          schema: stringSchema
        })
      );
    });

    it('should skip bare $ref objects in anyOf', () => {
      const ctx = new ValidationContext();
      const stringSchema: OpenAPIV3.SchemaObject = { type: 'string' };
      const unresolvedRef: OpenAPIV3.ReferenceObject = {
        $ref: '#/components/schemas/Unresolved'
      };

      const validateShape = vi.fn(({ ctx: subCtx, schema }: ValidationArgs) => {
        if (schema.type === stringSchema.type) {
          subCtx.addError('Invalid string');
        }
      });

      checkPolymorphism({
        value: 'any',
        schema: {
          anyOf: [unresolvedRef, stringSchema]
        },
        ctx,
        validateShape
      });

      expect(ctx.hasErrors()).toBe(true);
      expect(ctx.errors[0]).toContain('Failed anyOf');
    });

    it('should skip bare $ref objects in oneOf', () => {
      const ctx = new ValidationContext();
      const stringSchema: OpenAPIV3.SchemaObject = { type: 'string' };
      const unresolvedRef: OpenAPIV3.ReferenceObject = {
        $ref: '#/components/schemas/Unresolved'
      };

      const validateShape = vi.fn(({ ctx: subCtx, schema }: ValidationArgs) => {
        if (schema.type === stringSchema.type) {
          subCtx.addError('Invalid string');
        }
      });

      checkPolymorphism({
        value: 'any',
        schema: {
          oneOf: [unresolvedRef, stringSchema]
        },
        ctx,
        validateShape
      });

      expect(ctx.hasErrors()).toBe(true);
      expect(ctx.errors[0]).toContain('matches 0 schemas');
    });
  });

  describe('Cyclic references and recursion prevention', () => {
    it('should not bypass branch validation for cyclic properties in oneOf (using const)', () => {
      const ctx = new ValidationContext();

      const cyclicValue: Record<string, unknown> = {
        name: 'test-user',
        role: 'user'
      };
      cyclicValue.self = cyclicValue;

      ctx.visited.add(cyclicValue);

      const schema1 = {
        type: 'object' as const,
        required: ['name', 'role', 'self'],
        properties: {
          name: { type: 'string' as const },
          role: { const: 'admin' } as unknown as OpenAPIV3.SchemaObject,
          self: { type: 'object' as const }
        }
      } as OpenAPIV3.SchemaObject;

      const schema2 = {
        type: 'object' as const,
        required: ['name', 'role', 'self'],
        properties: {
          name: { type: 'string' as const },
          role: { const: 'user' } as unknown as OpenAPIV3.SchemaObject,
          self: { type: 'object' as const }
        }
      } as OpenAPIV3.SchemaObject;

      checkPolymorphism({
        value: cyclicValue,
        schema: {
          oneOf: [schema1, schema2]
        },
        ctx,
        validateShape
      });

      expect(ctx.hasErrors()).toBe(false);
    });

    it('should not bypass branch validation for cyclic properties in oneOf (using enum)', () => {
      const ctx = new ValidationContext();

      const cyclicValue: Record<string, unknown> = {
        name: 'test-user',
        role: 'user'
      };
      cyclicValue.self = cyclicValue;

      ctx.visited.add(cyclicValue);

      const schema1 = {
        type: 'object' as const,
        required: ['name', 'role', 'self'],
        properties: {
          name: { type: 'string' as const },
          role: { enum: ['admin'] },
          self: { type: 'object' as const }
        }
      } as OpenAPIV3.SchemaObject;

      const schema2 = {
        type: 'object' as const,
        required: ['name', 'role', 'self'],
        properties: {
          name: { type: 'string' as const },
          role: { enum: ['user'] },
          self: { type: 'object' as const }
        }
      } as OpenAPIV3.SchemaObject;

      checkPolymorphism({
        value: cyclicValue,
        schema: {
          oneOf: [schema1, schema2]
        },
        ctx,
        validateShape
      });

      expect(ctx.hasErrors()).toBe(false);
    });

    it('should not bypass branch validation for cyclic properties in tryValidateDiscriminator', () => {
      const dogSchema = {
        type: 'object' as const,
        title: 'Dog',
        required: ['petType', 'bark', 'self'],
        properties: {
          petType: { const: 'dog' } as unknown as OpenAPIV3.SchemaObject,
          bark: { type: 'boolean' as const },
          self: { type: 'object' as const }
        }
      } as unknown as OpenAPIV3.SchemaObject;

      const parentSchema = {
        oneOf: [dogSchema],
        discriminator: {
          propertyName: 'petType'
        }
      } as unknown as OpenAPIV3.SchemaObject;

      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Dog: dogSchema
          }
        }
      } as unknown as OpenAPIV3.Document;

      const ctx = new ValidationContext(spec);

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

      expect(ctx.hasErrors()).toBe(true);
      expect(ctx.errors[0]).toContain('Expected boolean, received string');
    });

    it('should prevent stack overflow in recursive discriminator resolution', () => {
      const parentSchema = {
        type: 'object' as const,
        discriminator: {
          propertyName: 'type'
        }
      } as unknown as OpenAPIV3.SchemaObject;

      const childSchema = {
        title: 'Child',
        allOf: [parentSchema],
        properties: {
          type: { const: 'child' } as unknown as OpenAPIV3.SchemaObject,
          valid: { type: 'boolean' as const }
        }
      } as unknown as OpenAPIV3.SchemaObject;

      parentSchema.oneOf = [childSchema];

      const spec = {
        openapi: '3.0.0',
        info: { title: 'Recursive Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Parent: parentSchema,
            Child: childSchema
          }
        }
      } as unknown as OpenAPIV3.Document;

      const ctx = new ValidationContext(spec);
      const cyclicValue = { type: 'child', valid: true };

      checkPolymorphism({
        value: cyclicValue,
        schema: parentSchema,
        ctx,
        validateShape
      });

      expect(ctx.hasErrors()).toBe(false);
    });

    it('should prevent stack overflow in recursive compositions without a discriminator', () => {
      const recursiveSchema: OpenAPIV3.SchemaObject = {
        type: 'object',
        properties: {
          nested: {}
        }
      };

      const parentSchema: OpenAPIV3.SchemaObject = {
        oneOf: [recursiveSchema]
      };

      if (recursiveSchema.properties) {
        recursiveSchema.properties.nested = parentSchema;
      }

      const ctx = new ValidationContext();
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

      expect(ctx.hasErrors()).toBe(false);
    });

    it('should prevent stack overflow in recursive compositions with primitive values', () => {
      const recursiveSchema: OpenAPIV3.SchemaObject = {
        type: 'string',
        allOf: []
      };

      const parentSchema: OpenAPIV3.SchemaObject = {
        oneOf: [recursiveSchema]
      };

      recursiveSchema.allOf = [parentSchema];

      const ctx = new ValidationContext();
      const primitiveValue = 'hello';

      checkPolymorphism({
        value: primitiveValue,
        schema: parentSchema,
        ctx,
        validateShape
      });

      expect(ctx.hasErrors()).toBe(false);
    });
  });

  describe('oneOf short-circuit optimization', () => {
    it('should stop evaluating schemas as soon as more than one schema passes', () => {
      const ctx = new ValidationContext();
      const schema1 = { type: 'string' } as OpenAPIV3.SchemaObject;
      const schema2 = { type: 'string' } as OpenAPIV3.SchemaObject;
      const schema3 = { type: 'string' } as OpenAPIV3.SchemaObject;

      const validateShape = vi.fn();

      checkPolymorphism({
        value: 'any',
        schema: {
          oneOf: [schema1, schema2, schema3]
        },
        ctx,
        validateShape
      });

      expect(validateShape).toHaveBeenCalledTimes(2);
      expect(validateShape).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ schema: schema1 })
      );
      expect(validateShape).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ schema: schema2 })
      );
    });
  });
});
