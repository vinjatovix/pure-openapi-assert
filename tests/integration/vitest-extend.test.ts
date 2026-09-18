import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  assertResponseMatchesOpenApi,
  type OpenAPIValidatorInput
} from '../../src/assertions/assertResponseMatchesOpenApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const specPath = path.resolve(__dirname, '../fixtures/e2e/headers.yaml');

// 1. Declare types for the custom matcher
declare module 'vitest' {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>> {
    toMatchOpenAPI(specPath: string): Promise<R>;
  }
}

// 2. Extend Vitest expect with our custom matcher
expect.extend({
  async toMatchOpenAPI(
    received: Omit<OpenAPIValidatorInput, 'specPath'>,
    expectedSpecPath: string
  ) {
    try {
      await assertResponseMatchesOpenApi({
        ...received,
        specPath: expectedSpecPath
      } as OpenAPIValidatorInput); // Cast is needed due to TypeScript union spread limitations

      return {
        pass: true,
        message: () => 'Expected response NOT to match OpenAPI contract'
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        pass: false,
        message: () => message
      };
    }
  }
});

// 3. Test the Custom Matcher
describe('Vitest Custom Matcher Integration', () => {
  it('should match the OpenAPI specification successfully (polymorphic)', async () => {
    // Arrange
    const apiResponse = {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'X-Required-Header': 'yes'
      },
      body: {
        success: true
      }
    };

    // Act & Assert
    await expect({
      path: '/test/headers',
      method: 'get',
      response: apiResponse
    }).toMatchOpenAPI(specPath);
  });

  it('should fail when the response violates the OpenAPI specification', async () => {
    // Arrange
    const apiResponse = {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'X-Required-Header': 'yes'
      },
      body: {
        success: 'not-a-boolean' // Invalid type per spec
      }
    };

    // Act & Assert
    // We expect the custom matcher to throw an error containing the diagnostic message
    let caughtError: Error | undefined;
    try {
      await expect({
        path: '/test/headers',
        method: 'get',
        response: apiResponse
      }).toMatchOpenAPI(specPath);
    } catch (err) {
      caughtError = err as Error;
    }
    expect(caughtError).toBeDefined();
    expect(caughtError?.message).toContain('Expected boolean, received string');
  });
});
