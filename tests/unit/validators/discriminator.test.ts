import { schemaMother } from '../../helpers/schemaMother.js';
import { describe, it, expect } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';

import { resolveDiscriminatorSchema } from '../../../src/validators/discriminator.js';
import { validateShape } from '../../../src/validators/shape.js';

import {
  assertHasValidationError,
  assertValid
} from '../../helpers/assertions.js';
import { contextMother } from '../../helpers/contextMother.js';

describe('validators/discriminator', () => {
  describe('resolveDiscriminatorSchema', () => {
    const dogSchema = schemaMother.object({
      title: 'Dog',
      properties: {
        petType: schemaMother.empty({ const: 'dog' } as unknown as OpenAPIV3.SchemaObject)
      }
    });

    const catSchema = schemaMother.object({
      title: 'Cat',
      properties: {
        petType: schemaMother.empty({ enum: ['cat', 'kitty'] })
      }
    });

    const schemas: OpenAPIV3.SchemaObject[] = [
      dogSchema,
      catSchema,
      'not-a-schema-object' as unknown as OpenAPIV3.SchemaObject,
      schemaMother.object({ title: 'NoProps' }),
      schemaMother.object({
        title: 'BadProp',
        properties: {
          petType: 'not-a-property-schema' as unknown as OpenAPIV3.SchemaObject
        }
      })
    ];

    const parentSchema = schemaMother.oneOf([...schemas], {
      discriminator: { propertyName: 'petType' }
    });

    it.each([
      {
        value: 'not-an-object',
        expectedType: 'failed',
        outcome: 'is not an object'
      },
      { value: ['item'], expectedType: 'failed', outcome: 'is not an object' },
      {
        value: { foo: 'bar' },
        expectedType: 'failed',
        outcome: "property 'petType' is missing"
      },
      {
        value: { petType: undefined },
        expectedType: 'failed',
        outcome: "property 'petType' is missing"
      },
      {
        value: { petType: { nested: 'object' } },
        expectedType: 'failed',
        outcome: 'must be a primitive value'
      },
      {
        value: { petType: 'dog' },
        expectedType: 'resolved',
        outcome: dogSchema,
        spec: { Dog: dogSchema, Cat: catSchema }
      },
      {
        value: { petType: 'dog' },
        expectedType: 'resolved',
        outcome: dogSchema,
        spec: { Dog: dogSchema, Cat: catSchema },
        customMapping: {
          dog: '#/components/schemas/NonExistentDog',
          cat: '#/components/schemas/Cat'
        }
      },
      {
        value: { petType: 'Dog' },
        expectedType: 'resolved',
        outcome: dogSchema,
        spec: { Dog: dogSchema, Cat: catSchema },
        omitMapping: true
      },
      {
        value: { petType: 'Dog' },
        expectedType: 'resolved',
        outcome: dogSchema
      },
      {
        value: { petType: 'kitty' },
        expectedType: 'resolved',
        outcome: catSchema
      },
      {
        value: { petType: 'dog' },
        expectedType: 'resolved',
        outcome: dogSchema
      },
      {
        value: { petType: 'bird' },
        expectedType: 'failed',
        outcome: "value 'bird' does not match any schema"
      }
    ])(
      'should resolve correctly or fail with expected error for value: $value',
      ({ value, expectedType, outcome, spec, customMapping, omitMapping }) => {
        const ctx = spec
          ? contextMother.withSchemas(spec)
          : contextMother.empty();

        let testSchema = parentSchema;
        if (customMapping) {
          testSchema = schemaMother.oneOf([...schemas], {
            discriminator: { propertyName: 'petType' }
          });
        } else if (omitMapping) {
          testSchema = schemaMother.oneOf([...schemas], {
            discriminator: { propertyName: 'petType' }
          });
        }

        const result = resolveDiscriminatorSchema({
          validationArgs: {
            value,
            schema: testSchema,
            ctx,
            validateShape
          },
          schemas,
          compositionType: 'oneOf'
        });

        if (expectedType === 'resolved') {
          expect(result).toEqual({ type: 'resolved', schema: outcome });
          assertValid(ctx);
        } else {
          expect(result).toEqual({ type: 'failed' });
          assertHasValidationError(ctx, outcome as string);
        }
      }
    );
  });

  describe('Inherited properties and structural matching', () => {
    it('should resolve discriminator property inherited from allOf', () => {
      const baseSchema = schemaMother.object({
        properties: {
          kind: schemaMother.empty({ const: 'derived-dog' } as unknown as OpenAPIV3.SchemaObject)
        }
      });
      const childSchema = schemaMother.allOf([baseSchema], {
        title: 'DerivedDog',
        properties: {
          bark: schemaMother.boolean()
        }
      });
      const schemas: OpenAPIV3.SchemaObject[] = [childSchema];
      const parentSchema = schemaMother.oneOf([...schemas], {
        discriminator: { propertyName: 'kind' }
      });

      const ctx = contextMother.empty();
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { kind: 'derived-dog', bark: true },
          schema: parentSchema,
          ctx,
          validateShape
        },
        schemas,
        compositionType: 'oneOf'
      });

      expect(result).toEqual({ type: 'resolved', schema: childSchema });
    });

    it('should resolve discriminator property when derived schema overrides with less specific type (preserving const from base)', () => {
      const baseSchema = schemaMother.object({
        properties: {
          kind: schemaMother.empty({ const: 'derived-dog' } as unknown as OpenAPIV3.SchemaObject)
        }
      });
      const childSchema = schemaMother.allOf([baseSchema], {
        title: 'DerivedDog',
        properties: {
          kind: schemaMother.string(),
          bark: schemaMother.boolean()
        }
      });
      const schemas: OpenAPIV3.SchemaObject[] = [childSchema];
      const parentSchema = schemaMother.oneOf([...schemas], {
        discriminator: { propertyName: 'kind' }
      });

      const ctx = contextMother.empty();
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { kind: 'derived-dog', bark: true },
          schema: parentSchema,
          ctx,
          validateShape
        },
        schemas,
        compositionType: 'oneOf'
      });

      expect(result).toEqual({ type: 'resolved', schema: childSchema });
    });

    it('should match schema structurally even if physical reference equality fails (cloned target)', () => {
      const originalSchema = schemaMother.object({
        title: 'ClonedModel',
        properties: {
          modelType: schemaMother.empty({ const: 'clone' } as unknown as OpenAPIV3.SchemaObject)
        }
      });
      const clonedSchema = structuredClone(originalSchema);

      const ctx = contextMother.withSchemas({
        ClonedModel: originalSchema
      });

      const parentSchema = schemaMother.oneOf([clonedSchema], {
        discriminator: { propertyName: 'modelType' }
      });

      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { modelType: 'clone' },
          schema: parentSchema,
          ctx,
          validateShape
        },
        schemas: [clonedSchema],
        compositionType: 'oneOf'
      });

      expect(result).toEqual({ type: 'resolved', schema: clonedSchema });
    });

    it('should handle cyclic allOf schemas during properties resolution without crashing', () => {
      const cyclicSchema = schemaMother.object({
        title: 'CyclicSchema',
        properties: {
          petType: schemaMother.empty({ const: 'cyclic' } as unknown as OpenAPIV3.SchemaObject)
        }
      });
      cyclicSchema.allOf = [cyclicSchema];

      const parentSchema = schemaMother.oneOf([cyclicSchema], {
        discriminator: { propertyName: 'petType' }
      });

      const ctx = contextMother.empty();
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { petType: 'cyclic' },
          schema: parentSchema,
          ctx,
          validateShape
        },
        schemas: [cyclicSchema],
        compositionType: 'oneOf'
      });

      expect(result).toEqual({
        type: 'resolved',
        schema: cyclicSchema
      });
    });
  });

  describe('Fallback ambiguity and prototype safety', () => {
    it('should not look up discriminator values on Object.prototype (e.g. toString)', () => {
      const dogSchema = schemaMother.object({
        title: 'Dog',
        properties: {
          petType: schemaMother.empty({ const: 'dog' } as unknown as OpenAPIV3.SchemaObject)
        }
      });

      const parentSchema = schemaMother.oneOf([dogSchema], {
        discriminator: { propertyName: 'petType' }
      });

      const ctx = contextMother.withSchemas({
        Dog: dogSchema
      });

      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { petType: 'toString' },
          schema: parentSchema,
          ctx,
          validateShape
        },
        schemas: [dogSchema],
        compositionType: 'oneOf'
      });

      expect(result).toEqual({ type: 'failed' });
      assertHasValidationError(
        ctx,
        "value 'toString' does not match any schema"
      );
    });

    it('should not resolve a discriminator value if it is inherited from Object.prototype', () => {
      const originalPrototypeVal = (Object.prototype as Record<string, string>)
        .petType;
      (Object.prototype as Record<string, string>).petType = 'dog';

      try {
        const dogSchema = schemaMother.object({
          title: 'Dog',
          properties: {
            petType: schemaMother.empty({ const: 'dog' } as unknown as OpenAPIV3.SchemaObject)
          }
        });

        const parentSchema = schemaMother.oneOf([dogSchema], {
          discriminator: { propertyName: 'petType' }
        });

        const ctx = contextMother.withSchemas({
          Dog: dogSchema
        });

        const result = resolveDiscriminatorSchema({
          validationArgs: {
            value: {},
            schema: parentSchema,
            ctx,
            validateShape
          },
          schemas: [dogSchema],
          compositionType: 'oneOf'
        });

        expect(result).toEqual({ type: 'failed' });
        assertHasValidationError(
          ctx,
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
      const targetA = schemaMother.object({
        properties: {
          kind: schemaMother.empty({ const: 'duplicate' } as unknown as OpenAPIV3.SchemaObject)
        }
      });
      const targetB = schemaMother.object({
        properties: {
          kind: schemaMother.empty({ const: 'duplicate' } as unknown as OpenAPIV3.SchemaObject)
        }
      });
      const parentSchema = schemaMother.oneOf([targetA], {
        discriminator: { propertyName: 'kind' }
      });

      const ctx = contextMother.empty();
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { kind: 'duplicate' },
          schema: parentSchema,
          ctx,
          validateShape
        },
        schemas: [targetA, targetB],
        compositionType: 'oneOf'
      });

      expect(result).toEqual({ type: 'failed' });
      assertHasValidationError(
        ctx,
        "value 'duplicate' does not match any schema"
      );
    });

    it('should ignore matchByTitle fallback match if the title is ambiguous', () => {
      const targetA = schemaMother.object({ title: 'SameTitle' });
      const targetB = schemaMother.object({ title: 'SameTitle' });

      const parentSchema = schemaMother.oneOf([targetA], {
        discriminator: { propertyName: 'kind' }
      });

      const ctx = contextMother.empty();
      const result = resolveDiscriminatorSchema({
        validationArgs: {
          value: { kind: 'SameTitle' },
          schema: parentSchema,
          ctx,
          validateShape
        },
        schemas: [targetA, targetB],
        compositionType: 'oneOf'
      });

      expect(result).toEqual({ type: 'failed' });
      assertHasValidationError(
        ctx,
        "value 'SameTitle' does not match any schema in 'oneOf'"
      );
    });
  });
});
