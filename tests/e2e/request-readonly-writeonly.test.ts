import { describe, expect, it } from 'vitest';
import {
  assertRequestMatchesOpenApi,
  assertResponseMatchesOpenApi
} from '../../src/index.js';

const specPath = 'tests/fixtures/e2e/readwrite-openapi.yaml';

const req = (body: unknown) =>
  assertRequestMatchesOpenApi({
    specPath,
    path: '/users',
    method: 'post',
    body
  });

const res = (body: unknown) =>
  assertResponseMatchesOpenApi({
    specPath,
    path: '/users',
    method: 'post',
    status: 200,
    body
  });

describe('readOnly/writeOnly are direction-dependent (OpenAPI 3.0.3)', () => {
  describe('request direction', () => {
    it('accepts a writeOnly field and does not require a readOnly one', async () => {
      // `id` is readOnly (server-generated) and `password` is writeOnly:
      // exactly what a client sends and omits.
      await expect(
        req({ name: 'Ada', password: 's3cret' })
      ).resolves.toBeUndefined();
    });

    it('rejects a readOnly field that is present ([body.id])', async () => {
      await expect(
        req({ id: '1', name: 'Ada', password: 's3cret' })
      ).rejects.toThrow(/\[body\.id\].*must not be present in the request/i);
    });

    it('still enforces a genuinely required, non-readOnly field ([body.name])', async () => {
      await expect(req({ password: 's3cret' })).rejects.toThrow(
        /\[body\.name\]/
      );
    });

    it('does not require a readOnly field supplied via allOf ([/members])', async () => {
      await expect(
        assertRequestMatchesOpenApi({
          specPath,
          path: '/members',
          method: 'post',
          body: { name: 'Ada' }
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('response direction', () => {
    it('accepts a readOnly field and does not require a writeOnly one', async () => {
      await expect(res({ id: '1', name: 'Ada' })).resolves.toBeUndefined();
    });

    it('rejects a writeOnly field that is present ([body.password])', async () => {
      await expect(
        res({ id: '1', name: 'Ada', password: 's3cret' })
      ).rejects.toThrow(
        /\[body\.password\].*must not be present in the response/i
      );
    });

    it('still enforces a genuinely required, non-writeOnly field ([body.id])', async () => {
      await expect(res({ name: 'Ada' })).rejects.toThrow(/\[body\.id\]/);
    });
  });

  it('the same schema yields different verdicts per direction for the same payload', async () => {
    // A client-shaped payload passes as a request but fails as a response
    // (writeOnly password leaked), proving the verdicts are NOT identical here.
    const clientPayload = { name: 'Ada', password: 's3cret' };
    await expect(req(clientPayload)).resolves.toBeUndefined();
    await expect(res(clientPayload)).rejects.toThrow(/\[body\.password\]/);
  });
});
