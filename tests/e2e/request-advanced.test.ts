import { describe, expect, it } from 'vitest';
import { assertRequestMatchesOpenApi } from '../../src/index.js';

const specPath = 'tests/fixtures/e2e/requests-openapi.yaml';

describe('assertRequestMatchesOpenApi - advanced request assertions', () => {
  describe('automatic path parameter extraction', () => {
    it('automatically extracts and validates an integer path parameter from a concrete URL', async () => {
      const input = {
        specPath,
        path: '/users/42',
        method: 'get'
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });

    it('fails when an extracted path parameter violates schema constraints', async () => {
      const input = {
        specPath,
        path: '/users/not-an-id',
        method: 'get'
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).rejects.toThrow(/\[path\.id\]/);
    });

    it('allows explicit pathParams to override extracted path parameters', async () => {
      const input = {
        specPath,
        path: '/users/not-an-id',
        method: 'get',
        pathParams: { id: '200' }
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });

    it('resolves exact static route instead of treating segment as a dynamic parameter', async () => {
      const input = {
        specPath,
        path: '/users/me',
        method: 'get'
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });

    it('extracts and validates multiple path parameters across multiple path segments', async () => {
      const input = {
        specPath,
        path: '/orgs/acme/teams/engineering/members/ada',
        method: 'get'
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });
  });

  describe('OpenAPI 3.0 deepObject query deserialization', () => {
    it('validates nested deepObject query with integer coercion on nested property', async () => {
      const input = {
        specPath,
        path: '/plants',
        method: 'get',
        query: 'filter[family]=solanaceae&filter[limit]=10'
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });

    it('fails when a nested deepObject property violates type constraints', async () => {
      const input = {
        specPath,
        path: '/plants',
        method: 'get',
        query: 'filter[family]=solanaceae&filter[limit]=not-an-integer'
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).rejects.toThrow(/\[query\.filter\.limit\]/);
    });

    it('fails when a scalar string is passed for an object-typed parameter', async () => {
      const input = {
        specPath,
        path: '/plants',
        method: 'get',
        query: 'filter=active'
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).rejects.toThrow(/\[query\.filter\]/);
    });

    it('rejects undeclared nested property when additionalProperties is false', async () => {
      const input = {
        specPath,
        path: '/plants',
        method: 'get',
        query: 'filter[unknownProperty]=value'
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).rejects.toThrow(/\[query\.filter\.unknownProperty\]/);
    });

    it('reconstructs and validates a deeply nested query parameter hierarchy', async () => {
      const input = {
        specPath,
        path: '/plants',
        method: 'get',
        query: 'query[where][author][name]=Ada'
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });
  });

  describe('direct URL and flexible query inputs', () => {
    it('extracts path and query from a full URL string', async () => {
      const input = {
        specPath,
        url: 'https://api.example.com/api/v1/plants?category=herbs',
        method: 'get'
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });

    it('extracts path and query from a relative path containing query string', async () => {
      const input = {
        specPath,
        path: '/api/v1/plants?category=herbs',
        method: 'get'
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });

    it('validates query parameters supplied as a URLSearchParams instance', async () => {
      const input = {
        specPath,
        path: '/api/v1/plants',
        method: 'get',
        query: new URLSearchParams('category=herbs')
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });

    it('overrides URL query parameter with explicit query input value', async () => {
      const input = {
        specPath,
        url: 'https://api.example.com/api/v1/plants?category=herbs',
        method: 'get',
        query: { category: 'flowers' }
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });

    it('merges non-conflicting URL query parameters and explicit query inputs', async () => {
      const input = {
        specPath,
        path: '/api/v1/plants?a=1',
        method: 'get',
        query: { b: '2' }
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });

    it('accumulates repeated query keys from URL into an array', async () => {
      const input = {
        specPath,
        url: 'https://api.example.com/api/v1/plants?tags=red&tags=blue',
        method: 'get'
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });

    it('normalizes a URL without pathname to root path', async () => {
      const input = {
        specPath,
        url: 'https://api.example.com?page=1',
        method: 'get'
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });

    it('prioritizes url over path as canonical target when both are provided', async () => {
      const input = {
        specPath,
        url: 'https://api.example.com/users/me',
        path: '/nonexistent-ignored',
        method: 'get'
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });
  });

  describe('strict parameter validation mode', () => {
    it('rejects undeclared query parameter when strictParameters is true', async () => {
      const input = {
        specPath,
        path: '/users/42',
        method: 'get',
        query: { limit: '20' },
        strictParameters: true
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).rejects.toThrow(/\[query\.limit\].*not declared/);
    });

    it('allows undeclared query parameter when strictParameters is false or omitted', async () => {
      const input = {
        specPath,
        path: '/users/42',
        method: 'get',
        query: { limit: '20' }
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });

    it('rejects undeclared custom header when strictParameters is true', async () => {
      const input = {
        specPath,
        path: '/users/42',
        method: 'get',
        headers: { 'X-Custom-Unknown': 'secret' },
        strictParameters: true
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).rejects.toThrow(
        /\[header\.X-Custom-Unknown\].*not declared/
      );
    });

    it('exempts standard RFC transport headers and security headers under strict mode', async () => {
      const input = {
        specPath,
        path: '/users/42',
        method: 'get',
        headers: {
          'user-agent': 'test-runner/1.0',
          host: 'api.example.com',
          authorization: 'Bearer token-xyz'
        },
        strictParameters: true
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });

    it('recognizes root key of deepObject query as declared parameter under strict mode', async () => {
      const input = {
        specPath,
        path: '/plants',
        method: 'get',
        query: 'filter[status]=active',
        strictParameters: true
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });
  });

  describe('direct Request and Fetch object input parity', () => {
    it('validates a standard Fetch Request object provided via request property', async () => {
      const fetchRequest = new Request(
        'https://api.example.com/api/v1/plants?category=herbs',
        { method: 'GET' }
      );
      const input = {
        specPath,
        request: fetchRequest
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });

    it('validates a standard Fetch Request object provided via req alias', async () => {
      const fetchRequest = new Request(
        'https://api.example.com/api/v1/plants?category=herbs',
        { method: 'GET' }
      );
      const input = {
        specPath,
        req: fetchRequest
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });

    it('preserves the original Request stream leaving bodyUsed false after validation', async () => {
      const fetchRequest = new Request('https://api.example.com/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice' })
      });
      const input = {
        specPath,
        request: fetchRequest
      };

      await assertRequestMatchesOpenApi(input);

      expect(fetchRequest.bodyUsed).toBe(false);
    });

    it('fails when body extracted from Request violates contract schema', async () => {
      const fetchRequest = new Request('https://api.example.com/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' })
      });
      const input = {
        specPath,
        request: fetchRequest
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).rejects.toThrow(/\[body\.name\]/);
    });

    it('extracts path parameters seamlessly from Request url', async () => {
      const fetchRequest = new Request('https://api.example.com/users/42', {
        method: 'GET'
      });
      const input = {
        specPath,
        request: fetchRequest
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });

    it('validates a plain Node-like request object', async () => {
      const nodeRequest = {
        url: '/users',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: { name: 'Bob' }
      };
      const input = {
        specPath,
        req: nodeRequest
      };

      const result = assertRequestMatchesOpenApi(input);

      await expect(result).resolves.toBeUndefined();
    });
  });

  describe('performance SLO benchmarks', () => {
    it('executes 100 hot-run assertions with parameterized routes and deepObject queries in under 3ms on average', async () => {
      const input = {
        specPath,
        path: '/plants',
        method: 'get',
        query: 'filter[family]=solanaceae&filter[limit]=10'
      };

      await assertRequestMatchesOpenApi(input);

      const iterations = 100;
      const startTime = performance.now();
      for (let i = 0; i < iterations; i++) {
        await assertRequestMatchesOpenApi(input);
      }
      const totalTime = performance.now() - startTime;
      const averageTime = totalTime / iterations;

      expect(averageTime).toBeLessThan(3.0);
    });
  });
});
