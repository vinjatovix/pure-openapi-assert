import {
  describe,
  it,
  expect,
  vi,
  type MockInstance,
  beforeEach,
  afterEach
} from 'vitest';
import { assertResponseMatchesOpenAPI } from '../../src/index.js';

describe('assertResponseMatchesOpenAPI - Content-Type and Deprecations E2E', () => {
  const specPath = 'tests/fixtures/e2e/content-type.yaml';
  let warnSpy: MockInstance;

  const expectedWarning = (path: string, message: string) => {
    const YELLOW = '\x1b[33m';
    const RESET = '\x1b[0m';
    const pathStr = path ? ` [${path}]` : '';
    return `${YELLOW}[OpenAPI-Assert] ⚠️  Warning:${RESET}${pathStr} ${message}`;
  };

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('Content-Type Strict Matching', () => {
    it('should throw an error if contentType is not declared', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/content-type/xml',
          method: 'GET',
          status: 200,
          contentType: 'application/json',
          body: {}
        })
      ).rejects.toThrow(
        "Content-Type 'application/json' is not declared for GET /test/content-type/xml 200. Declared: application/xml"
      );
    });

    it('should support wildcard media types like image/*', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/content-type/wildcard',
          method: 'GET',
          status: 200,
          contentType: 'image/png',
          body: 'opaque-image-string'
        })
      ).rejects.toThrow(
        "Expected body to be a Buffer for binary Content-Type 'image/png', received string"
      );

      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/content-type/wildcard',
          method: 'GET',
          status: 200,
          contentType: 'image/png',
          body: Buffer.from('image-binary-data')
        })
      ).resolves.not.toThrow();
    });

    it('should support wildcard media types like application/*+json', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/content-type/wildcard',
          method: 'GET',
          status: 200,
          contentType: 'application/vnd.api+json',
          body: { status: 'success' }
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Non-JSON Short-circuit Validation', () => {
    it('should validate text content type as string and skip structural schema checks', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/content-type/xml',
          method: 'GET',
          status: 200,
          contentType: 'application/xml',
          body: '<response>ok</response>'
        })
      ).resolves.not.toThrow();

      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/content-type/xml',
          method: 'GET',
          status: 200,
          contentType: 'application/xml',
          body: { some: 'object' }
        })
      ).rejects.toThrow(
        "Expected body to be a string for Content-Type 'application/xml', received object"
      );
    });

    it('should validate binary content type as Buffer and skip structural schema checks', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/content-type/binary',
          method: 'GET',
          status: 200,
          contentType: 'application/octet-stream',
          body: Buffer.from([1, 2, 3])
        })
      ).resolves.not.toThrow();

      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/content-type/binary',
          method: 'GET',
          status: 200,
          contentType: 'application/octet-stream',
          body: 'not-a-buffer'
        })
      ).rejects.toThrow(
        "Expected body to be a Buffer for binary Content-Type 'application/octet-stream', received string"
      );
    });
  });

  describe('Deprecation Warnings Support', () => {
    it('should warn when a deprecated endpoint is consumed', async () => {
      await assertResponseMatchesOpenAPI({
        specPath,
        path: '/test/deprecated-route',
        method: 'GET',
        status: 200,
        body: { message: 'hello' }
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expectedWarning(
          '',
          "Endpoint 'GET /test/deprecated-route' is deprecated"
        )
      );
    });

    it('should warn when a schema property contains deprecated: true', async () => {
      await assertResponseMatchesOpenAPI({
        specPath,
        path: '/test/deprecated-property',
        method: 'GET',
        status: 200,
        body: {
          activeField: 'active',
          oldField: 'deprecated-value'
        }
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expectedWarning('body.oldField', 'Schema property is deprecated')
      );
    });

    it('should warn when a deprecated 204 endpoint is consumed with an empty body', async () => {
      await assertResponseMatchesOpenAPI({
        specPath,
        path: '/test/deprecated-no-content',
        method: 'GET',
        status: 204,
        body: undefined
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expectedWarning(
          '',
          "Endpoint 'GET /test/deprecated-no-content' is deprecated"
        )
      );
    });

    it('should throw an error when response content is an empty object', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/empty-content-map',
          method: 'GET',
          status: 200,
          body: { message: 'hello' }
        })
      ).rejects.toThrow(
        "Content-Type 'application/json' is not declared for GET /test/empty-content-map 200. No content declared in OpenAPI spec."
      );
    });
  });

  describe('HTTP 204 Early Validation', () => {
    const realPath = '/test/no-content';

    it('should pass if 204 status has an undefined body', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: realPath,
          method: 'GET',
          status: 204,
          body: undefined
        })
      ).resolves.not.toThrow();
    });

    it('should pass if 204 status has a null body', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: realPath,
          method: 'GET',
          status: 204,
          body: null
        })
      ).resolves.not.toThrow();
    });

    it('should pass if 204 status has an empty object body', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: realPath,
          method: 'GET',
          status: 204,
          body: {}
        })
      ).resolves.not.toThrow();
    });

    it('should throw if 204 status has a non-empty body (proves fast-path error prioritization without loading spec)', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath: 'any-non-existent-spec.yaml',
          path: '/any-path',
          method: 'GET',
          status: 204,
          body: { hasContent: true }
        })
      ).rejects.toThrow('204 must have empty body');
    });

    it('should throw if 204 status has a non-empty string body (proves fast-path error prioritization without loading spec)', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath: 'any-non-existent-spec.yaml',
          path: '/any-path',
          method: 'GET',
          status: 204,
          body: 'non-empty-string'
        })
      ).rejects.toThrow('204 must have empty body');
    });

    it('should throw if 204 status has an empty body but the path does not exist in the spec (proves BDD routing validation)', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/non-existent-route-path',
          method: 'GET',
          status: 204,
          body: undefined
        })
      ).rejects.toThrow('Path not found in OpenAPI');
    });
  });
});
