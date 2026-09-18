import { describe, it, expect } from 'vitest';
import { assertResponseMatchesOpenApi } from '../../src/index.js';

describe('assertResponseMatchesOpenApi - Nested and Dynamic Routing E2E', () => {
  const specPath = 'tests/fixtures/e2e/nested-objects.yaml';

  describe('Nested & Nullable Constraints', () => {
    const validNestedResponse = {
      items: [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Nested Item',
          description: 'A test nested item',
          tags: ['test', 'nested'],
          aliases: ['item-alias'],
          metadata: {
            creator: 'test-user',
            version: 1.2
          }
        }
      ],
      pagination: {
        total: 1
      }
    };

    it('should pass if a nested object with arrays matches the schema perfectly', async () => {
      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/nested',
          method: 'GET',
          status: 200,
          body: validNestedResponse
        })
      ).resolves.not.toThrow();
    });

    it('should pass if optional nested structures are null or missing and allowed by schema', async () => {
      const responseWithNulls = {
        ...validNestedResponse,
        items: [
          {
            ...validNestedResponse.items[0],
            aliases: null,
            metadata: null
          }
        ]
      };

      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/nested',
          method: 'GET',
          status: 200,
          body: responseWithNulls
        })
      ).resolves.not.toThrow();
    });

    it('should throw an error if items is not an array', async () => {
      const invalidResponse = {
        ...validNestedResponse,
        items: 'not-an-array'
      };

      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/nested',
          method: 'GET',
          status: 200,
          body: invalidResponse
        })
      ).rejects.toThrow(
        'OpenAPI contract violation for GET /test/nested 200.\nValidation errors:\n- [body.items] Expected array, received string'
      );
    });

    it('should throw an error with detailed path if a nested element in an array has a missing required field', async () => {
      const invalidResponse = {
        ...validNestedResponse,
        items: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            tags: ['test']
          }
        ]
      };

      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/nested',
          method: 'GET',
          status: 200,
          body: invalidResponse
        })
      ).rejects.toThrow(
        'OpenAPI contract violation for GET /test/nested 200.\nValidation errors:\n- [body.items[0].name] Missing required field'
      );
    });

    it('should throw an error if a deep nested field has an invalid type', async () => {
      const invalidResponse = {
        ...validNestedResponse,
        items: [
          {
            ...validNestedResponse.items[0],
            metadata: {
              creator: 'test-user',
              version: 'not-a-number'
            }
          }
        ]
      };

      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/nested',
          method: 'GET',
          status: 200,
          body: invalidResponse
        })
      ).rejects.toThrow(
        'OpenAPI contract violation for GET /test/nested 200.\nValidation errors:\n- [body.items[0].metadata.version] Expected number, received string'
      );
    });

    it('should throw an error if a nullable field has an invalid type instead of null or its schema', async () => {
      const invalidResponse = {
        ...validNestedResponse,
        items: [
          {
            ...validNestedResponse.items[0],
            aliases: 12345
          }
        ]
      };

      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/nested',
          method: 'GET',
          status: 200,
          body: invalidResponse
        })
      ).rejects.toThrow(
        'OpenAPI contract violation for GET /test/nested 200.\nValidation errors:\n- [body.items[0].aliases] Expected array, received number'
      );
    });

    it('should throw an error if a field does not match its expected format', async () => {
      const invalidResponse = {
        ...validNestedResponse,
        items: [
          {
            ...validNestedResponse.items[0],
            id: 'not-a-valid-uuid'
          }
        ]
      };

      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/nested',
          method: 'GET',
          status: 200,
          body: invalidResponse
        })
      ).rejects.toThrow(
        "OpenAPI contract violation for GET /test/nested 200.\nValidation errors:\n- [body.items[0].id] Expected string format 'uuid', received 'not-a-valid-uuid'"
      );
    });
  });

  describe('Dynamic Routing & Routing Path matching', () => {
    it('should resolve successfully for a dynamic path and hits the path regex cache on second query', async () => {
      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/dynamic/user123',
          method: 'GET',
          status: 200,
          body: { id: 'user123' }
        })
      ).resolves.not.toThrow();

      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/dynamic/user123',
          method: 'GET',
          status: 200,
          body: { id: 'user123' }
        })
      ).resolves.not.toThrow();
    });
  });
});
