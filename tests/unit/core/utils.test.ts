import { describe, expect, it } from 'vitest';
import {
  isJson,
  isPlainObject,
  isPrimitive,
  isSchemaObject,
  isTextContentType,
  normalizeMediaType,
  safeStringify
} from '../../../src/core/utils.js';

describe('core/utils', () => {
  describe('isPlainObject', () => {
    it.each([
      { value: {}, expected: true },
      { value: { a: 1 }, expected: true }
    ])(
      'should return true for valid plain object: $value',
      ({ value, expected }) => {
        const result = isPlainObject(value);

        expect(result).toBe(expected);
      }
    );

    it.each([
      { value: null, name: 'null' },
      { value: undefined, name: 'undefined' },
      { value: [], name: 'empty array' },
      { value: [1, 2], name: 'array with elements' },
      { value: 'string', name: 'string' },
      { value: 123, name: 'number' },
      { value: true, name: 'boolean' },
      { value: new Date(), name: 'Date' },
      { value: /abc/, name: 'RegExp' },
      { value: new Map(), name: 'Map' },
      { value: new Set(), name: 'Set' }
    ])('should return false for invalid plain object: $name', ({ value }) => {
      const result = isPlainObject(value);

      expect(result).toBe(false);
    });
  });

  describe('isPrimitive', () => {
    it.each([
      { value: 'string', name: 'string' },
      { value: 123, name: 'number' },
      { value: false, name: 'false' },
      { value: true, name: 'true' }
    ])('should return true for primitive: $name', ({ value }) => {
      const result = isPrimitive(value);

      expect(result).toBe(true);
    });

    it.each([
      { value: {}, name: 'object' },
      { value: [], name: 'array' },
      { value: null, name: 'null' },
      { value: undefined, name: 'undefined' }
    ])('should return false for non-primitive: $name', ({ value }) => {
      const result = isPrimitive(value);

      expect(result).toBe(false);
    });
  });

  describe('isSchemaObject', () => {
    it.each([
      { value: { type: 'string' }, name: 'object with type' },
      { value: {}, name: 'empty object' }
    ])('should return true for SchemaObject: $name', ({ value }) => {
      const result = isSchemaObject(value);

      expect(result).toBe(true);
    });

    it('should return false for reference (object with $ref)', () => {
      const value = { $ref: '#/components/schemas/Pet' };

      const result = isSchemaObject(value);

      expect(result).toBe(false);
    });

    it.each([
      { value: 'not-an-object', name: 'string' },
      { value: [], name: 'array' },
      { value: null, name: 'null' }
    ])('should return false for non-object: $name', ({ value }) => {
      const result = isSchemaObject(value);

      expect(result).toBe(false);
    });
  });

  describe('normalizeMediaType', () => {
    it.each([
      {
        input: 'application/JSON; charset=utf-8',
        expected: 'application/json'
      },
      { input: 'TEXT/html', expected: 'text/html' }
    ])(
      'should strip parameters and convert to lowercase: $input',
      ({ input, expected }) => {
        const result = normalizeMediaType(input);

        expect(result).toBe(expected);
      }
    );

    it.each([
      { input: '', expected: '' },
      { input: ';charset=utf-8', expected: '' }
    ])(
      'should handle empty or malformed inputs safely: $input',
      ({ input, expected }) => {
        const result = normalizeMediaType(input);

        expect(result).toBe(expected);
      }
    );
  });

  describe('isJson', () => {
    it.each([
      'application/json',
      'application/json; charset=utf-8',
      'application/vnd.api+json',
      'application/ld+json',
      'APPLICATION/JSON'
    ])('should return true for JSON format: %s', (input) => {
      const result = isJson(input);

      expect(result).toBe(true);
    });

    it.each(['text/plain', 'application/xml', 'image/png'])(
      'should return false for non-JSON format: %s',
      (input) => {
        const result = isJson(input);

        expect(result).toBe(false);
      }
    );
  });

  describe('isTextContentType', () => {
    it.each([
      'text/html',
      'text/plain; charset=utf-8',
      'application/xml',
      'application/xhtml+xml',
      'application/csv'
    ])('should return true for text payload format: %s', (input) => {
      const result = isTextContentType(input);

      expect(result).toBe(true);
    });

    it.each(['application/json', 'image/png', 'application/octet-stream'])(
      'should return false for non-text payload format: %s',
      (input) => {
        const result = isTextContentType(input);

        expect(result).toBe(false);
      }
    );
  });

  describe('safeStringify', () => {
    it('should stringify standard JS values normally', () => {
      const value = { a: 1, b: 'test' };

      const result = safeStringify(value);

      expect(result).toBe('{"a":1,"b":"test"}');
    });

    it.each([
      { value: 123n, expected: '123' },
      { value: { x: 123n }, expected: '{"x":"123"}' }
    ])('should stringify BigInts properly: $value', ({ value, expected }) => {
      const result = safeStringify(value);

      expect(result).toBe(expected);
    });
  });
});
