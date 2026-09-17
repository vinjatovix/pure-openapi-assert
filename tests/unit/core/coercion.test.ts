import { DocumentBuilder } from '../../helpers/DocumentBuilder.js';
import { contextMother } from '../../helpers/contextMother.js';
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
import { schemaMother } from '../../helpers/schemaMother.js';

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
      const result = coerceIntegerString('invalid');

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
      const schema = schemaMother.string();
      const tracker = new CycleTracker();

      const result = coerceArray({ value: 'val', schema, tracker });

      expect(result).toBe('val');
    });

    it('handles arrays of values passed directly to coerceArray', () => {
      const schema = schemaMother.array({ items: schemaMother.integer() });
      const tracker = new CycleTracker();

      const result = coerceArray({ value: [123, '456'], schema, tracker });

      expect(result).toEqual([123, 456]);
    });

    it('returns the value unchanged if it is not an array or a string', () => {
      const schema = schemaMother.array({ items: schemaMother.integer() });
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
      const circularSchema = schemaMother.object();
      circularSchema.properties = { self: circularSchema };
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
      const schema = schemaMother.integer();

      const result = coerceHeaderValue({ value: '1.0000000000000001', schema });

      expect(result).toBe('1.0000000000000001');
    });

    it('successfully coerces exact integers (e.g. 1.0)', () => {
      const schema = schemaMother.integer();

      const result = coerceHeaderValue({ value: '1.0', schema });

      expect(result).toBe(1);
    });

    it('does not coerce high-precision floats into number type to prevent silent precision loss', () => {
      const schema = schemaMother.number();

      const result = coerceHeaderValue({ value: '1.0000000000000001', schema });

      expect(result).toBe('1.0000000000000001');
    });

    it('successfully coerces integers formatted in scientific notation with negative exponents', () => {
      const schema = schemaMother.integer();

      const result = coerceHeaderValue({ value: '100.0e-1', schema });

      expect(result).toBe(10);
    });

    it('successfully coerces integers with fractional significands but positive exponents', () => {
      const schema = schemaMother.integer();

      const result = coerceHeaderValue({ value: '100.5e1', schema });

      expect(result).toBe(1005);
    });

    it('does not coerce non-integer scientific notation floats under integer schemas', () => {
      const schema = schemaMother.integer();

      const result = coerceHeaderValue({ value: '10.5e-1', schema });

      expect(result).toBe('10.5e-1');
    });

    it('respects sibling constraints in oneOf/anyOf dry-runs', () => {
      const schema = schemaMother.empty({
        allOf: [{ minimum: 10 }],
        oneOf: [schemaMother.integer(), schemaMother.string({ enum: ['3'] })]
      });

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
        const mockSpec = new DocumentBuilder().withSchema('TargetInt', schemaMother.integer()).build();
        const schema = schemaMother.oneOf([{ $ref: '#/components/schemas/TargetInt' }]);
        const ctx = new ValidationContext({ spec: mockSpec });

        const result = coerceHeaderValue({ value: '42', schema, ctx });

        expect(result).toBe(42);
        expect(ctx.hasErrors()).toBe(false);
      });

      it('throws or records error for unresolved refs inside compositions', () => {
        const mockSpec = new DocumentBuilder().build();
        const schema = schemaMother.allOf([{ $ref: '#/components/schemas/NonExistent' }]);
        const ctx = new ValidationContext({ spec: mockSpec });

        coerceHeaderValue({ value: 'val', schema, ctx });

        expect(ctx.hasErrors()).toBe(true);
        expect(ctx.errors[0]?.message).toContain('Unresolved $ref');
      });
    });

    describe('Mixed Schema Coercion', () => {
      it('coerces both root type and composition sequentially', () => {
        const schema = schemaMother.array({
          items: schemaMother.empty(),
          oneOf: [
            schemaMother.array({
              items: schemaMother.integer()
            })
          ]
        });

        const result = coerceHeaderValue({ value: '1,2,3', schema });

        expect(result).toEqual([1, 2, 3]);
      });
    });

    describe('Negated Schema Coercion Isolation', () => {
      it('should isolate coercion within the not schema and prevent leakage to outer type-constrained scopes', () => {
        const schema = schemaMother.string({
          allOf: [{ minLength: 1 }],
          not: schemaMother.integer()
        });

        const result = coerceHeaderValue({ value: '123', schema });

        expect(result).toBe('123');
      });

      it('should still allow coercion for untyped outer schemas', () => {
        const schema = {
          not: schemaMother.integer()
        };

        const result = coerceHeaderValue({ value: '123', schema });

        expect(result).toBe(123);
      });

      it('should preserve and not overwrite a selected composition candidate when applying negation isolation', () => {
        const schema = schemaMother.oneOf(
          [schemaMother.integer(), schemaMother.string()],
          { not: schemaMother.integer() }
        );

        const result = coerceHeaderValue({ value: '123', schema });

        expect(result).toBe('123');
      });

      it('should trigger composed coercion and negation isolation when a base type and a not clause are combined', () => {
        const schemaWithBaseAndNot = schemaMother.array({
          items: {},
          not: schemaMother.array({ items: schemaMother.integer() })
        });

        const coercedIntegerArray = coerceHeaderValue({
          value: '1,2,3',
          schema: schemaWithBaseAndNot
        });

        expect(coercedIntegerArray).toEqual([1, 2, 3]);
      });

      it('should preserve and not overwrite a selected composition candidate when applying negation isolation on nested allOf compositions', () => {
        const nestedPolymorphicSchemaWithNot = schemaMother.allOf(
          [schemaMother.oneOf([schemaMother.integer(), schemaMother.string()])],
          { not: schemaMother.integer() }
        );

        const coercedResult = coerceHeaderValue({
          value: '123',
          schema: nestedPolymorphicSchemaWithNot
        });

        expect(coercedResult).toBe('123');
      });
    });
  });

  describe('normalizeHeaders', () => {
    it('handles undefined input gracefully', () => {
      const result = normalizeHeaders(undefined);

      expect(result).toEqual({});
    });
  });

  describe('Additional coverage edge cases', () => {
    it('should skip nested unresolved ref inside not schema during negation isolation (T012)', () => {
      const schema = schemaMother.string({
        not: { $ref: '#/components/schemas/Invalid' }
      });
      const ctx = contextMother.empty();

      const result = coerceHeaderValue({ value: '123', schema, ctx });

      expect(result).toBe('123');
    });

    it('should handle falsy schemas in polymorphic recursion checks (T013)', () => {
      const schema = schemaMother.allOf([undefined] as unknown as OpenAPIV3.SchemaObject[]);

      const result = coerceHeaderValue({ value: '123', schema });

      expect(result).toBe('123');
    });

    it('should return the original value in coerceHeaderValue if the schema resolves to falsy (T014)', () => {
      const schema = { $ref: '#/invalid' };
      const ctx = contextMother.empty();

      const result = coerceHeaderValue({ value: '123', schema, ctx });

      expect(result).toBe('123');
    });

    it('should correctly coerce polymorphic items inside arrays instead of validating items against the array boundary schema (T015)', () => {
      const schema = schemaMother.array({
        items: schemaMother.oneOf([schemaMother.integer(), schemaMother.string()])
      });

      const result = coerceHeaderValue({
        value: ['123', 'abc'],
        schema
      });

      expect(result).toEqual([123, 'abc']);
    });
  });
});

describe('core/coercion optimizations', () => {
  it.each([
    {
      description:
        'should coerce correctly using oneOf header without relying on arrays allocations',
      schema: { oneOf: [schemaMother.number()] },
      value: '42',
      expected: 42
    },
    {
      description:
        'should coerce correctly using anyOf header without relying on arrays allocations',
      schema: { anyOf: [{ type: 'boolean' as const }] },
      value: 'true',
      expected: true
    }
  ])('$description', ({ schema, value, expected }) => {
    const ctx = contextMother.empty();

    const result = coerceHeaderValue({ value, schema, ctx });

    expect(result).toBe(expected);
  });

  describe('Coercion Isolation Leakage in allOf combined with not', () => {
    it('should not mutate and return the correct coerced value when using allOf with not', () => {
      const schema = schemaMother.allOf([
        schemaMother.oneOf([schemaMother.integer(), schemaMother.string()]),
        schemaMother.not(schemaMother.boolean())
      ]);
      const ctx = contextMother.empty();

      const result = coerceHeaderValue({
        value: 'true',
        schema,
        ctx
      });

      expect(result).toBe('true');
    });
  });

  describe('Inferred Array Coercion', () => {
    it('should coerce array items when type: array is omitted but items is present', () => {
      const schema = schemaMother.empty({
        items: schemaMother.integer()
      });
      const ctx = contextMother.empty();

      const result = coerceHeaderValue({
        value: ['1', '2'],
        schema,
        ctx
      });

      expect(result).toEqual([1, 2]);
    });
  });
});
