import { describe, expect, it } from 'vitest';
import { assertRequestMatchesOpenApi } from '../../src/index.js';

const specPath = 'tests/fixtures/e2e/requests-openapi.yaml';

describe('assertRequestMatchesOpenApi - style/explode matrix', () => {
  it('deserializes a form array (explode=false) and validates it', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath,
        path: '/search',
        method: 'get',
        query: { tags: 'a,b,c' }
      })
    ).resolves.toBeUndefined();
  });

  it('deserializes a spaceDelimited array and validates it', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath,
        path: '/search',
        method: 'get',
        query: { tagsSpace: 'a b c' }
      })
    ).resolves.toBeUndefined();
  });

  it('deserializes a pipeDelimited integer array and validates it', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath,
        path: '/search',
        method: 'get',
        query: { tagsPipe: '1|2|3' }
      })
    ).resolves.toBeUndefined();
  });

  it('does not silently pass a supported style with an invalid item ([query.tagsPipe])', async () => {
    await expect(
      assertRequestMatchesOpenApi({
        specPath,
        path: '/search',
        method: 'get',
        query: { tagsPipe: '1|x|3' }
      })
    ).rejects.toThrow(/\[query\.tagsPipe/);
  });
});
