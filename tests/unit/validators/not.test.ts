import { describe, it, beforeEach, expect } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';
import { validateShape } from '../../../src/validators/shape.js';
import { ValidationContext } from '../../../src/core/ValidationContext.js';
import {
  assertValid,
  assertHasValidationError
} from '../../helpers/assertions.js';
import { SchemaBuilder } from '../../helpers/SchemaBuilder.js';
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
      const schema = new SchemaBuilder()
        .not(new SchemaBuilder().build())
        .build();

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
      const schema = new SchemaBuilder()
        .type('string')
        .not(new SchemaBuilder().type('string').build())
        .build();

      validateShape({
        value: 'prohibited-string',
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Value matches prohibited schema');
    });

    it('should accept a payload that does not match the prohibited primitive type', () => {
      const schema = new SchemaBuilder()
        .type('string')
        .not(new SchemaBuilder().type('integer').build())
        .build();

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
      const schema = new SchemaBuilder()
        .type('integer')
        .not(new SchemaBuilder().minimum(0).build())
        .build();

      validateShape({
        value: 10,
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Value matches prohibited schema');
    });

    it('should accept a payload that does not match negated numeric constraints', () => {
      const schema = new SchemaBuilder()
        .type('integer')
        .not(new SchemaBuilder().minimum(0).build())
        .build();

      validateShape({
        value: -5,
        schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should reject an object matching negated required properties', () => {
      const schema = new SchemaBuilder()
        .type('object')
        .not(new SchemaBuilder().type('object').required('secret').build())
        .build();

      validateShape({
        value: { id: 1, secret: 'abc' },
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Value matches prohibited schema');
    });

    it('should accept an object that does not match negated required properties', () => {
      const schema = new SchemaBuilder()
        .type('object')
        .not(new SchemaBuilder().type('object').required('secret').build())
        .build();

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
        const stringSchema = new SchemaBuilder().type('string').build();
        const doubleNegationSchema = new SchemaBuilder()
          .not(new SchemaBuilder().not(stringSchema).build())
          .build();

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
        const stringSchema = new SchemaBuilder().type('string').build();
        const tripleNegationSchema = new SchemaBuilder()
          .not(
            new SchemaBuilder()
              .not(new SchemaBuilder().not(stringSchema).build())
              .build()
          )
          .build();

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
      const testCtx = new ValidationContext(mockSpec);

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
  });
});
