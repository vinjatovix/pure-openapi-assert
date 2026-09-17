import { describe, it, beforeEach } from 'vitest';
import { validateShape } from '../../../src/validators/shape.js';
import { validateBaseType } from '../../../src/validators/type-validators.js';

import {
  assertValid,
  assertHasValidationError
} from '../../helpers/assertions.js';
import { contextMother } from '../../helpers/contextMother.js';
import { schemaMother } from '../../helpers/schemaMother.js';

describe('validators/string', () => {
  let ctx: ReturnType<typeof contextMother.empty>;

  beforeEach(() => {
    ctx = contextMother.empty();
  });

  describe('Robustness tests for string format (via validateBaseType)', () => {
    it('should fall back to default format registry when customFormats contains a non-function value', () => {
      const schema = schemaMother.string({ format: 'uuid' });
      validateBaseType({
        value: 'invalid-uuid',
        schema: schema,
        ctx,
        validateShape,
        customFormats: { uuid: true as unknown as (value: string) => boolean }
      });

      assertHasValidationError(ctx, "Expected string format 'uuid'");
    });

    it('should pass validation when value is valid and customFormats contains a non-function value', () => {
      const schema = schemaMother.string({ format: 'uuid' });
      validateBaseType({
        value: '123e4567-e89b-12d3-a456-426614174000',
        schema: schema,
        ctx,
        validateShape,
        customFormats: { uuid: true as unknown as (value: string) => boolean }
      });

      assertValid(ctx);
    });
  });
});
