import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assertResponseMatchesOpenAPI } from '../../../src/assertions/assertResponseMatchesOpenAPI.js';
import * as loader from '../../../src/openapi/loader.js';
import type { OpenAPIV3 } from 'openapi-types';

vi.mock('../../../src/openapi/loader.js', () => {
  return {
    loadSpec: vi.fn()
  };
});

describe('assertResponseMatchesOpenAPI - Header $ref Validation (Unit)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should throw an error when a header spec itself is an unresolved $ref', async () => {
    const mockSpec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/test-ref': {
          get: {
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
                    schema: { type: 'object' }
                  }
                }
              }
            }
          }
        }
      }
    };

    vi.mocked(loader.loadSpec).mockResolvedValueOnce(mockSpec);

    await expect(
      assertResponseMatchesOpenAPI({
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
    const mockSpec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/test-ref': {
          get: {
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
                    schema: { type: 'object' }
                  }
                }
              }
            }
          }
        }
      }
    };

    vi.mocked(loader.loadSpec).mockResolvedValueOnce(mockSpec);

    await expect(
      assertResponseMatchesOpenAPI({
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
    const mockSpec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/test-headers': {
          get: {
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
                  'application/json': { schema: { type: 'object' } }
                }
              }
            }
          }
        }
      }
    };

    vi.mocked(loader.loadSpec).mockResolvedValueOnce(mockSpec);

    await expect(
      assertResponseMatchesOpenAPI({
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
    const mockSpec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/test-large-header': {
          get: {
            responses: {
              '200': {
                description: 'OK',
                headers: {
                  'X-Large-Int': {
                    schema: {
                      type: 'integer',
                      minimum: 9007199254740990n as unknown as number
                    }
                  }
                },
                content: {
                  'application/json': {
                    schema: { type: 'object' }
                  }
                }
              }
            }
          }
        }
      }
    };

    vi.mocked(loader.loadSpec).mockResolvedValueOnce(mockSpec);

    await expect(
      assertResponseMatchesOpenAPI({
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
    const mockSpec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/test-large-header-fail': {
          get: {
            responses: {
              '200': {
                description: 'OK',
                headers: {
                  'X-Large-Int': {
                    schema: {
                      type: 'integer',
                      minimum: 9007199254740995n as unknown as number
                    }
                  }
                },
                content: {
                  'application/json': {
                    schema: { type: 'object' }
                  }
                }
              }
            }
          }
        }
      }
    };

    vi.mocked(loader.loadSpec).mockResolvedValueOnce(mockSpec);

    await expect(
      assertResponseMatchesOpenAPI({
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
    const mockSpec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/test-large-float-header': {
          get: {
            responses: {
              '200': {
                description: 'OK',
                headers: {
                  'X-Large-Float': {
                    schema: {
                      type: 'integer'
                    }
                  }
                },
                content: {
                  'application/json': {
                    schema: { type: 'object' }
                  }
                }
              }
            }
          }
        }
      }
    };

    vi.mocked(loader.loadSpec).mockResolvedValueOnce(mockSpec);

    await expect(
      assertResponseMatchesOpenAPI({
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
      const mockSpec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/test-no-content': {
            get: {
              responses: {
                '204': {
                  description: 'No Content'
                }
              }
            }
          }
        }
      };

      vi.mocked(loader.loadSpec).mockResolvedValueOnce(mockSpec);

      await expect(
        assertResponseMatchesOpenAPI({
          specPath: 'dummy-path.yaml',
          path: '/test-no-content',
          method: 'GET',
          status: 204,
          body: []
        })
      ).rejects.toThrow('204 must have empty body');
    });

    it('should succeed validation when undefined/null is passed to a route declared without schema/content', async () => {
      const mockSpec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/test-no-content': {
            get: {
              responses: {
                '204': {
                  description: 'No Content'
                }
              }
            }
          }
        }
      };

      vi.mocked(loader.loadSpec).mockResolvedValueOnce(mockSpec);

      await expect(
        assertResponseMatchesOpenAPI({
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
      const mockSpec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/test-content-header': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  headers: {
                    'X-Content-Int': {
                      content: {
                        'text/plain': {
                          schema: { type: 'integer' }
                        }
                      }
                    }
                  },
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      vi.mocked(loader.loadSpec).mockResolvedValueOnce(mockSpec);

      await expect(
        assertResponseMatchesOpenAPI({
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
