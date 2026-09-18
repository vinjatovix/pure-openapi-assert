import { describe, it, expect } from 'vitest';
import { assertResponseMatchesOpenApi } from '../../src/index.js';

describe('assertResponseMatchesOpenApi - OpenAPI Loader and Router Integration (No Mocks)', () => {
  it('should throw an error when parsing an invalid OpenAPI spec (missing paths or content)', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath: 'tests/fixtures/integration/invalid-openapi.yaml',
        path: '/any',
        method: 'GET',
        status: 200,
        body: {}
      })
    ).rejects.toThrow('Parsed OpenAPI spec is invalid');
  });

  it('should throw an error when parsing an OpenAPI spec missing the openapi version field', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath: 'tests/fixtures/integration/missing-openapi-version.yaml',
        path: '/any',
        method: 'GET',
        status: 200,
        body: {}
      })
    ).rejects.toThrow('Parsed OpenAPI spec is invalid');
  });

  it('should throw an error when parsing an OpenAPI spec missing the info object field', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath: 'tests/fixtures/integration/missing-info-object.yaml',
        path: '/any',
        method: 'GET',
        status: 200,
        body: {}
      })
    ).rejects.toThrow('Parsed OpenAPI spec is invalid');
  });

  it('should throw an error when parsing an OpenAPI spec that is a primitive string', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath: 'tests/fixtures/integration/primitive-openapi.yaml',
        path: '/any',
        method: 'GET',
        status: 200,
        body: {}
      })
    ).rejects.toThrow('Parsed OpenAPI spec is invalid');
  });

  it('should throw an error when parsing an empty OpenAPI spec', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath: 'tests/fixtures/integration/null-openapi.yaml',
        path: '/any',
        method: 'GET',
        status: 200,
        body: {}
      })
    ).rejects.toThrow('Parsed OpenAPI spec is invalid');
  });

  it('should throw an error when requesting a non-existent path in spec', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath: 'tests/fixtures/e2e/formats.yaml',
        path: '/test/non-existent-path',
        method: 'GET',
        status: 200,
        body: {}
      })
    ).rejects.toThrow('Path not found in OpenAPI: /test/non-existent-path');
  });

  it('should throw an error when requesting an invalid method for an existing path', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath: 'tests/fixtures/e2e/formats.yaml',
        path: '/test/formats',
        method: 'POST',
        status: 200,
        body: {}
      })
    ).rejects.toThrow('Operation not found: POST /test/formats');
  });

  it('should throw an error when requesting an unmatched status code response', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath: 'tests/fixtures/e2e/formats.yaml',
        path: '/test/formats',
        method: 'GET',
        status: 500,
        body: {}
      })
    ).rejects.toThrow('Response not found: GET /test/formats 500');
  });

  it('should throw an error when requesting a response status with no schema defined', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath: 'tests/fixtures/e2e/formats.yaml',
        path: '/test/formats-extended',
        method: 'GET',
        status: 201,
        body: {}
      })
    ).rejects.toThrow('No schema found for GET /test/formats-extended 201');
  });
});
