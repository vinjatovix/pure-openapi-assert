import { describe, it, expect } from 'vitest';
import { assertResponseMatchesOpenApi } from '../../src/assertions/assertResponseMatchesOpenApi.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const specPath = path.resolve(__dirname, '../fixtures/e2e/headers.yaml');

describe('Polymorphic Response Support - Backward Compatibility & Precedence', () => {
  it('should successfully validate when using explicit loose parameters directly (backward compatibility)', async () => {
    // Arrange
    const config = {
      specPath,
      path: '/test/headers',
      method: 'get',
      status: 200,
      headers: {
        'content-type': 'application/json',
        'X-Required-Header': 'yes'
      },
      body: { success: true }
    };

    // Act & Assert
    await expect(assertResponseMatchesOpenApi(config)).resolves.not.toThrow();
  });

  it('should prefer explicit parameter overrides over extracted response fields (precedence)', async () => {
    // Arrange
    const response = {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'X-Required-Header': 'yes'
      },
      body: { success: true }
    };

    // We override status to 400. In headers.yaml, /test/headers only has a 200 response declaration,
    // so matching it against status 400 should trigger a "response not declared" error.
    const config = {
      specPath,
      path: '/test/headers',
      method: 'get',
      status: 400, // Explicit override
      response
    };

    // Act & Assert
    await expect(assertResponseMatchesOpenApi(config)).rejects.toThrow(
      /Response not found: get \/test\/headers 400/
    );
  });
});
