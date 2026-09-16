import { describe, it, beforeEach, expect } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';
import { validateShape } from '../../../src/validators/shape.js';
import { ValidationContext } from '../../../src/core/ValidationContext.js';
import {
  assertValid,
  assertHasValidationError
} from '../../helpers/assertions.js';
import { schemaMother } from '../../helpers/schemaMother.js';
import { ValidationContextBuilder } from '../../helpers/ValidationContextBuilder.js';

describe('validators/not', () => {
  let ctx: ReturnType<typeof ValidationContextBuilder.prototype.build>;

  beforeEach(() => {
    ctx = new ValidationContextBuilder().build();
  });

  describe('Validation of empty negated schemas (not: {})', () => {
    it.each([
      { type: 'string', value: 'test-string' },
      { type: 'integer', value: 12345 },
      { type: 'boolean', value: true },
      { type: 'object', value: { key: 'value' } },
      { type: 'array', value: [1, 2, 3] }
    ])('should reject $type payloads', ({ value }) => {
      const schema = schemaMother.not(schemaMother.empty());

      validateShape({ value, schema, ctx, validateShape });

      assertHasValidationError(ctx, 'Value matches prohibited schema');
    });

    it('should reject null payloads when nullable is true', () => {
      const schema: OpenAPIV3.SchemaObject = {
        nullable: true,
        not: {}
      };

      validateShape({ value: null, schema, ctx, validateShape });

      assertHasValidationError(ctx, 'Value matches prohibited schema');
    });
  });

  describe('Negation of basic types', () => {
    it('should reject a payload matching the prohibited primitive type', () => {
      const schema = schemaMother.string({
        not: schemaMother.string()
      });

      validateShape({
        value: 'prohibited-string',
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Value matches prohibited schema');
    });

    it('should accept a payload that does not match the prohibited primitive type', () => {
      const schema = schemaMother.string({
        not: schemaMother.integer()
      });

      validateShape({
        value: 'allowed-string',
        schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });
  });

  describe('Negation of complex schemas and constraints', () => {
    it('should reject a payload matching negated numeric constraints', () => {
      const schema = schemaMother.integer({
        not: schemaMother.empty({ minimum: 0 })
      });

      validateShape({
        value: 10,
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Value matches prohibited schema');
    });

    it('should accept a payload that does not match negated numeric constraints', () => {
      const schema = schemaMother.integer({
        not: schemaMother.empty({ minimum: 0 })
      });

      validateShape({
        value: -5,
        schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should reject an object matching negated required properties', () => {
      const schema = schemaMother.object({
        not: schemaMother.object({ required: ['secret'] })
      });

      validateShape({
        value: { id: 1, secret: 'abc' },
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Value matches prohibited schema');
    });

    it('should accept an object that does not match negated required properties', () => {
      const schema = schemaMother.object({
        not: schemaMother.object({ required: ['secret'] })
      });

      validateShape({
        value: { id: 1 },
        schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it.each([
      {
        value: 'hello',
        description: 'accept matching payloads',
        expectValid: true
      },
      {
        value: 123,
        description: 'reject non-matching payloads',
        expectValid: false
      }
    ])(
      'should $description under double negation',
      ({ value, expectValid }) => {
        const stringSchema = schemaMother.string();
        const doubleNegationSchema = schemaMother.not(
          schemaMother.not(stringSchema)
        );

        validateShape({
          value,
          schema: doubleNegationSchema,
          ctx,
          validateShape
        });

        if (expectValid) {
          assertValid(ctx);
        } else {
          assertHasValidationError(ctx, 'Value matches prohibited schema');
        }
      }
    );

    it.each([
      {
        value: 'hello',
        description: 'reject matching payloads',
        expectValid: false
      },
      {
        value: 123,
        description: 'accept non-matching payloads',
        expectValid: true
      }
    ])(
      'should $description under triple negation',
      ({ value, expectValid }) => {
        const stringSchema = schemaMother.string();
        const tripleNegationSchema = schemaMother.not(
          schemaMother.not(schemaMother.not(stringSchema))
        );

        validateShape({
          value,
          schema: tripleNegationSchema,
          ctx,
          validateShape
        });

        if (expectValid) {
          assertValid(ctx);
        } else {
          assertHasValidationError(ctx, 'Value matches prohibited schema');
        }
      }
    );

    it('should safely handle recursion and prevent infinite loops using shared cycle tracking', () => {
      const recursiveSchema: OpenAPIV3.SchemaObject = {
        type: 'object',
        properties: {
          value: { type: 'string' }
        }
      };
      recursiveSchema.properties!.next = { not: recursiveSchema };
      const cyclicObj: Record<string, unknown> = { value: 'test' };
      cyclicObj.next = cyclicObj;

      validateShape({
        value: cyclicObj,
        schema: recursiveSchema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Cyclic not schema detected');
    });

    it('should propagate unresolved references from negated schema to parent context instead of matching as non-match', () => {
      const mockSpec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };
      const schema: OpenAPIV3.SchemaObject = {
        not: {
          allOf: [{ $ref: '#/components/schemas/Missing' }]
        }
      };
      const testCtx = new ValidationContext({ spec: mockSpec });

      validateShape({
        value: 'any-value',
        schema,
        ctx: testCtx,
        validateShape
      });

      expect(testCtx.hasErrors()).toBe(true);
      expect(testCtx.errors[0]?.message).toContain('Unresolved $ref');
      expect(testCtx.errors[0]?.message).not.toContain(
        'Value matches prohibited schema'
      );
    });

    it('should separate visited cycle tracking for negated schema to avoid false matches', () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: 'object',
        properties: {
          next: {
            not: {
              type: 'object',
              required: ['foo']
            }
          }
        }
      };
      const cyclicObj: Record<string, unknown> = {};
      cyclicObj.next = cyclicObj;

      validateShape({
        value: cyclicObj,
        schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should safely terminate cyclic negated schemas with cyclic negation error', () => {
      const cyclicSchema: OpenAPIV3.SchemaObject = {};
      cyclicSchema.not = cyclicSchema;

      validateShape({
        value: 'any-value',
        schema: cyclicSchema,
        ctx,
        validateShape
      });

      expect(ctx.hasErrors()).toBe(true);
      expect(ctx.errors[0]?.message).toContain('Cyclic not schema detected');
    });

    it('should not misclassify payload values containing error substrings as structural errors', () => {
      const schemaRejectingEnum = schemaMother.not(
        schemaMother.string({ enum: ['allowed-value'] })
      );

      validateShape({
        value: 'Unresolved $ref: dummy',
        schema: schemaRejectingEnum,
        ctx,
        validateShape
      });

      const hasValidationErrors = ctx.hasErrors();
      expect(hasValidationErrors).toBe(false);
    });
  });

  describe('Combined Polymorphism and Negation Edge Cases (User Stories 1-4)', () => {
    describe('Sibling oneOf and not', () => {
      it('should validate successfully when payload matches oneOf but does not match sibling not constraint', () => {
        const schema = schemaMother.oneOf(
          [schemaMother.string(), schemaMother.integer()],
          { not: schemaMother.integer() }
        );
        const payload = 'hello';

        validateShape({ value: payload, schema, ctx, validateShape });

        assertValid(ctx);
      });

      it('should fail validation when payload matches oneOf but matches sibling not constraint', () => {
        const schema = schemaMother.oneOf(
          [schemaMother.string(), schemaMother.integer()],
          { not: schemaMother.integer() }
        );
        const payload = 123;

        validateShape({ value: payload, schema, ctx, validateShape });

        assertHasValidationError(ctx, 'Value matches prohibited schema');
      });

      it('should fail with multiple error messages when payload fails both oneOf and sibling not constraint', () => {
        const schema = schemaMother.oneOf([schemaMother.string()], {
          not: schemaMother.number()
        });
        const payload = 123;

        validateShape({ value: payload, schema, ctx, validateShape });

        expect(ctx.hasErrors()).toBe(true);
        const messages = ctx.errors.map((e) => e.message);
        expect(messages).toContain('Value matches prohibited schema');
        expect(
          messages.some((m) =>
            m.includes("Value matches 0 schemas from 'oneOf'")
          )
        ).toBe(true);
      });
    });

    describe('Sibling allOf and not (Paradox)', () => {
      it('should fail with matches prohibited schema when payload matches the required allOf type but violates the sibling not constraint of the same type', () => {
        const schema = schemaMother.allOf([schemaMother.string()], {
          not: schemaMother.string()
        });
        const payload = 'hello';

        validateShape({ value: payload, schema, ctx, validateShape });

        assertHasValidationError(ctx, 'Value matches prohibited schema');
      });

      it('should fail with type mismatch error when payload violates the required allOf type', () => {
        const schema = schemaMother.allOf([schemaMother.string()], {
          not: schemaMother.string()
        });
        const payload = 123;

        validateShape({ value: payload, schema, ctx, validateShape });

        expect(ctx.hasErrors()).toBe(true);
        expect(ctx.errors[0]?.message).toContain(
          'Expected string, received number'
        );
      });
    });

    describe('Sibling anyOf and not (Partial Exclusion)', () => {
      it('should fail when payload matches anyOf but violates the sibling not constraint', () => {
        const schema = schemaMother.anyOf(
          [schemaMother.string({ minLength: 5 }), schemaMother.integer()],
          { not: schemaMother.string() }
        );
        const payload = 'hello world';

        validateShape({ value: payload, schema, ctx, validateShape });

        assertHasValidationError(ctx, 'Value matches prohibited schema');
      });

      it('should succeed when payload matches anyOf and does not violate the sibling not constraint', () => {
        const schema = schemaMother.anyOf(
          [schemaMother.string({ minLength: 5 }), schemaMother.integer()],
          { not: schemaMother.string() }
        );
        const payload = 100;

        validateShape({ value: payload, schema, ctx, validateShape });

        assertValid(ctx);
      });
    });

    describe('US4: Nested logical compositions under not (Priority: P2)', () => {
      it('should succeed when payload does not match nested oneOf composition under not', () => {
        const schema = schemaMother.not(
          schemaMother.oneOf([schemaMother.string(), schemaMother.integer()])
        );
        const payload = [1, 2, 3];

        validateShape({ value: payload, schema, ctx, validateShape });

        assertValid(ctx);
      });

      it('should fail when payload matches nested oneOf composition under not', () => {
        const schema = schemaMother.not(
          schemaMother.oneOf([schemaMother.string(), schemaMother.integer()])
        );
        const payload = 'test';

        validateShape({ value: payload, schema, ctx, validateShape });

        assertHasValidationError(ctx, 'Value matches prohibited schema');
      });

      it('should safely terminate cyclic negated schemas with cyclic negation error', () => {
        const recursiveSchema: OpenAPIV3.SchemaObject = {
          type: 'object',
          properties: {
            value: { type: 'string' }
          }
        };
        recursiveSchema.properties!.next = {
          not: {
            oneOf: [recursiveSchema]
          }
        };
        const cyclicObj: Record<string, unknown> = { value: 'test' };
        cyclicObj.next = cyclicObj;

        validateShape({
          value: cyclicObj,
          schema: recursiveSchema,
          ctx,
          validateShape
        });

        expect(ctx.hasErrors()).toBe(true);
        const cyclicError = ctx.errors.find(
          (e) => e.code === 'CYCLIC_NOT_SCHEMA'
        );
        expect(cyclicError).toBeDefined();
        expect(cyclicError?.message).toContain('Cyclic not schema detected');
      });

      it('should ignore/return early when resolvedNot is falsy because not schema is an invalid ref (T010)', () => {
        const schema: OpenAPIV3.SchemaObject = {
          type: 'string',
          not: { $ref: '#/components/schemas/Invalid' }
        };

        validateShape({
          value: 'test',
          schema,
          ctx,
          validateShape
        });

        expect(ctx.hasErrors()).toBe(true);
        expect(ctx.errors[0]?.code).toBe('UNRESOLVED_REF');
      });
    });
  });
});
