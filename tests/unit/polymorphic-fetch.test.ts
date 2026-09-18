import { describe, it, expect } from 'vitest';
import { assertResponseMatchesOpenApi } from '../../src/assertions/assertResponseMatchesOpenApi.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const specPath = path.resolve(__dirname, '../fixtures/e2e/headers.yaml');

class MockHeaders {
  private map = new Map<string, string>();

  constructor(init: Record<string, string>) {
    for (const [k, v] of Object.entries(init)) {
      this.map.set(k.toLowerCase(), v);
    }
  }

  get(name: string): string | null {
    return this.map.get(name.toLowerCase()) ?? null;
  }

  entries(): Iterable<[string, string]> {
    return this.map.entries();
  }
}

class MockFetchResponse {
  public bodyUsed = false;
  private rawBody: string;

  constructor(
    public status: number,
    private headersObj: Record<string, string>,
    bodyObj: unknown
  ) {
    this.rawBody =
      typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj);
  }

  get headers() {
    return new MockHeaders(this.headersObj);
  }

  async json(): Promise<unknown> {
    await Promise.resolve();
    if (this.bodyUsed) {
      throw new Error('Body already consumed');
    }
    this.bodyUsed = true;
    return JSON.parse(this.rawBody);
  }

  async text(): Promise<string> {
    await Promise.resolve();
    if (this.bodyUsed) {
      throw new Error('Body already consumed');
    }
    this.bodyUsed = true;
    return this.rawBody;
  }

  clone(): MockFetchResponse {
    const cloned = new MockFetchResponse(
      this.status,
      { ...this.headersObj },
      this.rawBody
    );
    return cloned;
  }
}

describe('Polymorphic Response Support - Native Fetch API', () => {
  it('should successfully extract status, headers, and json body from fetch response', async () => {
    // Arrange
    const response = new MockFetchResponse(
      200,
      { 'content-type': 'application/json', 'X-Required-Header': 'yes' },
      { success: true }
    );
    const config = {
      specPath,
      path: '/test/headers',
      method: 'get',
      response
    };

    // Act & Assert
    await expect(assertResponseMatchesOpenApi(config)).resolves.not.toThrow();
  });

  it('should fail validation when extracted body violates OAS schema', async () => {
    // Arrange
    const response = new MockFetchResponse(
      200,
      { 'content-type': 'application/json', 'X-Required-Header': 'yes' },
      { success: 'not-a-boolean' }
    );
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

  it('should fail and capture structured error when fetch body contains malformed JSON', async () => {
    // Arrange
    const response = new MockFetchResponse(
      200,
      { 'content-type': 'application/json', 'X-Required-Header': 'yes' },
      '{ invalid-json: '
    );
    const config = {
      specPath,
      path: '/test/headers',
      method: 'get',
      response
    };

    // Act & Assert
    await expect(assertResponseMatchesOpenApi(config)).rejects.toThrow(
      /Malformed JSON body/
    );
  });

  it('should fall back to using .get() when headers.entries() throws', async () => {
    // Arrange
    const badHeaders = {
      'x-required-header': 'yes',
      get: (name: string) =>
        name === 'content-type' ? 'application/json' : 'yes',
      entries: () => {
        throw new Error('broken entries');
      }
    };
    const response = {
      status: 200,
      headers: badHeaders,
      json: async () => {
        await Promise.resolve();
        return { success: true };
      },
      text: async () => {
        await Promise.resolve();
        return '';
      }
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

  it('should work with a fetch response that does not have a clone method', async () => {
    // Arrange
    const response = {
      status: 200,
      headers: {
        get: (name: string) =>
          name === 'content-type' ? 'application/json' : 'yes',
        entries: () =>
          [
            ['content-type', 'application/json'],
            ['X-Required-Header', 'yes']
          ] as Iterable<[string, string]>
      },
      json: async () => {
        await Promise.resolve();
        return { success: true };
      },
      text: async () => {
        await Promise.resolve();
        return '';
      }
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

  it('should fail and capture structured error when fetch text() body extraction throws', async () => {
    // Arrange
    const response = {
      status: 200,
      headers: {
        get: (name: string) => (name === 'content-type' ? 'text/plain' : 'yes'),
        entries: () =>
          [
            ['content-type', 'text/plain'],
            ['X-Required-Header', 'yes']
          ] as Iterable<[string, string]>
      },
      json: async () => {
        await Promise.resolve();
        return {};
      },
      text: async () => {
        await Promise.resolve();
        throw new Error('Failed to read text stream');
      }
    };
    const config = {
      specPath,
      path: '/test/headers',
      method: 'get',
      response
    };

    // Act & Assert
    await expect(assertResponseMatchesOpenApi(config)).rejects.toThrow(
      /Malformed JSON body: Failed to read text stream/
    );
  });

  it('should successfully extract text body on a non-JSON media type fetch response', async () => {
    // Arrange
    const response = {
      status: 200,
      headers: {
        get: (name: string) => (name === 'content-type' ? 'text/plain' : 'yes'),
        entries: () =>
          [
            ['content-type', 'text/plain'],
            ['X-Required-Header', 'yes']
          ] as Iterable<[string, string]>
      },
      json: async () => {
        await Promise.resolve();
        return {};
      },
      text: async () => {
        await Promise.resolve();
        return 'plain text';
      }
    };
    const config = {
      specPath,
      path: '/test/headers',
      method: 'get',
      response
    };

    // Act & Assert
    await expect(assertResponseMatchesOpenApi(config)).rejects.toThrow(
      /Content-Type 'text\/plain' is not declared for get/
    );
  });

  it('should return undefined body when response has no json or text function', async () => {
    // Arrange
    const response = {
      status: 200,
      headers: {
        get: (name: string) =>
          name === 'content-type' ? 'application/json' : 'yes',
        entries: () =>
          [
            ['content-type', 'application/json'],
            ['X-Required-Header', 'yes']
          ] as Iterable<[string, string]>
      }
    };
    const config = {
      specPath,
      path: '/test/headers',
      method: 'get',
      response,
      body: { success: true }
    };

    // Act & Assert
    await expect(assertResponseMatchesOpenApi(config)).resolves.not.toThrow();
  });
});
