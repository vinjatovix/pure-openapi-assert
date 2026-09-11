import { describe, it, expect, vi } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';
import { ValidationContext } from '../../../src/core/ValidationContext.js';
import { resolveDiscriminatorSchema } from '../../../src/validators/discriminator.js';

describe('Validators discriminator.ts (Unit)', () => {
  describe('resolveDiscriminatorSchema', () => {
    const dogSchema = {
      type: 'object' as const,
      title: 'Dog',
      properties: {
        petType: { const: 'dog' } as unknown as OpenAPIV3.SchemaObject
      }
    } as unknown as OpenAPIV3.SchemaObject;
    const catSchema = {
      type: 'object' as const,
      title: 'Cat',
      properties: { petType: { enum: ['cat', 'kitty'] } }
    } as unknown as OpenAPIV3.SchemaObject;
    const schemas: OpenAPIV3.SchemaObject[] = [
      dogSchema,
      catSchema,
      'not-a-schema-object' as unknown as OpenAPIV3.SchemaObject,
      { type: 'object' as const, title: 'NoProps' },
      {
        type: 'object' as const,
        title: 'BadProp',
        properties: {
          petType: 'not-a-property-schema' as unknown as OpenAPIV3.SchemaObject
        }
      }
    ];

    const parentSchema = {
      oneOf: schemas,
      discriminator: {
        propertyName: 'petType',
        mapping: {
          dog: '#/components/schemas/Dog',
          cat: '#/components/schemas/Cat'
        }
      }
    } as unknown as OpenAPIV3.SchemaObject;

    it('should return null and add error if value is not an object', () => {
      const ctx = new ValidationContext();
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: 'not-an-object',
          schema: parentSchema,
          ctx,
          validateShape: vi.fn()
        },
        schemas: schemas,
        compositionType: 'oneOf'
      });
      expect(result).toEqual({ type: 'failed' });
      expect(ctx.errors[0]).toContain('is not an object');
    });

    it('should return null and add error if value is an array', () => {
      const ctx = new ValidationContext();
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: ['item'],
          schema: parentSchema,
          ctx,
          validateShape: vi.fn()
        },
        schemas: schemas,
        compositionType: 'oneOf'
      });
      expect(result).toEqual({ type: 'failed' });
      expect(ctx.errors[0]).toContain('is not an object');
    });

    it('should return null and add error if propertyName is missing in value', () => {
      const ctx = new ValidationContext();
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { foo: 'bar' },
          schema: parentSchema,
          ctx,
          validateShape: vi.fn()
        },
        schemas: schemas,
        compositionType: 'oneOf'
      });
      expect(result).toEqual({ type: 'failed' });
      expect(ctx.errors[0]).toContain("property 'petType' is missing");
    });

    it('should return null and add error if discriminator property is explicitly set to undefined', () => {
      const ctx = new ValidationContext();
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { petType: undefined },
          schema: parentSchema,
          ctx,
          validateShape: vi.fn()
        },
        schemas: schemas,
        compositionType: 'oneOf'
      });
      expect(result).toEqual({ type: 'failed' });
      expect(ctx.errors[0]).toContain("property 'petType' is missing");
    });

    it('should return null and add error if discriminator property is not a primitive value', () => {
      const ctx = new ValidationContext();
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { petType: { nested: 'object' } },
          schema: parentSchema,
          ctx,
          validateShape: vi.fn()
        },
        schemas: schemas,
        compositionType: 'oneOf'
      });
      expect(result).toEqual({ type: 'failed' });
      expect(ctx.errors[0]).toContain('must be a primitive value');
    });

    it('should resolve using mapping pointer if spec is present', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Dog: dogSchema,
            Cat: catSchema
          }
        }
      } as unknown as OpenAPIV3.Document;
      const ctx = new ValidationContext(spec);
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { petType: 'dog' },
          schema: parentSchema,
          ctx,
          validateShape: vi.fn()
        },
        schemas: schemas,
        compositionType: 'oneOf'
      });
      expect(result).toEqual({ type: 'resolved', schema: dogSchema });
    });

    it('should fall back to title matching if mapping exists but pointer is not found in schemas list', () => {
      const parentSchemaWithInvalidMapping = {
        oneOf: schemas,
        discriminator: {
          propertyName: 'petType',
          mapping: {
            dog: '#/components/schemas/NonExistentDog',
            cat: '#/components/schemas/Cat'
          }
        }
      } as unknown as OpenAPIV3.SchemaObject;
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Dog: dogSchema,
            Cat: catSchema
          }
        }
      } as unknown as OpenAPIV3.Document;
      const ctx = new ValidationContext(spec);
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { petType: 'dog' },
          schema: parentSchemaWithInvalidMapping,
          ctx,
          validateShape: vi.fn()
        },
        schemas: schemas,
        compositionType: 'oneOf'
      });
      expect(result).toEqual({ type: 'resolved', schema: dogSchema });
    });

    it('should resolve using implicit default mapping to components/schemas if mapping key is missing', () => {
      const schemaNoMapping = {
        oneOf: schemas,
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
            Dog: dogSchema,
            Cat: catSchema
          }
        }
      } as unknown as OpenAPIV3.Document;
      const ctx = new ValidationContext(spec);
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { petType: 'Dog' },
          schema: schemaNoMapping,
          ctx,
          validateShape: vi.fn()
        },
        schemas: schemas,
        compositionType: 'oneOf'
      });
      expect(result).toEqual({ type: 'resolved', schema: dogSchema });
    });

    it('should fall back to title matching if spec resolution fails', () => {
      const ctx = new ValidationContext();
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { petType: 'Dog' },
          schema: parentSchema,
          ctx,
          validateShape: vi.fn()
        },
        schemas: schemas,
        compositionType: 'oneOf'
      });
      expect(result).toEqual({ type: 'resolved', schema: dogSchema });
    });

    it('should fall back to properties const/enum matching if title matching fails', () => {
      const ctx = new ValidationContext();
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { petType: 'kitty' },
          schema: parentSchema,
          ctx,
          validateShape: vi.fn()
        },
        schemas: schemas,
        compositionType: 'oneOf'
      });
      expect(result).toEqual({ type: 'resolved', schema: catSchema });
    });

    it('should fall back to properties const matching if title matching fails and spec is undefined', () => {
      const ctx = new ValidationContext();
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { petType: 'dog' },
          schema: parentSchema,
          ctx,
          validateShape: vi.fn()
        },
        schemas: schemas,
        compositionType: 'oneOf'
      });
      expect(result).toEqual({ type: 'resolved', schema: dogSchema });
    });

    it('should return null and add error if no matching schema is found', () => {
      const ctx = new ValidationContext();
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { petType: 'bird' },
          schema: parentSchema,
          ctx,
          validateShape: vi.fn()
        },
        schemas: schemas,
        compositionType: 'oneOf'
      });
      expect(result).toEqual({ type: 'failed' });
      expect(ctx.errors[0]).toContain("value 'bird' does not match any schema");
    });
  });

  describe('Inherited properties and structural matching', () => {
    it('should resolve discriminator property inherited from allOf', () => {
      const baseSchema = {
        type: 'object' as const,
        properties: {
          kind: { const: 'derived-dog' } as unknown as OpenAPIV3.SchemaObject
        }
      } as unknown as OpenAPIV3.SchemaObject;
      const childSchema = {
        title: 'DerivedDog',
        allOf: [baseSchema],
        properties: {
          bark: { type: 'boolean' as const }
        }
      } as unknown as OpenAPIV3.SchemaObject;
      const schemas: OpenAPIV3.SchemaObject[] = [childSchema];
      const parentSchema = {
        oneOf: schemas,
        discriminator: {
          propertyName: 'kind'
        }
      } as unknown as OpenAPIV3.SchemaObject;

      const ctx = new ValidationContext();
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { kind: 'derived-dog', bark: true },
          schema: parentSchema,
          ctx,
          validateShape: vi.fn()
        },
        schemas: schemas,
        compositionType: 'oneOf'
      });

      expect(result).toEqual({ type: 'resolved', schema: childSchema });
    });

    it('should resolve discriminator property when derived schema overrides with less specific type (preserving const from base)', () => {
      const baseSchema = {
        type: 'object' as const,
        properties: {
          kind: { const: 'derived-dog' } as unknown as OpenAPIV3.SchemaObject
        }
      } as unknown as OpenAPIV3.SchemaObject;
      const childSchema = {
        title: 'DerivedDog',
        allOf: [baseSchema],
        properties: {
          kind: { type: 'string' as const },
          bark: { type: 'boolean' as const }
        }
      } as unknown as OpenAPIV3.SchemaObject;
      const schemas: OpenAPIV3.SchemaObject[] = [childSchema];
      const parentSchema = {
        oneOf: schemas,
        discriminator: {
          propertyName: 'kind'
        }
      } as unknown as OpenAPIV3.SchemaObject;

      const ctx = new ValidationContext();
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { kind: 'derived-dog', bark: true },
          schema: parentSchema,
          ctx,
          validateShape: vi.fn()
        },
        schemas: schemas,
        compositionType: 'oneOf'
      });

      expect(result).toEqual({ type: 'resolved', schema: childSchema });
    });

    it('should match schema structurally even if physical reference equality fails (cloned target)', () => {
      const originalSchema = {
        type: 'object' as const,
        title: 'ClonedModel',
        properties: {
          modelType: { const: 'clone' } as unknown as OpenAPIV3.SchemaObject
        }
      } as unknown as OpenAPIV3.SchemaObject;
      const clonedSchema = structuredClone(originalSchema);

      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            ClonedModel: originalSchema
          }
        }
      } as unknown as OpenAPIV3.Document;

      const parentSchema = {
        oneOf: [clonedSchema],
        discriminator: {
          propertyName: 'modelType'
        }
      } as unknown as OpenAPIV3.SchemaObject;

      const ctx = new ValidationContext(spec);
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { modelType: 'clone' },
          schema: parentSchema,
          ctx,
          validateShape: vi.fn()
        },
        schemas: [clonedSchema],
        compositionType: 'oneOf'
      });

      expect(result).toEqual({ type: 'resolved', schema: clonedSchema });
    });

    it('should handle cyclic allOf schemas during properties resolution without crashing', () => {
      const cyclicSchema = {
        type: 'object' as const,
        title: 'CyclicSchema',
        properties: {
          petType: { const: 'cyclic' } as unknown as OpenAPIV3.SchemaObject
        },
        allOf: [] as unknown[]
      };
      cyclicSchema.allOf = [cyclicSchema];

      const parentSchema = {
        oneOf: [cyclicSchema as unknown as OpenAPIV3.SchemaObject],
        discriminator: {
          propertyName: 'petType'
        }
      } as unknown as OpenAPIV3.SchemaObject;

      const ctx = new ValidationContext();
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { petType: 'cyclic' },
          schema: parentSchema,
          ctx,
          validateShape: vi.fn()
        },
        schemas: [cyclicSchema as unknown as OpenAPIV3.SchemaObject],
        compositionType: 'oneOf'
      });

      expect(result).toEqual({
        type: 'resolved',
        schema: cyclicSchema as unknown as OpenAPIV3.SchemaObject
      });
    });
  });

  describe('Fallback ambiguity and prototype safety', () => {
    it('should not look up discriminator values on Object.prototype (e.g. toString)', () => {
      const dogSchema = {
        type: 'object' as const,
        title: 'Dog',
        properties: {
          petType: { const: 'dog' } as unknown as OpenAPIV3.SchemaObject
        }
      } as unknown as OpenAPIV3.SchemaObject;

      const parentSchema = {
        oneOf: [dogSchema],
        discriminator: {
          propertyName: 'petType',
          mapping: {
            dog: '#/components/schemas/Dog'
          }
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

      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { petType: 'toString' },
          schema: parentSchema,
          ctx,
          validateShape: vi.fn()
        },
        schemas: [dogSchema],
        compositionType: 'oneOf'
      });

      expect(result).toEqual({ type: 'failed' });
      expect(ctx.errors[0]).toContain(
        "value 'toString' does not match any schema"
      );
    });

    it('should not resolve a discriminator value if it is inherited from Object.prototype', () => {
      const originalPrototypeVal = (Object.prototype as Record<string, string>)
        .petType;
      (Object.prototype as Record<string, string>).petType = 'dog';

      try {
        const dogSchema = {
          type: 'object' as const,
          title: 'Dog',
          properties: {
            petType: { const: 'dog' } as unknown as OpenAPIV3.SchemaObject
          }
        } as unknown as OpenAPIV3.SchemaObject;

        const parentSchema = {
          oneOf: [dogSchema],
          discriminator: {
            propertyName: 'petType',
            mapping: {
              dog: '#/components/schemas/Dog'
            }
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

        const result = resolveDiscriminatorSchema({
          validationArgs: {
            value: {},
            schema: parentSchema,
            ctx,
            validateShape: vi.fn()
          },
          schemas: [dogSchema],
          compositionType: 'oneOf'
        });

        expect(result).toEqual({ type: 'failed' });
        expect(ctx.errors[0]).toContain(
          "property 'petType' is missing in object"
        );
      } finally {
        if (originalPrototypeVal === undefined) {
          delete (Object.prototype as Record<string, string | undefined>)
            .petType;
        } else {
          (Object.prototype as Record<string, string>).petType =
            originalPrototypeVal;
        }
      }
    });

    it('should ignore property fallback match if it is ambiguous (multiple schemas match)', () => {
      const targetA = {
        type: 'object' as const,
        properties: {
          kind: { const: 'duplicate' } as unknown as OpenAPIV3.SchemaObject
        }
      } as OpenAPIV3.SchemaObject;
      const targetB = {
        type: 'object' as const,
        properties: {
          kind: { const: 'duplicate' } as unknown as OpenAPIV3.SchemaObject
        }
      } as OpenAPIV3.SchemaObject;
      const parentSchema = {
        oneOf: [targetA, targetB],
        discriminator: { propertyName: 'kind' }
      } as unknown as OpenAPIV3.SchemaObject;

      const ctx = new ValidationContext();
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { kind: 'duplicate' },
          schema: parentSchema,
          ctx,
          validateShape: vi.fn()
        },
        schemas: [targetA, targetB],
        compositionType: 'oneOf'
      });

      expect(result).toEqual({ type: 'failed' });
      expect(ctx.errors[0]).toContain(
        "value 'duplicate' does not match any schema"
      );
    });

    it('should ignore matchByTitle fallback match if the title is ambiguous', () => {
      const targetA = {
        type: 'object' as const,
        title: 'SameTitle'
      } as OpenAPIV3.SchemaObject;
      const targetB = {
        type: 'object' as const,
        title: 'SameTitle'
      } as OpenAPIV3.SchemaObject;

      const parentSchema = {
        oneOf: [targetA, targetB],
        discriminator: { propertyName: 'kind' }
      } as unknown as OpenAPIV3.SchemaObject;

      const ctx = new ValidationContext();
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { kind: 'SameTitle' },
          schema: parentSchema,
          ctx,
          validateShape: vi.fn()
        },
        schemas: [targetA, targetB],
        compositionType: 'oneOf'
      });

      expect(result).toEqual({ type: 'failed' });
      expect(ctx.errors[0]).toContain(
        "value 'SameTitle' does not match any schema in 'oneOf'"
      );
    });
  });
});
