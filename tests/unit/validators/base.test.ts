import { describe, it, expect, beforeEach } from 'vitest';
import { validateShape } from '../../../src/validators/shape.js';
import {
  validateTypeCheck,
  validateEnum,
  validateConst,
  validateBaseType
} from '../../../src/validators/types.js';

import {
  assertValid,
  assertHasValidationError
} from '../../helpers/assertions.js';
import { contextMother } from '../../helpers/contextMother.js';
import { SchemaBuilder } from '../../helpers/SchemaBuilder.js';
import { schemaMother } from '../../helpers/schemaMother.js';

describe('Validators base/core (Unit)', () => {
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
  });

  describe('validateShape base validation requirements', () => {
    it('should throw error when non-nullable field receives null', () => {
      validateShape({
        value: null,
        schema: new SchemaBuilder().type('string').nullable(false).build(),
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Field is not nullable but received null');
    });

    it('should throw error when validateShape receives undefined directly', () => {
      validateShape({
        value: undefined,
        schema: schemaMother.string(),
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Field is required but received undefined');
    });

    it('should not crash or resolve prototype properties as format validators', () => {
      validateShape({
        value: 'some-value',
        schema: new SchemaBuilder()
          .type('string')
          .format('hasOwnProperty')
          .build(),
        ctx,
        validateShape
      });

      assertValid(ctx);
    });

    it('should ignore custom formats that match prototype properties if not defined on customFormats', () => {
      validateShape({
        value: 'some-value',
        schema: new SchemaBuilder().type('string').format('toString').build(),
        ctx,
        validateShape,
        customFormats: {}
      });

      assertValid(ctx);
    });
  });

  describe('validateEnum & validateConst', () => {
    it('validateEnum should cache and validate correctly', () => {
      const schema = new SchemaBuilder()
        .type('string')
        .enum(['admin', 'user'])
        .build();

      validateEnum({
        value: 'guest',
        schema,
        ctx,
        validateShape
      });

      assertHasValidationError(ctx, 'Expected one of [admin, user]');
    });

    it('validateConst should use strict identity checking', () => {
      const schema = new SchemaBuilder().type('number').const(42).build();
      validateConst({
        value: 42,
        schema,
        ctx,
        validateShape
      });

      assertValid(ctx);
    });
  });

  describe('Fallback handling and edge-case boundaries', () => {
    it('should bypass numeric constraint validations when the value is neither a number nor an int64 string', () => {
      validateBaseType({
        value: true,
        schema: new SchemaBuilder()
          .minimum(5)
          .maximum(10)
          .multipleOf(2)
          .build(),
        ctx,
        validateShape
      });

      assertValid(ctx);
    });
  });
});
