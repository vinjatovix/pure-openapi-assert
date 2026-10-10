import { describe, it, beforeEach, vi } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';
import { validateShape } from '../../../src/validators/shape.js';
import { contextMother } from '../../helpers/contextMother.js';
import { schemaMother } from '../../helpers/schemaMother.js';
import {
  assertValid,
  assertHasValidationError
} from '../../helpers/assertions.js';

describe('validators/shape', () => {
  let ctx: ReturnType<typeof contextMother.empty>;

  beforeEach(() => {
    ctx = contextMother.empty();
  });

  describe('null value validation', () => {
    it('should accept null values for unconstrained open schemas', () => {
      const schema = schemaMother.empty({ description: 'ID' });
      const payload = null;

      validateShape({
        value: payload,
        schema,
        ctx,
        validateShape: vi.fn()
      });

      assertValid(ctx);
    });

    it.each([
      ['type', schemaMother.string()],
      ['allOf', schemaMother.allOf([schemaMother.string()])],
      ['anyOf', schemaMother.anyOf([schemaMother.string()])],
      ['oneOf', schemaMother.oneOf([schemaMother.string()])]
    ])(
      'should reject null values for open schemas with "%s" constraint',
      (_, schema) => {
        const payload = null;

        validateShape({
          value: payload,
          schema,
          ctx,
          validateShape
        });

        assertHasValidationError(
          ctx,
          'Field is not nullable but received null'
        );
      }
    );
  });

  describe('unresolved $ref', () => {
    const refTo = (name: string, siblings: object = {}) =>
      ({
        $ref: `#/components/schemas/${name}`,
        ...siblings
      }) as unknown as OpenAPIV3.SchemaObject;

    it('should admit null when the referenced schema admits it', () => {
      const refCtx = contextMother.withSchemas({
        Name: schemaMother.string({ nullable: true })
      });

      validateShape({
        value: null,
        schema: refTo('Name'),
        ctx: refCtx,
        validateShape
      });

      assertValid(refCtx);
    });

    it('should reject null when the referenced schema does not admit it, ignoring a sibling nullable', () => {
      const refCtx = contextMother.withSchemas({ Name: schemaMother.string() });

      validateShape({
        value: null,
        schema: refTo('Name', { nullable: true }),
        ctx: refCtx,
        validateShape
      });

      assertHasValidationError(
        refCtx,
        'Field is not nullable but received null'
      );
    });

    it('should validate non-null values against the referenced schema', () => {
      const refCtx = contextMother.withSchemas({ Name: schemaMother.string() });

      validateShape({
        value: 42,
        schema: refTo('Name'),
        ctx: refCtx,
        validateShape
      });

      assertHasValidationError(refCtx, 'Expected string, received number');
    });

    it('should follow a $ref that points to another $ref', () => {
      const refCtx = contextMother.withSchemas({
        Alias: { $ref: '#/components/schemas/Name' },
        Name: schemaMother.string()
      });

      validateShape({
        value: 42,
        schema: refTo('Alias'),
        ctx: refCtx,
        validateShape
      });

      assertHasValidationError(refCtx, 'Expected string, received number');
    });

    it('should report an unresolved $ref instead of looping on a $ref cycle', () => {
      const refCtx = contextMother.withSchemas({
        A: { $ref: '#/components/schemas/B' },
        B: { $ref: '#/components/schemas/A' }
      });

      validateShape({
        value: 'x',
        schema: refTo('A'),
        ctx: refCtx,
        validateShape
      });

      assertHasValidationError(
        refCtx,
        "Unresolved $ref: '#/components/schemas/B'"
      );
    });

    it('should report an unresolved $ref when the target cannot be found', () => {
      validateShape({
        value: null,
        schema: refTo('Missing'),
        ctx,
        validateShape
      });

      assertHasValidationError(
        ctx,
        "Unresolved $ref: '#/components/schemas/Missing'"
      );
    });
  });

  describe('nullable admission by type', () => {
    it('should admit null when type and nullable are declared', () => {
      validateShape({
        value: null,
        schema: schemaMother.string({ nullable: true }),
        ctx,
        validateShape: vi.fn()
      });

      assertValid(ctx);
    });

    it('should reject null when type is declared without nullable', () => {
      validateShape({
        value: null,
        schema: schemaMother.string({ nullable: false }),
        ctx,
        validateShape: vi.fn()
      });

      assertHasValidationError(ctx, 'Field is not nullable but received null');
    });

    it.each([
      ['object', schemaMother.object({ nullable: true, required: ['url'] })],
      ['array', schemaMother.array({ nullable: true, minItems: 2 })]
    ])(
      'should admit null for %s without running its content checks',
      (_, schema) => {
        validateShape({
          value: null,
          schema,
          ctx,
          validateShape: vi.fn()
        });

        assertValid(ctx);
      }
    );

    it('should not evaluate enum over a null admitted by type, even when enum omits null', () => {
      validateShape({
        value: null,
        schema: schemaMother.string({ nullable: true, enum: ['a', 'b'] }),
        ctx,
        validateShape: vi.fn()
      });

      assertValid(ctx);
    });

    it('should reject null with allOf when the subschema does not admit it, even if the container is nullable', () => {
      validateShape({
        value: null,
        schema: schemaMother.object({
          nullable: true,
          allOf: [schemaMother.string()]
        }),
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Field is not nullable but received null');
    });

    it('should reject null with nullable and enum but no type, since nullable needs type', () => {
      validateShape({
        value: null,
        schema: schemaMother.empty({ nullable: true, enum: ['a'] }),
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Expected one of [a], received null');
    });

    it.each([
      ['allOf', schemaMother.allOf([schemaMother.empty({ description: 'x' })])],
      ['not', schemaMother.not(schemaMother.string())]
    ])(
      'should evaluate enum against null without type when %s is present',
      (_, composition) => {
        validateShape({
          value: null,
          schema: { ...composition, enum: ['a'] },
          ctx,
          validateShape
        });

        assertHasValidationError(ctx, 'Expected one of [a], received null');
      }
    );

    it('should admit null without type when a subschema admits it', () => {
      validateShape({
        value: null,
        schema: schemaMother.allOf([schemaMother.string({ nullable: true })]),
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should admit null when the not subschema rejects it', () => {
      validateShape({
        value: null,
        schema: schemaMother.not(schemaMother.string()),
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should keep admitting null for schemas without type or composition when nullable', () => {
      validateShape({
        value: null,
        schema: schemaMother.empty({ nullable: true }),
        ctx,
        validateShape: vi.fn()
      });

      assertValid(ctx);
    });
  });
});
