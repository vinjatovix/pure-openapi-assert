import { describe, expect, it } from 'vitest';
import {
  assertRequestMatchesOpenApi,
  assertResponseMatchesOpenApi
} from '../../src/index.js';

const specPath = 'tests/fixtures/e2e/requests-openapi.yaml';

// Profile is shared by the requestBody of POST /accounts and the 200 response
// of GET /accounts/{id}. Same schema + same payload must yield the same verdict.

async function verdict(fn: () => Promise<void>): Promise<string> {
  try {
    await fn();
    return 'pass';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return (message.match(/\[[^\]]+\]/g) ?? []).join(',') || 'fail';
  }
}

const requestWith = (
  body: unknown,
  customFormats?: Record<string, (v: string) => boolean>
) =>
  assertRequestMatchesOpenApi({
    specPath,
    path: '/accounts',
    method: 'post',
    body,
    ...(customFormats ? { customFormats } : {})
  });

const responseWith = (
  body: unknown,
  customFormats?: Record<string, (v: string) => boolean>
) =>
  assertResponseMatchesOpenApi({
    specPath,
    path: '/accounts/1',
    method: 'get',
    status: 200,
    body,
    ...(customFormats ? { customFormats } : {})
  });

describe('request/response parity over a shared schema', () => {
  it('yields the same error path for the same invalid payload', async () => {
    const body = { name: 'Ada', age: '30' };
    const req = await verdict(() => requestWith(body));
    const res = await verdict(() => responseWith(body));

    expect(req).toContain('[body.age]');
    expect(req).toBe(res);
  });

  it('accepts null for a nullable field on both sides', async () => {
    const body = { name: 'Ada', middleName: null };
    await expect(requestWith(body)).resolves.toBeUndefined();
    await expect(responseWith(body)).resolves.toBeUndefined();
  });

  it('applies customFormats identically on both sides', async () => {
    const customFormats = { 'account-code': (v: string) => v.startsWith('AC') };
    const body = { name: 'Ada', token: 'XX' };
    const req = await verdict(() => requestWith(body, customFormats));
    const res = await verdict(() => responseWith(body, customFormats));

    expect(req).toContain('[body.token]');
    expect(req).toBe(res);
  });

  it('reaches the same [body.score] verdict for null under a nullable composition', async () => {
    const body = { name: 'Ada', score: null };
    const req = await verdict(() => requestWith(body));
    const res = await verdict(() => responseWith(body));

    expect(req).toContain('[body.score]');
    expect(req).toBe(res);
  });
});
