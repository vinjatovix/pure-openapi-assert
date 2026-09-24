import type { OpenAPIV3 } from 'openapi-types';
import { describe, it, expect, beforeEach } from 'vitest';
import { validateShape } from '../../../src/validators/shape.js';
import {
  validateTypeCheck,
  validateEnum,
  validateConst,
  validateBaseType
} from '../../../src/validators/type-validators.js';

import {
  assertValid,
  assertHasValidationError
} from '../../helpers/assertions.js';
import { contextMother } from '../../helpers/contextMother.js';
import { schemaMother } from '../../helpers/schemaMother.js';

describe('validators/base', () => {
  let ctx: ReturnType<typeof contextMother.empty>;

  beforeEach(() => {
    ctx = contextMother.empty();
  });

  describe('validateTypeCheck', () => {
    it('should fail typecheck for wrong expected type and report errors', () => {
      const success = validateTypeCheck({
        value: 'string',
        schema: schemaMother.integer(),
        ctx,
        validateShape
      });

      expect(success).toBe(false);
      assertHasValidationError(ctx, 'Expected integer, received string');
    });

    it('should format type validation error for null values correctly', () => {
      validateTypeCheck({
        value: null,
        schema: schemaMother.string(),
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'received null');
    });

    it('should format type validation error for array values correctly', () => {
      validateTypeCheck({
        value: [1, 2, 3],
        schema: schemaMother.string(),
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Expected string, received array');
    });
  });

  describe('validateShape base validation requirements', () => {
    it('should throw error when non-nullable field receives null', () => {
      const schema = schemaMother.string({ nullable: false });
      validateShape({
        value: null,
        schema: schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Field is not nullable but received null');
    });

    it('should throw error when validateShape receives undefined directly', () => {
      const schema = schemaMother.string();
      validateShape({
        value: undefined,
        schema: schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Field is required but received undefined');
    });

    it('should not crash or resolve prototype properties as format validators', () => {
      const schema = schemaMother.string({ format: 'hasOwnProperty' });
      validateShape({
        value: 'some-value',
        schema: schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should ignore custom formats that match prototype properties if not defined on customFormats', () => {
      const schema = schemaMother.string({ format: 'toString' });
      validateShape({
        value: 'some-value',
        schema: schema,
        ctx,
        validateShape,
        customFormats: {}
      });

      assertValid(ctx);
    });
  });

  describe('validateEnum & validateConst', () => {
    it('validateEnum should cache and validate correctly', () => {
      const schema = schemaMother.string({ enum: ['admin', 'user'] });

      validateEnum({
        value: 'guest',
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Expected one of [admin, user]');
    });

    it('validateEnum should support bigint and format error message without throwing', () => {
      const schema = schemaMother.integer({ enum: [1n, 2n] });

      validateEnum({
        value: 3n,
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Expected one of [1, 2], received 3');
    });

    it('validateConst should use strict identity checking', () => {
      const schema = schemaMother.number({
        const: 42
      } as unknown as OpenAPIV3.SchemaObject);
      validateConst({
        value: 42,
        schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('validateConst should pass for deep strict equal objects that are not strictly identical (T008)', () => {
      const schema = schemaMother.object({
        const: { a: 1 }
      } as unknown as OpenAPIV3.SchemaObject);

      validateConst({
        value: { a: 1 },
        schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('validateConst should support bigint and format error message without throwing', () => {
      const schema = schemaMother.integer({
        const: 42n
      } as unknown as OpenAPIV3.SchemaObject);

      validateConst({
        value: 43n,
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Expected exactly 42, received 43');
    });
  });

  describe('Fallback handling and edge-case boundaries', () => {
    it('should bypass numeric constraint validations when the value is neither a number nor an int64 string', () => {
      const schema = schemaMother.empty({
        minimum: 5,
        maximum: 10,
        multipleOf: 2
      });
      validateBaseType({
        value: true,
        schema: schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });
  });
});
