import type { OpenAPIV3 } from 'openapi-types';
import { describe, expect, it } from 'vitest';
import { normalizeMediaType } from '../../../src/core/utils.js';
import { getResponseSchema } from '../../../src/openapi/router.js';
import { DocumentBuilder } from '../../helpers/DocumentBuilder.js';

interface GetTestSchemaOptions {
  spec: OpenAPIV3.Document;
  path?: string;
  status?: number;
  contentType?: string;
}

const getTestSchema = ({
  spec,
  path = '/test',
  status = 200,
  contentType
}: GetTestSchemaOptions) =>
  getResponseSchema({
    spec,
    path,
    method: 'GET',
    status,
    contentType
  });

describe('openapi/router', () => {
  describe('normalizeMediaType', () => {
    it('should strip parameters and convert to lowercase for JSON types', () => {
      const mediaType = 'application/JSON; charset=utf-8';

      const result = normalizeMediaType(mediaType);

      expect(result).toBe('application/json');
    });

    it('should convert HTML type to lowercase', () => {
      const mediaType = 'TEXT/html';

      const result = normalizeMediaType(mediaType);

      expect(result).toBe('text/html');
    });
  });

  describe('getResponseSchema - Indirect Media Type Matching', () => {
    function buildSpecWithMediaTypes(
      declaredTypes: string[]
    ): OpenAPIV3.Document {
      const content: Record<string, OpenAPIV3.MediaTypeObject> = {};
      for (const type of declaredTypes) {
        content[type] = { schema: { type: 'object' } };
      }

      return new DocumentBuilder()
        .withPaths({
          '/test': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  content
                }
              }
            }
          }
        })
        .build();
    }

    it('should match exact media type application/json', () => {
      const spec = buildSpecWithMediaTypes(['application/json']);

      const result = getTestSchema({ spec, contentType: 'application/json' });

      expect(result.matchedContentType).toBe('application/json');
    });

    it('should match exact media type application/xml', () => {
      const spec = buildSpecWithMediaTypes(['application/xml']);

      const result = getTestSchema({ spec, contentType: 'application/xml' });

      expect(result.matchedContentType).toBe('application/xml');
    });

    it('should fail when requested media type does not match declared media type', () => {
      const spec = buildSpecWithMediaTypes(['application/xml']);

      const action = () =>
        getTestSchema({ spec, contentType: 'application/json' });

      expect(action).toThrow(
        "Content-Type 'application/json' is not declared for GET /test 200. Declared: application/xml"
      );
    });

    it('should match PNG image against image/* wildcard', () => {
      const spec = buildSpecWithMediaTypes(['image/*']);

      const result = getTestSchema({ spec, contentType: 'image/png' });

      expect(result.matchedContentType).toBe('image/*');
    });

    it('should match JPEG image against image/* wildcard', () => {
      const spec = buildSpecWithMediaTypes(['image/*']);

      const result = getTestSchema({ spec, contentType: 'image/jpeg' });

      expect(result.matchedContentType).toBe('image/*');
    });

    it('should fail to match HTML text against image/* wildcard', () => {
      const spec = buildSpecWithMediaTypes(['image/*']);

      const action = () => getTestSchema({ spec, contentType: 'text/html' });

      expect(action).toThrow(
        "Content-Type 'text/html' is not declared for GET /test 200. Declared: image/*"
      );
    });

    it('should match vendor JSON against generic application/*+json wildcard', () => {
      const spec = buildSpecWithMediaTypes(['application/*+json']);

      const result = getTestSchema({
        spec,
        contentType: 'application/vnd.api+json'
      });

      expect(result.matchedContentType).toBe('application/*+json');
    });

    it('should fail to match exact JSON against generic application/*+json wildcard', () => {
      const spec = buildSpecWithMediaTypes(['application/*+json']);

      const action = () =>
        getTestSchema({ spec, contentType: 'application/json' });

      expect(action).toThrow(
        "Content-Type 'application/json' is not declared for GET /test 200. Declared: application/*+json"
      );
    });

    it('should match JSON against any media type wildcard */*', () => {
      const spec = buildSpecWithMediaTypes(['*/*']);

      const result = getTestSchema({ spec, contentType: 'application/json' });

      expect(result.matchedContentType).toBe('*/*');
    });

    it('should match XML against any media type wildcard */*', () => {
      const spec = buildSpecWithMediaTypes(['*/*']);

      const result = getTestSchema({ spec, contentType: 'application/xml' });

      expect(result.matchedContentType).toBe('*/*');
    });

    it('should match vendor JSON against declared application/json', () => {
      const spec = buildSpecWithMediaTypes(['application/json']);

      const result = getTestSchema({
        spec,
        contentType: 'application/vnd.api+json'
      });

      expect(result.matchedContentType).toBe('application/json');
    });

    it('should match plain JSON against declared vendor JSON', () => {
      const spec = buildSpecWithMediaTypes(['application/vnd.api+json']);

      const result = getTestSchema({ spec, contentType: 'application/json' });

      expect(result.matchedContentType).toBe('application/vnd.api+json');
    });
  });

  describe('getResponseSchema - Indirect Path Matching & Query Stripping', () => {
    it('should handle null spec gracefully by throwing path not found', () => {
      const spec = null as unknown as OpenAPIV3.Document;

      const action = () => getTestSchema({ spec, path: '/users' });

      expect(action).toThrow('Path not found in OpenAPI: /users');
    });

    it('should handle undefined spec gracefully by throwing path not found', () => {
      const spec = undefined as unknown as OpenAPIV3.Document;

      const action = () => getTestSchema({ spec, path: '/users' });

      expect(action).toThrow('Path not found in OpenAPI: /users');
    });

    it('should handle empty object spec gracefully by throwing path not found', () => {
      const spec = {} as unknown as OpenAPIV3.Document;

      const action = () => getTestSchema({ spec, path: '/users' });

      expect(action).toThrow('Path not found in OpenAPI: /users');
    });

    it('should handle spec without paths but with info gracefully by throwing path not found', () => {
      const spec = {
        info: { title: 'Test', version: '1.0.0' }
      } as unknown as OpenAPIV3.Document;

      const action = () => getTestSchema({ spec, path: '/users' });

      expect(action).toThrow('Path not found in OpenAPI: /users');
    });

    it('should match exact path without trailing slash', () => {
      const spec = new DocumentBuilder()
        .withPaths({
          '/users': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': { schema: { type: 'object' } }
                  }
                }
              }
            }
          }
        })
        .build();

      const result = getTestSchema({ spec, path: '/users' });

      expect(result).toBeDefined();
    });

    it('should match exact path with trailing slash on request', () => {
      const spec = new DocumentBuilder()
        .withPaths({
          '/users': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': { schema: { type: 'object' } }
                  }
                }
              }
            }
          }
        })
        .build();

      const result = getTestSchema({ spec, path: '/users/' });

      expect(result).toBeDefined();
    });

    it('should match dynamic path with parameters', () => {
      const spec = new DocumentBuilder()
        .withPaths({
          '/users/{id}': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': { schema: { type: 'object' } }
                  }
                }
              }
            }
          }
        })
        .build();

      const result = getTestSchema({ spec, path: '/users/123' });

      expect(result).toBeDefined();
    });

    it('should throw error when path is not matched', () => {
      const spec = new DocumentBuilder()
        .withPaths({
          '/users': {
            get: {
              responses: {
                '200': { description: 'OK' }
              }
            }
          }
        })
        .build();

      const action = () => getTestSchema({ spec, path: '/posts' });

      expect(action).toThrow('Path not found in OpenAPI: /posts');
    });

    it('should ignore query parameters when matching paths', () => {
      const spec = new DocumentBuilder()
        .withPaths({
          '/users': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': { schema: { type: 'object' } }
                  }
                }
              }
            }
          }
        })
        .build();

      const result = getTestSchema({
        spec,
        path: '/users?admin=true&limit=10'
      });

      expect(result).toBeDefined();
    });
  });

  describe('getResponseSchema - Specific Behaviors', () => {
    it('should throw when the response content is missing and contentType is provided', () => {
      const spec = new DocumentBuilder()
        .withPaths({
          '/users': {
            get: {
              responses: {
                '204': {
                  description: 'No Content'
                }
              }
            }
          }
        })
        .build();

      const action = () =>
        getTestSchema({
          spec,
          path: '/users',
          status: 204,
          contentType: 'application/json'
        });

      expect(action).toThrow(
        "Content-Type 'application/json' is not declared for GET /users 204. No content declared in OpenAPI spec."
      );
    });
  });
});
