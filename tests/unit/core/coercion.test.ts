import { describe, it, expect } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';
import {
  parseCSVHeader,
  coerceIntegerString,
  losslessReplace,
  parseJSONLossless,
  coerceArray,
  coerceHeaderValue,
  normalizeHeaders,
  BIGINT_PREFIX
} from '../../../src/core/coercion.js';
import { CycleTracker } from '../../../src/core/CycleTracker.js';
import { ValidationContext } from '../../../src/core/ValidationContext.js';

describe('coercion utility unit tests', () => {
  describe('parseCSVHeader', () => {
    it('handles nested quotes and escaped characters', () => {
      const result = parseCSVHeader('a, "b, \\"c\\"", d');

      expect(result).toEqual(['a', 'b, "c"', 'd']);
    });

    it.each([
      { input: '" a "', expected: [' a '] },
      { input: '  " a ", " b "  ', expected: [' a ', ' b '] }
    ])(
      'retains spaces explicitly inside quotes for $input',
      ({ input, expected }) => {
        const result = parseCSVHeader(input);

        expect(result).toEqual(expected);
      }
    );
  });

  describe('coerceIntegerString', () => {
    it('returns undefined for an invalid integer string', () => {
      const result = coerceIntegerString('invalid', 'original');

      expect(result).toBeUndefined();
    });
  });

  describe('parseJSONLossless', () => {
    it.each([
      { input: '123', expected: 123 },
      { input: '9007199254740993', expected: 9007199254740993n }
    ])(
      'successfully parses valid JSON integer/bigint: $input',
      ({ input, expected }) => {
        const result = parseJSONLossless(input);

        expect(result).toBe(expected);
      }
    );

    it.each(['05', '00000000009007199254740993'])(
      'throws SyntaxError for integer with leading zero: %s',
      (input) => {
        expect(() => parseJSONLossless(input)).toThrow(SyntaxError);
      }
    );

    it('preserves unsafe float numbers as strings to prevent silent rounding/precision loss', () => {
      const result = parseJSONLossless('9007199254740993.5');

      expect(result).toBe('9007199254740993.5');
    });

    it('preserves small rounding-prone float numbers near 1.0 as strings to prevent silent rounding/precision loss', () => {
      const result = parseJSONLossless('1.0000000000000001');

      expect(result).toBe('1.0000000000000001');
    });

    it('escapes and restores user strings starting with BIGINT_PREFIX', () => {
      const payload = JSON.stringify(`${BIGINT_PREFIX}123`);

      const result = parseJSONLossless(payload);

      expect(result).toBe(`${BIGINT_PREFIX}123`);
    });
  });

  describe('losslessReplace', () => {
    it('handles quotes and escape characters correctly', () => {
      const result = losslessReplace('{"text": "hello \\"world\\""}');

      expect(result).toBe('{"text": "hello \\"world\\""}');
    });
  });

  describe('coerceArray', () => {
    it('returns original value if schema is not an array type', () => {
      const schema: OpenAPIV3.SchemaObject = { type: 'string' };
      const tracker = new CycleTracker();

      const result = coerceArray({ value: 'val', schema, tracker });

      expect(result).toBe('val');
    });

    it('handles arrays of values passed directly to coerceArray', () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: 'array',
        items: { type: 'integer' }
      };
      const tracker = new CycleTracker();

      const result = coerceArray({ value: [123, '456'], schema, tracker });

      expect(result).toEqual([123, 456]);
    });

    it('returns the value unchanged if it is not an array or a string', () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: 'array',
        items: { type: 'integer' }
      };
      const tracker = new CycleTracker();

      const result = coerceArray({ value: true, schema, tracker });

      expect(result).toBe(true);
    });
  });

  describe('coerceHeaderValue', () => {
    it('returns original value if no schema is provided', () => {
      const result = coerceHeaderValue({ value: 'val', schema: undefined });

      expect(result).toBe('val');
    });

    it('returns original value if cycle is detected', () => {
      const circularSchema: OpenAPIV3.SchemaObject = {
        type: 'object',
        properties: {}
      };
      circularSchema.properties!.self = circularSchema;
      const tracker = new CycleTracker();

      let result: unknown;
      tracker.track(circularSchema, () => {
        result = coerceHeaderValue({
          value: 'val',
          schema: circularSchema,
          tracker
        });
        return 'dummy';
      });

      expect(result).toBe('val');
    });

    it('does not coerce non-integer floats with safe integer rounding (e.g. 1.0000000000000001)', () => {
      const schema: OpenAPIV3.SchemaObject = { type: 'integer' };

      const result = coerceHeaderValue({ value: '1.0000000000000001', schema });

      expect(result).toBe('1.0000000000000001');
    });

    it('successfully coerces exact integers (e.g. 1.0)', () => {
      const schema: OpenAPIV3.SchemaObject = { type: 'integer' };

      const result = coerceHeaderValue({ value: '1.0', schema });

      expect(result).toBe(1);
    });

    it('does not coerce high-precision floats into number type to prevent silent precision loss', () => {
      const schema: OpenAPIV3.SchemaObject = { type: 'number' };

      const result = coerceHeaderValue({ value: '1.0000000000000001', schema });

      expect(result).toBe('1.0000000000000001');
    });

    it('successfully coerces integers formatted in scientific notation with negative exponents', () => {
      const schema: OpenAPIV3.SchemaObject = { type: 'integer' };

      const result = coerceHeaderValue({ value: '100.0e-1', schema });

      expect(result).toBe(10);
    });

    it('successfully coerces integers with fractional significands but positive exponents', () => {
      const schema: OpenAPIV3.SchemaObject = { type: 'integer' };

      const result = coerceHeaderValue({ value: '100.5e1', schema });

      expect(result).toBe(1005);
    });

    it('does not coerce non-integer scientific notation floats under integer schemas', () => {
      const schema: OpenAPIV3.SchemaObject = { type: 'integer' };

      const result = coerceHeaderValue({ value: '10.5e-1', schema });

      expect(result).toBe('10.5e-1');
    });

    it('respects sibling constraints in oneOf/anyOf dry-runs', () => {
      const schema: OpenAPIV3.SchemaObject = {
        allOf: [{ minimum: 10 }],
        oneOf: [{ type: 'integer' }, { type: 'string', enum: ['3'] }]
      };

      const result = coerceHeaderValue({ value: '3', schema });

      expect(result).toBe('3');
    });

    describe('BigInt key restoration', () => {
      it('restores keys starting with BIGINT_PREFIX so they are not permanently corrupted', () => {
        const payload = `{"${BIGINT_PREFIX}_id": 9007199254740993}`;

        const parsed = parseJSONLossless(payload) as Record<string, unknown>;

        expect(parsed).toBeDefined();
        const firstKey = Object.keys(parsed)[0];
        expect(firstKey).toBe(`${BIGINT_PREFIX}_id`);
        expect(parsed[`${BIGINT_PREFIX}_id`]).toBe(9007199254740993n);
      });
    });

    describe('Strict reference resolution in compositions', () => {
      it('resolves valid pointers inside compositions', () => {
        const mockSpec: OpenAPIV3.Document = {
          openapi: '3.0.0',
          info: { title: 'Test', version: '1.0.0' },
          paths: {},
          components: {
            schemas: {
              TargetInt: { type: 'integer' }
            }
          }
        };
        const schema: OpenAPIV3.SchemaObject = {
          oneOf: [{ $ref: '#/components/schemas/TargetInt' }]
        };
        const ctx = new ValidationContext(mockSpec);

        const result = coerceHeaderValue({ value: '42', schema, ctx });

        expect(result).toBe(42);
        expect(ctx.hasErrors()).toBe(false);
      });

      it('throws or records error for unresolved refs inside compositions', () => {
        const mockSpec: OpenAPIV3.Document = {
          openapi: '3.0.0',
          info: { title: 'Test', version: '1.0.0' },
          paths: {}
        };
        const schema: OpenAPIV3.SchemaObject = {
          allOf: [{ $ref: '#/components/schemas/NonExistent' }]
        };
        const ctx = new ValidationContext(mockSpec);

        coerceHeaderValue({ value: 'val', schema, ctx });

        expect(ctx.hasErrors()).toBe(true);
        expect(ctx.errors[0]?.message).toContain('Unresolved $ref');
      });
    });

    describe('Mixed Schema Coercion', () => {
      it('coerces both root type and composition sequentially', () => {
        const schema: OpenAPIV3.SchemaObject = {
          type: 'array',
          items: {},
          oneOf: [
            {
              type: 'array',
              items: { type: 'integer' }
            }
          ]
        };

        const result = coerceHeaderValue({ value: '1,2,3', schema });

        expect(result).toEqual([1, 2, 3]);
      });
    });

    describe('Negated Schema Coercion Isolation', () => {
      it('should isolate coercion within the not schema and prevent leakage to outer type-constrained scopes', () => {
        const schema: OpenAPIV3.SchemaObject = {
          type: 'string',
          allOf: [{ minLength: 1 }],
          not: { type: 'integer' }
        };

        const result = coerceHeaderValue({ value: '123', schema });

        expect(result).toBe('123');
      });

      it('should still allow coercion for untyped outer schemas', () => {
        const schema: OpenAPIV3.SchemaObject = {
          not: { type: 'integer' }
        };

        const result = coerceHeaderValue({ value: '123', schema });

        expect(result).toBe(123);
      });

      it('should preserve and not overwrite a selected composition candidate when applying negation isolation', () => {
        const schema: OpenAPIV3.SchemaObject = {
          oneOf: [{ type: 'integer' }, { type: 'string' }],
          not: { type: 'integer' }
        };

        const result = coerceHeaderValue({ value: '123', schema });

        expect(result).toBe('123');
      });
    });
  });

  describe('normalizeHeaders', () => {
    it('handles undefined input gracefully', () => {
      const result = normalizeHeaders(undefined);

      expect(result).toEqual({});
    });
  });
});
