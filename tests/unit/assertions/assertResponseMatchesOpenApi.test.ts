import { DocumentBuilder } from '../../helpers/DocumentBuilder.js';
import { schemaMother } from '../../helpers/schemaMother.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assertResponseMatchesOpenApi } from '../../../src/assertions/assertResponseMatchesOpenApi.js';
import * as loader from '../../../src/openapi/loader.js';

vi.mock('../../../src/openapi/loader.js', () => {
  return {
    loadSpec: vi.fn()
  };
});

describe('assertResponseMatchesOpenApi - Header $ref Validation (Unit)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should throw an error when a header spec itself is an unresolved $ref', async () => {
    const mockSpec = new DocumentBuilder()
      .withPath('/test-ref', 'get', {
        responses: {
          '200': {
            description: 'OK',
            headers: {
              'X-Unresolved-Header': {
                $ref: '#/components/headers/SomeHeader'
              }
            },
            content: {
              'application/json': {
                schema: schemaMother.object()
              }
            }
          }
        }
      })
      .build();

    vi.mocked(loader.loadSpec).mockResolvedValueOnce(mockSpec);

    await expect(
      assertResponseMatchesOpenApi({
        specPath: 'dummy-path.yaml',
        path: '/test-ref',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Unresolved-Header': 'some-value'
        }
      })
    ).rejects.toThrow(
      "Header 'X-Unresolved-Header' contains an unresolved $ref. Ensure your OpenAPI spec is fully dereferenced."
    );
  });

  it('should throw an error when a header schema is an unresolved $ref', async () => {
    const mockSpec = new DocumentBuilder()
      .withPath('/test-ref', 'get', {
        responses: {
          '200': {
            description: 'OK',
            headers: {
              'X-Unresolved-Schema': {
                schema: {
                  $ref: '#/components/schemas/SomeSchema'
                }
              }
            },
            content: {
              'application/json': {
                schema: schemaMother.object()
              }
            }
          }
        }
      })
      .build();

    vi.mocked(loader.loadSpec).mockResolvedValueOnce(mockSpec);

    await expect(
      assertResponseMatchesOpenApi({
        specPath: 'dummy-path.yaml',
        path: '/test-ref',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Unresolved-Schema': 'some-value'
        }
      })
    ).rejects.toThrow(
      "Schema for header 'X-Unresolved-Schema' contains an unresolved $ref. Ensure your OpenAPI spec is fully dereferenced."
    );
  });

  it('should fail when a mediaTypeObject contains an unresolved $ref schema', async () => {
    const mockSpec = new DocumentBuilder()
      .withPath('/test-headers', 'get', {
        responses: {
          '200': {
            description: 'OK',
            headers: {
              'X-Ref-Header': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/SomeSchema' }
                  }
                }
              }
            },
            content: {
              'application/json': { schema: schemaMother.object() }
            }
          }
        }
      })
      .build();

    vi.mocked(loader.loadSpec).mockResolvedValueOnce(mockSpec);

    await expect(
      assertResponseMatchesOpenApi({
        specPath: 'dummy-path.yaml',
        path: '/test-headers',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Ref-Header': '{"foo": "bar"}'
        }
      })
    ).rejects.toThrow('contains an unresolved $ref');
  });

  it('should coerce large numeric header without precision loss into BigInt (Strict Precision)', async () => {
    const mockSpec = new DocumentBuilder()
      .withPath('/test-large-header', 'get', {
        responses: {
          '200': {
            description: 'OK',
            headers: {
              'X-Large-Int': {
                schema: schemaMother.integer({
                  minimum: 9007199254740990n as unknown as number
                })
              }
            },
            content: {
              'application/json': {
                schema: schemaMother.object()
              }
            }
          }
        }
      })
      .build();

    vi.mocked(loader.loadSpec).mockResolvedValueOnce(mockSpec);

    await expect(
      assertResponseMatchesOpenApi({
        specPath: 'dummy-path.yaml',
        path: '/test-large-header',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Large-Int': '9007199254740993'
        }
      })
    ).resolves.not.toThrow();
  });

  it('should fail with large numeric header violating minimum constraint (Strict Precision)', async () => {
    const mockSpec = new DocumentBuilder()
      .withPath('/test-large-header-fail', 'get', {
        responses: {
          '200': {
            description: 'OK',
            headers: {
              'X-Large-Int': {
                schema: schemaMother.integer({
                  minimum: 9007199254740995n as unknown as number
                })
              }
            },
            content: {
              'application/json': {
                schema: schemaMother.object()
              }
            }
          }
        }
      })
      .build();

    vi.mocked(loader.loadSpec).mockResolvedValueOnce(mockSpec);

    await expect(
      assertResponseMatchesOpenApi({
        specPath: 'dummy-path.yaml',
        path: '/test-large-header-fail',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Large-Int': '9007199254740993'
        }
      })
    ).rejects.toThrow(
      'Value 9007199254740993 is less than minimum 9007199254740995'
    );
  });

  it('should fail validation when a large float header is evaluated against an integer schema (Strict Precision)', async () => {
    const mockSpec = new DocumentBuilder()
      .withPath('/test-large-float-header', 'get', {
        responses: {
          '200': {
            description: 'OK',
            headers: {
              'X-Large-Float': {
                schema: schemaMother.integer()
              }
            },
            content: {
              'application/json': {
                schema: schemaMother.object()
              }
            }
          }
        }
      })
      .build();

    vi.mocked(loader.loadSpec).mockResolvedValueOnce(mockSpec);

    await expect(
      assertResponseMatchesOpenApi({
        specPath: 'dummy-path.yaml',
        path: '/test-large-float-header',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Large-Float': '9007199254740993.5'
        }
      })
    ).rejects.toThrow('Expected integer, received string');
  });

  describe('isResponseBodyEmpty with empty arrays', () => {
    it('should fail validation when an empty array [] is passed to a route declared without schema/content', async () => {
      const mockSpec = new DocumentBuilder()
        .withPath('/test-no-content', 'get', {
          responses: {
            '204': {
              description: 'No Content'
            }
          }
        })
        .build();

      vi.mocked(loader.loadSpec).mockResolvedValueOnce(mockSpec);

      await expect(
        assertResponseMatchesOpenApi({
          specPath: 'dummy-path.yaml',
          path: '/test-no-content',
          method: 'GET',
          status: 204,
          body: []
        })
      ).rejects.toThrow('204 must have empty body');
    });

    it('should succeed validation when undefined/null is passed to a route declared without schema/content', async () => {
      const mockSpec = new DocumentBuilder()
        .withPath('/test-no-content', 'get', {
          responses: {
            '204': {
              description: 'No Content'
            }
          }
        })
        .build();

      vi.mocked(loader.loadSpec).mockResolvedValueOnce(mockSpec);

      await expect(
        assertResponseMatchesOpenApi({
          specPath: 'dummy-path.yaml',
          path: '/test-no-content',
          method: 'GET',
          status: 204,
          body: undefined
        })
      ).resolves.not.toThrow();
    });
  });

  describe('content-backed header coercion', () => {
    it('should coerce string values to match the target schema under content-backed headers (e.g., text/plain with integer)', async () => {
      const mockSpec = new DocumentBuilder()
        .withPath('/test-content-header', 'get', {
          responses: {
            '200': {
              description: 'OK',
              headers: {
                'X-Content-Int': {
                  content: {
                    'text/plain': {
                      schema: schemaMother.integer()
                    }
                  }
                }
              },
              content: {
                'application/json': {
                  schema: schemaMother.object()
                }
              }
            }
          }
        })
        .build();

      vi.mocked(loader.loadSpec).mockResolvedValueOnce(mockSpec);

      await expect(
        assertResponseMatchesOpenApi({
          specPath: 'dummy-path.yaml',
          path: '/test-content-header',
          method: 'GET',
          status: 200,
          body: {},
          headers: {
            'X-Content-Int': '42'
          }
        })
      ).resolves.not.toThrow();
    });
  });
});
