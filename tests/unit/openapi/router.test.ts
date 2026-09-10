import { describe, it, expect } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';
import { matchPath, getResponseSchema } from '../../../src/openapi/router.js';

describe('router.ts unit tests', () => {
  describe('matchPath', () => {
    it('should handle null or undefined spec gracefully', () => {
      expect(
        matchPath(null as unknown as OpenAPIV3.Document, '/users')
      ).toBeNull();
      expect(
        matchPath(undefined as unknown as OpenAPIV3.Document, '/users')
      ).toBeNull();
    });

    it('should handle spec without paths property gracefully', () => {
      expect(
        matchPath({} as unknown as OpenAPIV3.Document, '/users')
      ).toBeNull();
      expect(
        matchPath(
          {
            info: { title: 'Test', version: '1.0.0' }
          } as unknown as OpenAPIV3.Document,
          '/users'
        )
      ).toBeNull();
    });

    it('should match exact path', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/users': {}
        }
      } as unknown as OpenAPIV3.Document;
      expect(matchPath(spec, '/users')).toBe('/users');
      expect(matchPath(spec, '/users/')).toBe('/users');
    });

    it('should match dynamic path with parameters', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/users/{id}': {}
        }
      } as unknown as OpenAPIV3.Document;
      expect(matchPath(spec, '/users/123')).toBe('/users/{id}');
    });

    it('should return null when path does not match', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/users': {}
        }
      } as unknown as OpenAPIV3.Document;
      expect(matchPath(spec, '/posts')).toBeNull();
    });
  });

  describe('getResponseSchema', () => {
    it('should throw error when path is not matched', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/users': {}
        }
      } as unknown as OpenAPIV3.Document;
      expect(() => getResponseSchema(spec, '/posts', 'GET', 200)).toThrow(
        'Path not found in OpenAPI: /posts'
      );
    });
  });
});
