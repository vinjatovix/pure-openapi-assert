import { describe, it, expect } from 'vitest';
import { assertResponseMatchesOpenApi } from '../../src/assertions/assertResponseMatchesOpenApi.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const specPath = path.resolve(__dirname, '../fixtures/e2e/headers.yaml');

describe('Polymorphic Response Support - Node.js / Supertest / Axios', () => {
  it('should successfully extract status, headers, and body from a Supertest response', async () => {
    // Arrange
    const response = {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'X-Required-Header': 'yes'
      },
      body: { success: true }
    };
    const config = {
      specPath,
      path: '/test/headers',
      method: 'get',
      response
    };

    // Act & Assert
    await expect(assertResponseMatchesOpenApi(config)).resolves.not.toThrow();
  });

  it('should successfully extract statusCode, headers, and data from an Axios response', async () => {
    // Arrange
    const response = {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
        'X-Required-Header': 'yes'
      },
      data: { success: true }
    };
    const config = {
      specPath,
      path: '/test/headers',
      method: 'get',
      res: response
    };

    // Act & Assert
    await expect(assertResponseMatchesOpenApi(config)).resolves.not.toThrow();
  });

  it('should fail validation when extracted Supertest body violates schema', async () => {
    // Arrange
    const response = {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'X-Required-Header': 'yes'
      },
      body: { success: 'invalid-type' }
    };
    const config = {
      specPath,
      path: '/test/headers',
      method: 'get',
      response
    };

    // Act & Assert
    await expect(assertResponseMatchesOpenApi(config)).rejects.toThrow(
      /Expected boolean, received string/
    );
  });

  it('should successfully extract body from response containing only a text field', async () => {
    // Arrange
    const response = {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'X-Required-Header': 'yes'
      },
      text: JSON.stringify({ success: true })
    };
    const config = {
      specPath,
      path: '/test/headers',
      method: 'get',
      response
    };

    // Act & Assert
    await expect(assertResponseMatchesOpenApi(config)).resolves.not.toThrow();
  });

  it('should throw an error when the response object is missing both status and statusCode', async () => {
    // Arrange
    const response = {
      headers: {},
      body: {}
    };
    const config = {
      specPath,
      path: '/test/headers',
      method: 'get',
      response
    };

    // Act & Assert
    await expect(assertResponseMatchesOpenApi(config)).rejects.toThrow(
      /Response object must contain a status or statusCode property/
    );
  });

  it('should successfully handle Symbol header values', async () => {
    // Arrange
    const response = {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'X-Required-Header': 'yes',
        'X-Symbol-Header': Symbol('test')
      },
      body: { success: true }
    };
    const config = {
      specPath,
      path: '/test/headers',
      method: 'get',
      response
    };

    // Act & Assert
    await expect(assertResponseMatchesOpenApi(config)).resolves.not.toThrow();
  });

  it('should throw an error when a 204 response has a non-empty body', async () => {
    // Arrange
    const response = {
      status: 204,
      headers: {
        'X-Required-Header': 'yes'
      },
      body: { success: true }
    };
    const config = {
      specPath,
      path: '/test/headers',
      method: 'get',
      response
    };

    // Act & Assert
    await expect(assertResponseMatchesOpenApi(config)).rejects.toThrow(
      /204 must have empty body/
    );
  });

  it('should work when response has no headers property', async () => {
    // Arrange
    const response = {
      status: 200,
      body: { success: true }
    };
    const config = {
      specPath,
      path: '/test/headers',
      method: 'get',
      response,
      headers: {
        'content-type': 'application/json',
        'X-Required-Header': 'yes'
      }
    };

    // Act & Assert
    await expect(assertResponseMatchesOpenApi(config)).resolves.not.toThrow();
  });
});
