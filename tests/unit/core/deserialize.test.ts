import type { OpenAPIV3 } from 'openapi-types';
import { describe, expect, it } from 'vitest';
import {
  deserializeParameter,
  deserializeQueryParameters,
  parseBracketKey
} from '../../../src/core/deserialize.js';
import { ValidationContext } from '../../../src/core/ValidationContext.js';
import type { ResolvedParameter } from '../../../src/openapi/router.js';

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

describe('core/deserialize - parseBracketKey', () => {
  it('parses single-level bracket key', () => {
    const rawKey = 'filter[status]';

    const result = parseBracketKey(rawKey);

    expect(result).toEqual({ rootKey: 'filter', segments: ['status'] });
  });

  it('parses multi-level bracket key', () => {
    const rawKey = 'filter[category][eq]';

    const result = parseBracketKey(rawKey);

    expect(result).toEqual({
      rootKey: 'filter',
      segments: ['category', 'eq']
    });
  });

  it('parses empty array brackets', () => {
    const rawKey = 'items[]';

    const result = parseBracketKey(rawKey);

    expect(result).toEqual({ rootKey: 'items', segments: [''] });
  });

  it('parses indexed array brackets', () => {
    const rawKey = 'items[0]';

    const result = parseBracketKey(rawKey);

    expect(result).toEqual({ rootKey: 'items', segments: ['0'] });
  });

  it.each([
    '__proto__[polluted]',
    'obj[__proto__]',
    'obj[constructor]',
    'obj[prototype]',
    'constructor[polluted]'
  ])('returns null to reject prototype pollution key: %s', (rawKey) => {
    const result = parseBracketKey(rawKey);

    expect(result).toBeNull();
  });

  it.each([
    'filter[a=b',
    'filter]=b',
    'filter[[a]]=b',
    'filter[a][',
    '[a]',
    'filter[a]b'
  ])('returns null on malformed bracket syntax: %s', (rawKey) => {
    const result = parseBracketKey(rawKey);

    expect(result).toBeNull();
  });

  it('returns null for non-bracket key', () => {
    const rawKey = 'page';

    const result = parseBracketKey(rawKey);

    expect(result).toBeNull();
  });
});

describe('core/deserialize - deserializeQueryParameters', () => {
  const declaredParameters: ResolvedParameter[] = [
    {
      name: 'filter',
      in: 'query',
      required: false,
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          category: {
            type: 'object',
            properties: { eq: { type: 'string' } }
          }
        }
      },
      style: 'deepObject',
      explode: true
    },
    {
      name: 'items',
      in: 'query',
      required: false,
      schema: {
        type: 'array',
        items: { type: 'string' }
      },
      style: 'form',
      explode: true
    }
  ];

  it('reconstructs nested objects from single and multi-level bracket keys', () => {
    const queryInput = 'filter[status]=active&filter[category][eq]=organic';
    const ctx = new ValidationContext();

    const result = deserializeQueryParameters({
      declaredParameters,
      queryInput,
      ctx
    });

    expect(result).toEqual({
      filter: {
        status: 'active',
        category: { eq: 'organic' }
      }
    });
    expect(ctx.hasErrors()).toBe(false);
  });

  it('reconstructs arrays for array-typed parameters using empty brackets', () => {
    const queryInput = 'items[]=a&items[]=b';
    const ctx = new ValidationContext();

    const result = deserializeQueryParameters({
      declaredParameters,
      queryInput,
      ctx
    });

    expect(result).toEqual({
      items: ['a', 'b']
    });
  });

  it('reconstructs arrays for array-typed parameters using indexed brackets', () => {
    const queryInput = 'items[0]=a&items[1]=b';
    const ctx = new ValidationContext();

    const result = deserializeQueryParameters({
      declaredParameters,
      queryInput,
      ctx
    });

    expect(result).toEqual({
      items: ['a', 'b']
    });
  });

  it('reports structured error when a scalar value is provided for an object-typed parameter', () => {
    const queryInput = 'filter=active';
    const ctx = new ValidationContext();

    deserializeQueryParameters({
      declaredParameters,
      queryInput,
      ctx
    });

    expect(ctx.hasErrors()).toBe(true);
    expect(ctx.errors[0]?.path).toBe('query.filter');
    expect(ctx.errors[0]?.message).toContain('Expected type object, received string');
  });

  it('reports structured error on malformed bracket syntax without throwing an exception', () => {
    const queryInput = { 'filter[a=b': 'active' };
    const ctx = new ValidationContext();

    deserializeQueryParameters({
      declaredParameters,
      queryInput,
      ctx
    });

    expect(ctx.hasErrors()).toBe(true);
    expect(ctx.errors[0]?.path).toBe('query.filter');
    expect(ctx.errors[0]?.message).toContain("Malformed bracket syntax in query parameter 'filter[a=b'");
  });

  it('protects against prototype pollution and does not pollute Object prototype', () => {
    const queryInput = '__proto__[polluted]=true&filter[constructor][polluted]=true';
    const ctx = new ValidationContext();

    deserializeQueryParameters({
      declaredParameters,
      queryInput,
      ctx
    });

    expect(Object.prototype).not.toHaveProperty('polluted');
  });
});

