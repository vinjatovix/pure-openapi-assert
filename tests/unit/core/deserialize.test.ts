import type { OpenAPIV3 } from 'openapi-types';
import { describe, expect, it } from 'vitest';
import { deserializeParameter } from '../../../src/core/deserialize.js';

const arraySchema: OpenAPIV3.SchemaObject = {
  type: 'array',
  items: { type: 'string' }
};
const objectSchema: OpenAPIV3.SchemaObject = { type: 'object' };
const scalarSchema: OpenAPIV3.SchemaObject = { type: 'string' };

describe('core/deserialize - style/explode matrix', () => {
  describe('query arrays', () => {
    it('form (explode=false) splits on comma', () => {
      expect(
        deserializeParameter({
          location: 'query',
          style: 'form',
          explode: false,
          schema: arraySchema,
          value: 'a,b,c'
        })
      ).toEqual(['a', 'b', 'c']);
    });

    it('spaceDelimited splits on space', () => {
      expect(
        deserializeParameter({
          location: 'query',
          style: 'spaceDelimited',
          explode: false,
          schema: arraySchema,
          value: 'a b c'
        })
      ).toEqual(['a', 'b', 'c']);
    });

    it('pipeDelimited splits on pipe', () => {
      expect(
        deserializeParameter({
          location: 'query',
          style: 'pipeDelimited',
          explode: false,
          schema: arraySchema,
          value: 'a|b|c'
        })
      ).toEqual(['a', 'b', 'c']);
    });

    it('form explode=true passes an already-exploded array through', () => {
      expect(
        deserializeParameter({
          location: 'query',
          style: 'form',
          explode: true,
          schema: arraySchema,
          value: ['a', 'b']
        })
      ).toEqual(['a', 'b']);
    });
  });

  describe('query objects', () => {
    it('form explode=true parses k=v segments', () => {
      expect(
        deserializeParameter({
          location: 'query',
          style: 'form',
          explode: true,
          schema: objectSchema,
          value: 'r=100,g=200'
        })
      ).toEqual({ r: '100', g: '200' });
    });

    it('deepObject passes an already-structured object through', () => {
      expect(
        deserializeParameter({
          location: 'query',
          style: 'deepObject',
          explode: true,
          schema: objectSchema,
          value: { role: 'admin' }
        })
      ).toEqual({ role: 'admin' });
    });

    it('form explode=false parses flat key,value pairs', () => {
      expect(
        deserializeParameter({
          location: 'query',
          style: 'form',
          explode: false,
          schema: objectSchema,
          value: 'r,100,g,200'
        })
      ).toEqual({ r: '100', g: '200' });
    });
  });

  describe('path', () => {
    it('simple scalar is returned unchanged', () => {
      expect(
        deserializeParameter({
          location: 'path',
          style: 'simple',
          explode: false,
          schema: scalarSchema,
          value: '42'
        })
      ).toBe('42');
    });

    it('simple array splits on comma', () => {
      expect(
        deserializeParameter({
          location: 'path',
          style: 'simple',
          explode: false,
          schema: arraySchema,
          value: 'a,b'
        })
      ).toEqual(['a', 'b']);
    });

    it('label array explode=true splits on dot', () => {
      expect(
        deserializeParameter({
          location: 'path',
          style: 'label',
          explode: true,
          schema: arraySchema,
          value: '.a.b'
        })
      ).toEqual(['a', 'b']);
    });

    it('label array explode=false splits on comma after dot prefix', () => {
      expect(
        deserializeParameter({
          location: 'path',
          style: 'label',
          explode: false,
          schema: arraySchema,
          value: '.a,b'
        })
      ).toEqual(['a', 'b']);
    });

    it('matrix array explode=false strips ;name= and splits on comma', () => {
      expect(
        deserializeParameter({
          location: 'path',
          style: 'matrix',
          explode: false,
          schema: arraySchema,
          value: ';id=a,b'
        })
      ).toEqual(['a', 'b']);
    });

    it('matrix array explode=true takes values of repeated segments', () => {
      expect(
        deserializeParameter({
          location: 'path',
          style: 'matrix',
          explode: true,
          schema: arraySchema,
          value: ';id=a;id=b'
        })
      ).toEqual(['a', 'b']);
    });

    it('simple object explode=false parses flat pairs', () => {
      expect(
        deserializeParameter({
          location: 'path',
          style: 'simple',
          explode: false,
          schema: objectSchema,
          value: 'r,100,g,200'
        })
      ).toEqual({ r: '100', g: '200' });
    });

    it('label object explode=true parses k=v segments', () => {
      expect(
        deserializeParameter({
          location: 'path',
          style: 'label',
          explode: true,
          schema: objectSchema,
          value: '.r=100.g=200'
        })
      ).toEqual({ r: '100', g: '200' });
    });

    it('matrix object explode=true parses ;k=v segments', () => {
      expect(
        deserializeParameter({
          location: 'path',
          style: 'matrix',
          explode: true,
          schema: objectSchema,
          value: ';r=100;g=200'
        })
      ).toEqual({ r: '100', g: '200' });
    });

    it('matrix object explode=false parses flat pairs after ;name=', () => {
      expect(
        deserializeParameter({
          location: 'path',
          style: 'matrix',
          explode: false,
          schema: objectSchema,
          value: ';id=r,100,g,200'
        })
      ).toEqual({ r: '100', g: '200' });
    });
  });

  describe('header', () => {
    it('simple scalar returned unchanged', () => {
      expect(
        deserializeParameter({
          location: 'header',
          style: 'simple',
          explode: false,
          schema: scalarSchema,
          value: 'acme'
        })
      ).toBe('acme');
    });

    it('simple array splits on comma', () => {
      expect(
        deserializeParameter({
          location: 'header',
          style: 'simple',
          explode: false,
          schema: arraySchema,
          value: 'a,b'
        })
      ).toEqual(['a', 'b']);
    });

    it('simple object explode=true parses k=v segments', () => {
      expect(
        deserializeParameter({
          location: 'header',
          style: 'simple',
          explode: true,
          schema: objectSchema,
          value: 'r=100,g=200'
        })
      ).toEqual({ r: '100', g: '200' });
    });
  });

  describe('prefix-tolerant and malformed inputs', () => {
    it('label array without a leading dot still splits', () => {
      expect(
        deserializeParameter({
          location: 'path',
          style: 'label',
          explode: true,
          schema: arraySchema,
          value: 'a.b'
        })
      ).toEqual(['a', 'b']);
    });

    it('matrix array without a leading semicolon still splits after =', () => {
      expect(
        deserializeParameter({
          location: 'path',
          style: 'matrix',
          explode: false,
          schema: arraySchema,
          value: 'id=a,b'
        })
      ).toEqual(['a', 'b']);
    });

    it('matrix array explode=true without a leading semicolon', () => {
      expect(
        deserializeParameter({
          location: 'path',
          style: 'matrix',
          explode: true,
          schema: arraySchema,
          value: 'id=a'
        })
      ).toEqual(['a']);
    });

    it('matrix array explode=true returns raw segments lacking an equals sign', () => {
      expect(
        deserializeParameter({
          location: 'path',
          style: 'matrix',
          explode: true,
          schema: arraySchema,
          value: ';a;b'
        })
      ).toEqual(['a', 'b']);
    });

    it('object parsing skips key=value segments without an equals sign', () => {
      expect(
        deserializeParameter({
          location: 'query',
          style: 'form',
          explode: true,
          schema: objectSchema,
          value: 'r=1,bad'
        })
      ).toEqual({ r: '1' });
    });

    it('object flat-pair parsing ignores a trailing unpaired key', () => {
      expect(
        deserializeParameter({
          location: 'query',
          style: 'form',
          explode: false,
          schema: objectSchema,
          value: 'r,1,g'
        })
      ).toEqual({ r: '1' });
    });
  });

  describe('fallback delimiter', () => {
    it('falls back to comma for an array style without a dedicated delimiter', () => {
      expect(
        deserializeParameter({
          location: 'query',
          style: 'deepObject',
          explode: false,
          schema: arraySchema,
          value: 'a,b'
        })
      ).toEqual(['a', 'b']);
    });
  });

  describe('non-string, non-array inputs', () => {
    it('returns an array-typed non-string value unchanged', () => {
      expect(
        deserializeParameter({
          location: 'query',
          style: 'form',
          explode: false,
          schema: arraySchema,
          value: 5
        })
      ).toBe(5);
    });

    it('returns an object-typed non-string value unchanged', () => {
      expect(
        deserializeParameter({
          location: 'query',
          style: 'form',
          explode: false,
          schema: objectSchema,
          value: 5
        })
      ).toBe(5);
    });

    it('returns a scalar array value unchanged', () => {
      expect(
        deserializeParameter({
          location: 'query',
          style: 'form',
          explode: false,
          schema: scalarSchema,
          value: ['a']
        })
      ).toEqual(['a']);
    });
  });
});
