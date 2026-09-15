import { describe, it, expect } from 'vitest';
import { assertResponseMatchesOpenAPI } from '../../src/index.js';

describe('OpenAPI "not" keyword validation quickstart', () => {
  it('should reject a payload matching the prohibited schema', async () => {
    await expect(
      assertResponseMatchesOpenAPI({
        specPath: 'tests/fixtures/not-keyword-test.yaml',
        path: '/test',
        method: 'GET',
        status: 200,
        body: { id: 1, status: 123 }
      })
    ).rejects.toThrow('Value matches prohibited schema');
  });

  it('should accept a payload that does not match the prohibited schema', async () => {
    await expect(
      assertResponseMatchesOpenAPI({
        specPath: 'tests/fixtures/not-keyword-test.yaml',
        path: '/test',
        method: 'GET',
        status: 200,
        body: { id: 1, status: 'active' }
      })
    ).resolves.not.toThrow();
  });
});
