import { describe, it, expect } from 'vitest';
import { assertResponseMatchesOpenApi } from '../../src/index.js';

describe('assertResponseMatchesOpenApi - not keyword and coercion E2E', () => {
  const specPath = 'tests/fixtures/e2e/not-coercion-spec.yaml';

  it('should reject coerced integer headers matching the negated schema', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test/coercion',
        method: 'GET',
        status: 200,
        body: { success: true },
        headers: {
          'X-Not-Integer': '123'
        }
      })
    ).rejects.toThrow('Value matches prohibited schema');
  });

  it('should accept non-coercible string headers that do not match the negated schema', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test/coercion',
        method: 'GET',
        status: 200,
        body: { success: true },
        headers: {
          'X-Not-Integer': 'abc'
        }
      })
    ).resolves.not.toThrow();
  });
});
