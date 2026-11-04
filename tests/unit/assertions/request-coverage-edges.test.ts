import type { OpenAPIV3 } from 'openapi-types';
import { describe, expect, it } from 'vitest';
import { assertRequestMatchesOpenApi } from '../../../src/assertions/assertRequestMatchesOpenApi.js';
import { coerceHeaderValue } from '../../../src/core/coercion.js';
import { deserializeQueryParameters } from '../../../src/core/deserialize.js';
import { ValidationContext } from '../../../src/core/ValidationContext.js';
import {
  getRequestContract,
  type ResolvedParameter
} from '../../../src/openapi/router.js';
import { DocumentBuilder } from '../../helpers/DocumentBuilder.js';

const fixturePath = 'tests/fixtures/e2e/requests-openapi.yaml';

describe('assertRequestMatchesOpenApi & core - edge case branch coverage', () => {
  it('throws an error when neither path, url, nor request is provided', async () => {
    const input = {
      specPath: fixturePath
    } as unknown as Parameters<typeof assertRequestMatchesOpenApi>[0];

    const action = assertRequestMatchesOpenApi(input);

    await expect(action).rejects.toThrow(
      'Either path, url, or request must be provided to assertRequestMatchesOpenApi'
    );
  });

  it('defaults method to GET when method is omitted and request object has no method', async () => {
    const input = {
      specPath: fixturePath,
      req: { url: '/users/me' }
    };

    const action = assertRequestMatchesOpenApi(input);

    await expect(action).resolves.toBeUndefined();
  });

  it('handles request object when headers is undefined', async () => {
    const input = {
      specPath: fixturePath,
      req: {
        url: '/users/me',
        method: 'GET'
      }
    };

    const action = assertRequestMatchesOpenApi(input);

    await expect(action).resolves.toBeUndefined();
  });

  it('handles request object when headers is not an iterable or plain object', async () => {
    const input = {
      specPath: fixturePath,
      req: {
        url: '/users/me',
        method: 'GET',
        headers: 123 as unknown as Record<string, string>
      }
    };

    const action = assertRequestMatchesOpenApi(input);

    await expect(action).resolves.toBeUndefined();
  });

  it('handles request object when cloned.text is not a function', async () => {
    const input = {
      specPath: fixturePath,
      req: {
        url: '/users/me',
        method: 'GET',
        clone: () => ({}) as unknown as Request
      }
    };

    const action = assertRequestMatchesOpenApi(input);

    await expect(action).resolves.toBeUndefined();
  });

  it('handles request object having neither clone nor body', async () => {
    const input = {
      specPath: fixturePath,
      req: {
        url: '/users/me',
        method: 'GET'
      }
    };

    const action = assertRequestMatchesOpenApi(input);

    await expect(action).resolves.toBeUndefined();
  });

  it('appends 3 or more repeated query parameters into an array', async () => {
    const input = {
      specPath: fixturePath,
      url: 'https://api.example.com/api/v1/plants?tags=red&tags=green&tags=blue',
      method: 'GET'
    };

    const action = assertRequestMatchesOpenApi(input);

    await expect(action).resolves.toBeUndefined();
  });

  it('handles query string without leading question mark in normalizeExplicitQuery', async () => {
    const input = {
      specPath: fixturePath,
      path: '/api/v1/plants',
      method: 'GET',
      query: 'tags=red&tags=green'
    };

    const action = assertRequestMatchesOpenApi(input);

    await expect(action).resolves.toBeUndefined();
  });

  it('handles non-plain-object and non-string query input gracefully', async () => {
    const input = {
      specPath: fixturePath,
      path: '/users/me',
      method: 'GET',
      query: 123 as unknown as Record<string, unknown>
    };

    const action = assertRequestMatchesOpenApi(input);

    await expect(action).resolves.toBeUndefined();
  });

  it('extracts content-type from headers when contentType is omitted', async () => {
    const input = {
      specPath: fixturePath,
      path: '/users',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { name: 'Ada' }
    };

    const action = assertRequestMatchesOpenApi(input);

    await expect(action).resolves.toBeUndefined();
  });

  it('handles non-string content-type header gracefully', async () => {
    const input = {
      specPath: fixturePath,
      path: '/users/me',
      method: 'GET',
      headers: { 'content-type': ['application/json'] as unknown as string }
    };

    const action = assertRequestMatchesOpenApi(input);

    await expect(action).resolves.toBeUndefined();
  });

  it('reconstructs nested query when intermediate segment already exists as plain object', () => {
    const queryInput = 'filter[category][eq]=organic&filter[category][in]=herbs';
    const ctx = new ValidationContext();
    const declaredParameters: ResolvedParameter[] = [
      {
        name: 'filter',
        in: 'query',
        required: false,
        schema: { type: 'object' },
        style: 'deepObject',
        explode: true
      }
    ];

    const result = deserializeQueryParameters({
      declaredParameters,
      queryInput,
      ctx
    });

    expect(result).toEqual({
      filter: {
        category: {
          eq: 'organic',
          in: 'herbs'
        }
      }
    });
  });

  it.each([
    ['empty string', ''],
    ['question mark', '?']
  ])('returns empty object when queryInput is %s', (_label, queryInput) => {
    const ctx = new ValidationContext();

    const result = deserializeQueryParameters({
      declaredParameters: [],
      queryInput,
      ctx
    });

    expect(result).toEqual({});
  });

  it('handles URLSearchParams instance in deserializeQueryParameters', () => {
    const ctx = new ValidationContext();
    const searchParams = new URLSearchParams('page=2');

    const result = deserializeQueryParameters({
      declaredParameters: [],
      queryInput: searchParams,
      ctx
    });

    expect(result).toEqual({ page: '2' });
  });

  it('handles non-string non-object queryInput in deserializeQueryParameters', () => {
    const ctx = new ValidationContext();

    const result = deserializeQueryParameters({
      declaredParameters: [],
      queryInput: 456 as unknown as Record<string, unknown>,
      ctx
    });

    expect(result).toEqual({});
  });

  it('handles malformed bracket parameter without root key in deserializeQueryParameters', () => {
    const ctx = new ValidationContext();

    deserializeQueryParameters({
      declaredParameters: [],
      queryInput: { '[invalid]': 'val' },
      ctx
    });

    expect(ctx.hasErrors()).toBe(true);
    expect(ctx.errors[0]?.path).toBe('query');
    expect(ctx.errors[0]?.message).toContain(
      "Malformed bracket syntax in query parameter '[invalid]'"
    );
  });

  it('passes pre-structured plain object value through in deserializeQueryParameters', () => {
    const ctx = new ValidationContext();
    const queryInput = {
      filter: { family: 'solanaceae' }
    };

    const result = deserializeQueryParameters({
      declaredParameters: [],
      queryInput,
      ctx
    });

    expect(result).toEqual({
      filter: { family: 'solanaceae' }
    });
  });

  it('accumulates repeated flat keys in deserializeQueryParameters', () => {
    const ctx = new ValidationContext();
    const queryInput = 'tag=a&tag=b&tag=c';

    const result = deserializeQueryParameters({
      declaredParameters: [],
      queryInput,
      ctx
    });

    expect(result).toEqual({
      tag: ['a', 'b', 'c']
    });
  });

  it('throws an error when requestBody in getRequestContract is an unresolved ReferenceObject', () => {
    const spec: OpenAPIV3.Document = new DocumentBuilder()
      .withPaths({
        '/items': {
          post: {
            requestBody: { $ref: '#/components/requestBodies/Unresolved' },
            responses: { '200': { description: 'ok' } }
          }
        }
      })
      .build();

    expect(() =>
      getRequestContract({
        spec,
        path: '/items',
        method: 'POST',
        contentType: 'application/json'
      })
    ).toThrow(/unresolved \$ref/i);
  });

  it('coerces properties governed by an additionalProperties schema', () => {
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      additionalProperties: { type: 'integer' }
    };
    const payload = { dynamicKey: '42' };

    const result = coerceHeaderValue({
      value: payload,
      schema
    });

    expect(result).toEqual({ dynamicKey: 42 });
  });
});
