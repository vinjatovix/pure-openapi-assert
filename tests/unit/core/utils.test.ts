import { describe, expect, it } from 'vitest';
import {
  isJson,
  isPlainObject,
  isPrimitive,
  isSchemaObject,
  isTextContentType,
  normalizeMediaType
} from '../../../src/core/utils.js';

describe('core/utils', () => {
  describe('isPlainObject', () => {
    it('should return true for valid plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1 })).toBe(true);
    });

    it('should return false for null, undefined, arrays and other types', () => {
      expect(isPlainObject(null)).toBe(false);
      expect(isPlainObject(undefined)).toBe(false);
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject([1, 2])).toBe(false);
      expect(isPlainObject('string')).toBe(false);
      expect(isPlainObject(123)).toBe(false);
      expect(isPlainObject(true)).toBe(false);
      expect(isPlainObject(new Date())).toBe(false);
      expect(isPlainObject(/abc/)).toBe(false);
      expect(isPlainObject(new Map())).toBe(false);
      expect(isPlainObject(new Set())).toBe(false);
    });
  });

  describe('isPrimitive', () => {
    it('should return true for string, number, and boolean', () => {
      expect(isPrimitive('string')).toBe(true);
      expect(isPrimitive(123)).toBe(true);
      expect(isPrimitive(false)).toBe(true);
      expect(isPrimitive(true)).toBe(true);
    });

    it('should return false for objects, arrays, null, and undefined', () => {
      expect(isPrimitive({})).toBe(false);
      expect(isPrimitive([])).toBe(false);
      expect(isPrimitive(null)).toBe(false);
      expect(isPrimitive(undefined)).toBe(false);
    });
  });

  describe('isSchemaObject', () => {
    it('should return true for SchemaObjects (objects without $ref)', () => {
      expect(isSchemaObject({ type: 'string' })).toBe(true);
      expect(isSchemaObject({})).toBe(true);
    });

    it('should return false for references (objects with $ref)', () => {
      expect(isSchemaObject({ $ref: '#/components/schemas/Pet' })).toBe(false);
    });

    it('should return false for non-objects', () => {
      expect(isSchemaObject('not-an-object')).toBe(false);
      expect(isSchemaObject([])).toBe(false);
      expect(isSchemaObject(null)).toBe(false);
    });
  });

  describe('normalizeMediaType', () => {
    it('should strip parameters and convert to lowercase', () => {
      expect(normalizeMediaType('application/JSON; charset=utf-8')).toBe(
        'application/json'
      );
      expect(normalizeMediaType('TEXT/html')).toBe('text/html');
    });

    it('should handle empty or malformed inputs safely', () => {
      expect(normalizeMediaType('')).toBe('');
      expect(normalizeMediaType(';charset=utf-8')).toBe('');
    });
  });

  describe('isJson', () => {
    it('should return true for application/json and suffix-based json formats', () => {
      expect(isJson('application/json')).toBe(true);
      expect(isJson('application/json; charset=utf-8')).toBe(true);
      expect(isJson('application/vnd.api+json')).toBe(true);
      expect(isJson('application/ld+json')).toBe(true);
      expect(isJson('APPLICATION/JSON')).toBe(true);
    });

    it('should return false for non-json formats', () => {
      expect(isJson('text/plain')).toBe(false);
      expect(isJson('application/xml')).toBe(false);
      expect(isJson('image/png')).toBe(false);
    });
  });

  describe('isTextContentType', () => {
    it('should return true for text and common text-based payloads', () => {
      expect(isTextContentType('text/html')).toBe(true);
      expect(isTextContentType('text/plain; charset=utf-8')).toBe(true);
      expect(isTextContentType('application/xml')).toBe(true);
      expect(isTextContentType('application/xhtml+xml')).toBe(true);
      expect(isTextContentType('application/csv')).toBe(true);
    });

    it('should return false for binary formats and json', () => {
      expect(isTextContentType('application/json')).toBe(false);
      expect(isTextContentType('image/png')).toBe(false);
      expect(isTextContentType('application/octet-stream')).toBe(false);
    });
  });
});
