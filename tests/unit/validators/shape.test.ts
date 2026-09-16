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
      ['oneOf', schemaMother.oneOf([schemaMother.string()])],
      ['not', schemaMother.not(schemaMother.string())],
      // We test $ref as it is handled defensively by shouldStopOnNullValue
      [
        '$ref',
        {
          ...schemaMother.empty(),
          $ref: '#/components/schemas/User'
        } as unknown as OpenAPIV3.SchemaObject
      ]
    ])(
      'should reject null values for open schemas with "%s" constraint',
      (_, schema) => {
        const payload = null;

        validateShape({
          value: payload,
          schema,
          ctx,
          validateShape: vi.fn()
        });

        assertHasValidationError(
          ctx,
          'Field is not nullable but received null'
        );
      }
    );
  });
});
