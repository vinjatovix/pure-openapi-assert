import { describe, it, expect } from 'vitest';
import { assertResponseMatchesOpenApi } from '../../src/index.js';

describe('assertResponseMatchesOpenApi - Headers basic E2E', () => {
  const specPath = 'tests/fixtures/e2e/headers.yaml';

  describe('Header Validation', () => {
    it('should pass when required and correctly typed headers are present', async () => {
      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/headers',
          method: 'GET',
          status: 200,
          body: { success: true },
          headers: {
            'X-Required-Header': 'hello',
            'X-RateLimit-Limit': '100',
            'X-Cache-Hit': 'true',
            'X-Custom-List': '1,2,3',
            'X-JSON-Header': '{"foo": "bar"}'
          }
        })
      ).resolves.not.toThrow();
    });

    it('should validate headers defined using content', async () => {
      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/headers',
          method: 'GET',
          status: 200,
          body: { success: true },
          headers: {
            'X-Required-Header': 'hello',
            'X-JSON-Header': '{"not-foo": "bar"}'
          }
        })
      ).rejects.toThrow('[headers.X-JSON-Header.foo] Missing required field');

      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/headers',
          method: 'GET',
          status: 200,
          body: { success: true },
          headers: {
            'X-Required-Header': 'hello',
            'X-JSON-Header': '{"foo": 123}'
          }
        })
      ).rejects.toThrow(
        '[headers.X-JSON-Header.foo] Expected string, received number'
      );
    });

    it('should fail with a semantic error when a header using content has invalid JSON', async () => {
      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/headers',
          method: 'GET',
          status: 200,
          body: { success: true },
          headers: {
            'X-Required-Header': 'hello',
            'X-JSON-Header': '{invalid-json}'
          }
        })
      ).rejects.toThrow('Failed to parse JSON from header value:');
    });

    it('should throw an error when a required header is missing', async () => {
      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/headers',
          method: 'GET',
          status: 200,
          body: { success: true },
          headers: {
            'X-RateLimit-Limit': '100'
          }
        })
      ).rejects.toThrow('Missing required header: X-Required-Header');
    });

    it('should throw an error when a header value fails format constraints', async () => {
      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/headers',
          method: 'GET',
          status: 200,
          body: { success: true },
          headers: {
            'X-Required-Header': 'hello',
            'X-RateLimit-Limit': 'abc'
          }
        })
      ).rejects.toThrow('Expected integer, received string');
    });

    it('should throw an error when a header value fails numeric range constraints', async () => {
      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/headers',
          method: 'GET',
          status: 200,
          body: { success: true },
          headers: {
            'X-Required-Header': 'hello',
            'X-RateLimit-Limit': '-5'
          }
        })
      ).rejects.toThrow('Value -5 is less than minimum 0');
    });

    it('should correctly handle and validate list/array headers', async () => {
      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/headers',
          method: 'GET',
          status: 200,
          body: { success: true },
          headers: {
            'X-Required-Header': 'hello',
            'X-Custom-List': ['1', 'abc']
          }
        })
      ).rejects.toThrow('Expected integer, received string');
    });

    it('should throw an error when a boolean header receives an invalid value', async () => {
      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/headers',
          method: 'GET',
          status: 200,
          body: { success: true },
          headers: {
            'X-Required-Header': 'hello',
            'X-Cache-Hit': 'not-a-bool'
          }
        })
      ).rejects.toThrow('Expected boolean, received string');
    });

    describe('Robustness and DX Defensive Handling', () => {
      it('should gracefully handle and pass pre-coerced types (numbers, booleans, arrays)', async () => {
        await expect(
          assertResponseMatchesOpenApi({
            specPath,
            path: '/test/headers',
            method: 'GET',
            status: 200,
            body: { success: true },
            headers: {
              'X-Required-Header': 'hello',
              'X-RateLimit-Limit': 150 as unknown as string,
              'X-Cache-Hit': true as unknown as string,
              'X-Custom-List': [1, 2, 3] as unknown as string[]
            }
          })
        ).resolves.not.toThrow();
      });

      it('should not crash and instead fail semantically when receiving raw invalid non-string values', async () => {
        await expect(
          assertResponseMatchesOpenApi({
            specPath,
            path: '/test/headers',
            method: 'GET',
            status: 200,
            body: { success: true },
            headers: {
              'X-Required-Header': 'hello',
              'X-RateLimit-Limit': { some: 'object' } as unknown as string
            }
          })
        ).rejects.toThrow('Expected integer, received object');
      });
    });
  });
});
