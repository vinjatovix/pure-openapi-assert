import { describe, it, expect } from 'vitest';
import { assertResponseMatchesOpenAPI } from '../../src/index.js';

describe('assertResponseMatchesOpenAPI - Default Responses and Edge Cases E2E', () => {
  const specPath = 'tests/fixtures/e2e/default-responses.yaml';

  describe('Default Response Fallback', () => {
    it('should validate 200 response with its specific schema', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/default',
          method: 'GET',
          status: 200,
          body: { status: 'ok' }
        })
      ).resolves.not.toThrow();
    });

    it('should fail 200 response if it does not match its specific schema', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/default',
          method: 'GET',
          status: 200,
          body: { notStatus: 'ok' }
        })
      ).rejects.toThrow('Missing required field');
    });

    it('should fall back to default schema and headers for undocumented status code (e.g. 500)', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/default',
          method: 'GET',
          status: 500,
          body: { code: 500, message: 'Internal Server Error' },
          headers: {
            'X-Error-Header': 'some-trace-id'
          }
        })
      ).resolves.not.toThrow();
    });

    it('should fall back to default schema and reject undocumented status code (e.g. 400) if structure is invalid', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/default',
          method: 'GET',
          status: 400,
          body: { status: 'invalid-structure' }
        })
      ).rejects.toThrow('[body.code] Missing required field');
    });
  });

  describe('Extreme Header Case-Insensitivity', () => {
    it('should match declared headers in the OpenAPI spec using bizarre, mixed casing in incoming request', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/default',
          method: 'GET',
          status: 500,
          body: { code: 500, message: 'Internal Server Error' },
          headers: {
            'x-ErRoR-hEaDeR': 'some-trace-id'
          }
        })
      ).resolves.not.toThrow();
    });

    it('should trigger required validations even if the input header is strangely capitalized', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath: 'tests/fixtures/e2e/headers.yaml',
          path: '/test/headers',
          method: 'GET',
          status: 200,
          body: { success: true },
          headers: {
            'x-ReQuIrEd-HeAdEr': 'hello'
          }
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Empty Bodies on 201/202 Responses', () => {
    it('should pass empty/undefined body on 201 status code when no schema is declared', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/empty-success',
          method: 'POST',
          status: 201,
          body: undefined
        })
      ).resolves.not.toThrow();

      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/empty-success',
          method: 'POST',
          status: 201,
          body: {}
        })
      ).resolves.not.toThrow();
    });

    it('should pass empty/undefined body on 202 status code when no schema is declared', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/empty-success',
          method: 'POST',
          status: 202,
          body: undefined
        })
      ).resolves.not.toThrow();
    });
  });
});
