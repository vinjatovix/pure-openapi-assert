import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assertResponseMatchesOpenAPI } from '../../../src/assertions/assertResponseMatchesOpenAPI.js';
import * as loader from '../../../src/openapi/loader.js';
import type { OpenAPIV3 } from 'openapi-types';

// Mock the loader to return our custom spec with unresolved refs
vi.mock('../../../src/openapi/loader.js', () => {
  return {
    loadSpec: vi.fn()
  };
});

describe('assertResponseMatchesOpenAPI - Header $ref Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  describe('Header Edge Cases and Branch Coverage', () => {
    it('should normalize and concatenate duplicate headers containing arrays', async () => {
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
                    'X-Duplicate': {
                      schema: {
                        type: 'array',
                        items: { type: 'string' }
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
            'X-Duplicate': 'first',
            'x-duplicate': ['second', 'third']
          }
        })
      ).resolves.not.toThrow();
    });

    it('should ignore coercion and pass non-string/non-boolean values in coerceBoolean', async () => {
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
                    'X-Bool': {
                      schema: { type: 'boolean' }
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
            'X-Bool': { not: 'a-bool' } as unknown as string
          }
        })
      ).rejects.toThrow('Expected boolean, received object');
    });

    it('should ignore coercion and pass non-string/non-array values in coerceArray', async () => {
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
                    'X-Array': {
                      schema: {
                        type: 'array',
                        items: { type: 'integer' }
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
            'X-Array': { not: 'an-array' } as unknown as string[]
          }
        })
      ).rejects.toThrow('Expected array, received object');
    });

    it('should return the original value when an array is passed to a non-array schema', async () => {
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
                    'X-String': {
                      schema: { type: 'string' }
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
            'X-String': ['one', 'two']
          }
        })
      ).rejects.toThrow('Expected string, received object');
    });

    it('should ignore mediaTypeObjects that lack a schema', async () => {
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
                    'X-No-Schema': {
                      content: {
                        'application/json': {}
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
            'X-No-Schema': '{"foo": "bar"}'
          }
        })
      ).resolves.not.toThrow();
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

    it('should extract first element if array is passed to mediaTypeObject JSON validation', async () => {
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
                    'X-JSON': {
                      content: {
                        'application/json': {
                          schema: {
                            type: 'object',
                            required: ['foo'],
                            properties: { foo: { type: 'string' } }
                          }
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
            'X-JSON': ['{"foo": "bar"}']
          }
        })
      ).resolves.not.toThrow();
    });

    it('should ignore header validations when neither schema nor content is present', async () => {
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
                    'X-Empty': {}
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
            'X-Empty': 'some-value'
          }
        })
      ).resolves.not.toThrow();
    });

    it('should pass for 204 No Content with inferred Content-Type response header', async () => {
      const mockSpec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/test-204': {
            post: {
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
          path: '/test-204',
          method: 'POST',
          status: 204,
          body: undefined,
          headers: {
            'content-type': 'application/json'
          }
        })
      ).resolves.not.toThrow();
    });
  });
});
