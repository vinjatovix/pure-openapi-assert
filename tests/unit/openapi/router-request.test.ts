import { describe, expect, it } from 'vitest';
import { getRequestContract } from '../../../src/openapi/router.js';
import { loadSpec } from '../../../src/openapi/loader.js';
import { DocumentBuilder } from '../../helpers/DocumentBuilder.js';

const fixturePath = 'tests/fixtures/e2e/requests-openapi.yaml';

describe('openapi/router - getRequestContract', () => {
  it('matches an operation by path + method', async () => {
    const spec = await loadSpec(fixturePath);
    const contract = getRequestContract({
      spec,
      path: '/users',
      method: 'post',
      contentType: 'application/json'
    });

    expect(contract.operation).toBeDefined();
    expect(contract.bodyRequired).toBe(true);
    expect(contract.hasRequestBody).toBe(true);
    expect(contract.bodySchema?.type).toBe('object');
  });

  it('resolves bodySchema by RFC 7231 normalized media type (charset ignored)', async () => {
    const spec = await loadSpec(fixturePath);
    const contract = getRequestContract({
      spec,
      path: '/users',
      method: 'post',
      contentType: 'application/json; charset=utf-8'
    });

    expect(contract.matchedContentType).toBe('application/json');
    expect(contract.bodySchema).not.toBeNull();
  });

  it('reads bodyRequired from requestBody.required', async () => {
    const spec = await loadSpec(fixturePath);
    const contract = getRequestContract({
      spec,
      path: '/users',
      method: 'get',
      contentType: 'application/json'
    });

    expect(contract.bodyRequired).toBe(false);
    expect(contract.hasRequestBody).toBe(true);
  });

  it('combines pathItem + operation parameters deduped with operation precedence', () => {
    const spec = new DocumentBuilder()
      .withPaths({
        '/x': {
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: false,
              schema: { type: 'string' }
            }
          ],
          get: {
            parameters: [
              {
                name: 'q',
                in: 'query',
                required: true,
                schema: { type: 'integer' }
              }
            ],
            responses: { '200': { description: 'ok' } }
          }
        }
      })
      .build();

    const contract = getRequestContract({
      spec,
      path: '/x',
      method: 'get',
      contentType: 'application/json'
    });

    expect(contract.parameters).toHaveLength(1);
    const [param] = contract.parameters;
    expect(param?.required).toBe(true);
    expect(param?.schema.type).toBe('integer');
  });

  it('forces required=true and default style/explode for path params', () => {
    const spec = new DocumentBuilder()
      .withPaths({
        '/items/{id}': {
          get: {
            parameters: [
              { name: 'id', in: 'path', schema: { type: 'integer' } }
            ],
            responses: { '200': { description: 'ok' } }
          }
        }
      })
      .build();

    const contract = getRequestContract({
      spec,
      path: '/items/{id}',
      method: 'get',
      contentType: 'application/json'
    });

    const [param] = contract.parameters;
    expect(param?.required).toBe(true);
    expect(param?.style).toBe('simple');
    expect(param?.explode).toBe(false);
    expect(contract.templatePathParamNames).toEqual(['id']);
  });

  it('applies query form default with explode=true', () => {
    const spec = new DocumentBuilder()
      .withPaths({
        '/q': {
          get: {
            parameters: [
              { name: 'tags', in: 'query', schema: { type: 'string' } }
            ],
            responses: { '200': { description: 'ok' } }
          }
        }
      })
      .build();

    const contract = getRequestContract({
      spec,
      path: '/q',
      method: 'get',
      contentType: 'application/json'
    });

    const [param] = contract.parameters;
    expect(param?.style).toBe('form');
    expect(param?.explode).toBe(true);
  });

  it('throws an explicit error for a non-existent path', async () => {
    const spec = await loadSpec(fixturePath);
    expect(() =>
      getRequestContract({
        spec,
        path: '/does-not-exist',
        method: 'get',
        contentType: 'application/json'
      })
    ).toThrow(/Path not found/i);
  });

  it('throws an explicit error for a non-existent method', async () => {
    const spec = await loadSpec(fixturePath);
    expect(() =>
      getRequestContract({
        spec,
        path: '/users',
        method: 'delete',
        contentType: 'application/json'
      })
    ).toThrow(/Operation not found/i);
  });

  it('throws when a parameter is an unresolved $ref', () => {
    const spec = new DocumentBuilder()
      .withPaths({
        '/r': {
          get: {
            parameters: [{ $ref: '#/components/parameters/Foo' }],
            responses: { '200': { description: 'ok' } }
          }
        }
      })
      .build();

    expect(() =>
      getRequestContract({
        spec,
        path: '/r',
        method: 'get',
        contentType: 'application/json'
      })
    ).toThrow(/unresolved \$ref/i);
  });

  it('uses a permissive empty schema when a parameter declares none', () => {
    const spec = new DocumentBuilder()
      .withPaths({
        '/noschema': {
          get: {
            parameters: [{ name: 'q', in: 'query' }],
            responses: { '200': { description: 'ok' } }
          }
        }
      })
      .build();

    const contract = getRequestContract({
      spec,
      path: '/noschema',
      method: 'get',
      contentType: 'application/json'
    });

    expect(contract.parameters[0]?.schema).toEqual({});
  });

  it('throws when a parameter schema is an unresolved $ref', () => {
    const spec = new DocumentBuilder()
      .withPaths({
        '/schemaref': {
          get: {
            parameters: [{ name: 'q', in: 'query', schema: { $ref: '#/x' } }],
            responses: { '200': { description: 'ok' } }
          }
        }
      })
      .build();

    expect(() =>
      getRequestContract({
        spec,
        path: '/schemaref',
        method: 'get',
        contentType: 'application/json'
      })
    ).toThrow(/unresolved \$ref/i);
  });

  it('ignores parameters in unsupported locations (e.g. cookie)', () => {
    const spec = new DocumentBuilder()
      .withPaths({
        '/cookie': {
          get: {
            parameters: [
              { name: 'sid', in: 'cookie', schema: { type: 'string' } }
            ],
            responses: { '200': { description: 'ok' } }
          }
        }
      })
      .build();

    const contract = getRequestContract({
      spec,
      path: '/cookie',
      method: 'get',
      contentType: 'application/json'
    });

    expect(contract.parameters).toHaveLength(0);
  });

  it('returns no body schema when requestBody declares empty content', () => {
    const spec = new DocumentBuilder()
      .withPaths({
        '/emptybody': {
          post: {
            requestBody: { required: true, content: {} },
            responses: { '200': { description: 'ok' } }
          }
        }
      })
      .build();

    const contract = getRequestContract({
      spec,
      path: '/emptybody',
      method: 'post',
      contentType: 'application/json'
    });

    expect(contract.hasRequestBody).toBe(true);
    expect(contract.bodySchema).toBeNull();
    expect(contract.matchedContentType).toBeNull();
  });

  it('throws when the request Content-Type is not declared', async () => {
    const spec = await loadSpec(fixturePath);
    expect(() =>
      getRequestContract({
        spec,
        path: '/users',
        method: 'post',
        contentType: 'application/xml'
      })
    ).toThrow(/not declared/i);
  });
});
