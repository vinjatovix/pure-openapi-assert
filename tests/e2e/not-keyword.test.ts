import { describe, it, expect } from 'vitest';
import { assertResponseMatchesOpenAPI } from '../../src/index.js';

describe('assertResponseMatchesOpenAPI - "not" keyword validation E2E', () => {
  describe('Type Negation (/test-type)', () => {
    const specPath = 'tests/fixtures/e2e/not-keyword-type-negation.yaml';

    it('should reject when the payload matches the prohibited type schema', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test-type',
          method: 'GET',
          status: 200,
          body: {
            id: 1,
            status: 123
          }
        })
      ).rejects.toThrow('Value matches prohibited schema');
    });

    it('should accept when the payload does not match the prohibited type schema', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test-type',
          method: 'GET',
          status: 200,
          body: {
            id: 1,
            status: 'active'
          }
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Complex Negation (/test-complex)', () => {
    const specPath = 'tests/fixtures/e2e/not-keyword-complex-negation.yaml';

    it('should reject when the numeric value matches the prohibited minimum limit', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test-complex',
          method: 'GET',
          status: 200,
          body: {
            id: 1,
            amount: 5,
            info: { title: 'No secret here' },
            doubleNegation: 'is-string'
          }
        })
      ).rejects.toThrow('Value matches prohibited schema');
    });

    it('should accept when the numeric value is strictly negative (does not match minimum: 0)', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test-complex',
          method: 'GET',
          status: 200,
          body: {
            id: 1,
            amount: -10,
            info: { title: 'No secret here' },
            doubleNegation: 'is-string'
          }
        })
      ).resolves.not.toThrow();
    });

    it('should reject when the object has the prohibited required secret field', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test-complex',
          method: 'GET',
          status: 200,
          body: {
            id: 1,
            amount: -10,
            info: { title: 'Has secret', secret: 'xyz' },
            doubleNegation: 'is-string'
          }
        })
      ).rejects.toThrow('Value matches prohibited schema');
    });

    it('should reject when double negation is violated (not a string)', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test-complex',
          method: 'GET',
          status: 200,
          body: {
            id: 1,
            amount: -10,
            info: { title: 'No secret' },
            doubleNegation: 123
          }
        })
      ).rejects.toThrow('Value matches prohibited schema');
    });

    it('should accept when double negation is satisfied (is a string)', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test-complex',
          method: 'GET',
          status: 200,
          body: {
            id: 1,
            amount: -10,
            info: { title: 'No secret' },
            doubleNegation: 'correct-string'
          }
        })
      ).resolves.not.toThrow();
    });
  });
});
