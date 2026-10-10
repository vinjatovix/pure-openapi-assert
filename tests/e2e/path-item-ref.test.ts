import { describe, it, expect } from 'vitest';
import { assertResponseMatchesOpenApi } from '../../src/index.js';

describe('assertResponseMatchesOpenApi with a Path Item $ref', () => {
  const specPath = 'tests/fixtures/e2e/path-item-ref/spec.yaml';

  it('should resolve the operations of the referenced Path Item', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/pets',
        method: 'GET',
        status: 200,
        body: ['rex']
      })
    ).resolves.not.toThrow();
  });

  it('should keep the operations declared next to the Path Item $ref', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/pets',
        method: 'POST',
        status: 201,
        body: { id: 'rex' }
      })
    ).resolves.not.toThrow();
  });

  it('should validate the sibling operation against its schema', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/pets',
        method: 'POST',
        status: 201,
        body: { id: 1 }
      })
    ).rejects.toThrow(/\[body\.id\]/);
  });
});
