import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertRequestMatchesOpenApi } from '../../src/index.js';

const specPath = 'tests/fixtures/e2e/requests-openapi.yaml';

describe('assertRequestMatchesOpenApi - request body', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails when a required requestBody is absent', async () => {
    await expect(
      assertRequestMatchesOpenApi({ specPath, path: '/users', method: 'post' })
    ).rejects.toThrow(/request body is required/i);
  });

  it('passes when an optional requestBody is absent', async () => {
    await expect(
      assertRequestMatchesOpenApi({ specPath, path: '/users', method: 'get' })
    ).resolves.toBeUndefined();
  });

  it('fails when a required body field is missing ([body.name])', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath,
        path: '/users',
        method: 'post',
        body: { age: 30 }
      })
    ).rejects.toThrow(/\[body\.name\]/);
  });

  it('fails when a body field has the wrong type ([body.age] integer)', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath,
        path: '/users',
        method: 'post',
        body: { name: 'Ada', age: '30' }
      })
    ).rejects.toThrow(/\[body\.age\].*integer/i);
  });

  it('passes with a valid body', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath,
        path: '/users',
        method: 'post',
        body: { name: 'Ada', age: 30 }
      })
    ).resolves.toBeUndefined();
  });

  it('fails with a clear parse error for malformed JSON text body', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath,
        path: '/users',
        method: 'post',
        body: '{ "name": "Ada", ',
        contentType: 'application/json'
      })
    ).rejects.toThrow(/Malformed JSON body/i);
  });

  it('accepts a valid JSON text body (parsed losslessly)', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath,
        path: '/users',
        method: 'post',
        body: '{ "name": "Ada", "age": 30 }',
        contentType: 'application/json'
      })
    ).resolves.toBeUndefined();
  });

  it('validates a non-JSON (text/plain) string body without parsing it', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath,
        path: '/notes',
        method: 'post',
        body: 'a plain note',
        contentType: 'text/plain'
      })
    ).resolves.toBeUndefined();
  });

  it('ignores a body sent to an operation that declares no requestBody', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath,
        path: '/users/{id}',
        method: 'get',
        pathParams: { id: '1' },
        body: { ignored: true }
      })
    ).resolves.toBeUndefined();
  });

  it('fails intelligibly when the request Content-Type is not declared', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath,
        path: '/users',
        method: 'post',
        body: { name: 'Ada' },
        contentType: 'application/xml'
      })
    ).rejects.toThrow(/not declared/i);
  });

  it('rejects an OpenAPI 3.1 spec consistently with the responses limit', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath: 'tests/fixtures/e2e/requests-openapi-3_1.yaml',
        path: '/users',
        method: 'post',
        body: { name: 'Ada' }
      })
    ).rejects.toThrow(/Parsed OpenAPI spec is invalid/i);
  });

  it('emits a path-scoped warning for a deprecated body property', async () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    await assertRequestMatchesOpenApi({
      specPath,
      path: '/users',
      method: 'post',
      body: { name: 'Ada', nickname: 'ada' }
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[body.nickname]')
    );
  });

  it('emits a deprecation warning for a deprecated operation', async () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    await assertRequestMatchesOpenApi({
      specPath,
      path: '/legacy',
      method: 'post',
      body: { name: 'Ada' }
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[OpenAPI-Assert] ⚠️  Warning:')
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('is deprecated')
    );
  });
});
