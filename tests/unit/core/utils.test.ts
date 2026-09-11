import { describe, it, expect } from 'vitest';
import {
  isPlainObject,
  isPrimitive,
  isSchemaObject
} from '../../../src/core/utils.js';

describe('core/utils (Unit)', () => {
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
});
