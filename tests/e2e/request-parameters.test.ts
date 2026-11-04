import { describe, expect, it } from 'vitest';
import { assertRequestMatchesOpenApi } from '../../src/index.js';

const specPath = 'tests/fixtures/e2e/requests-openapi.yaml';

describe('assertRequestMatchesOpenApi - parameters', () => {
  it('fails when a required path param is absent ([path.id])', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath,
        path: '/users/{id}',
        method: 'get'
      })
    ).rejects.toThrow(/\[path\.id\]/);
  });

  it('fails when a query param is not coercible ([query.page])', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath,
        path: '/users/{id}',
        method: 'get',
        pathParams: { id: '1' },
        query: { page: 'abc' }
      })
    ).rejects.toThrow(/\[query\.page\]/);
  });

  it('fails when a required header is absent (case-insensitive) ([header.X-Tenant-Id])', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath,
        path: '/orders',
        method: 'get'
      })
    ).rejects.toThrow(/\[header\.X-Tenant-Id\]/);
  });

  it('passes a required header matched case-insensitively', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath,
        path: '/orders',
        method: 'get',
        headers: { 'x-tenant-id': 'acme' }
      })
    ).resolves.toBeUndefined();
  });

  it('passes when all declared parameters are satisfied', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath,
        path: '/users/{id}',
        method: 'get',
        pathParams: { id: '1' },
        query: { page: '2' }
      })
    ).resolves.toBeUndefined();
  });

  it('fails on a declared path param absent from the template', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath,
        path: '/mismatch',
        method: 'get',
        pathParams: { ghost: 'x' }
      })
    ).rejects.toThrow(/ghost/);
  });

  it('fails on a template token not declared as a parameter', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath,
        path: '/widgets/{wid}',
        method: 'get'
      })
    ).rejects.toThrow(/wid/);
  });
});
