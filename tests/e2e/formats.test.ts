import { describe, it, expect } from 'vitest';
import { assertResponseMatchesOpenAPI } from '../../src/index.js';

describe('assertResponseMatchesOpenAPI - Formats E2E', () => {
  const specPath = 'tests/fixtures/e2e/formats.yaml';

  describe('Formats', () => {
    const validPayload = {
      uuid: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      date: '2026-09-09',
      dateTime: '2026-09-09T12:00:00Z',
      ipv4: '192.168.1.1',
      hostname: 'agroapp.local',
      uri: 'https://agroapp.local/v1'
    };

    it('should pass with fully valid formats', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/formats',
          method: 'GET',
          status: 200,
          body: validPayload
        })
      ).resolves.not.toThrow();
    });

    const formatTestCases = [
      {
        field: 'uuid',
        value: 'invalid-uuid',
        format: 'uuid',
        desc: 'invalid UUIDs'
      },
      {
        field: 'email',
        value: 'not-an-email',
        format: 'email',
        desc: 'invalid emails'
      },
      {
        field: 'date',
        value: '2026-02-30',
        format: 'date',
        desc: 'invalid dates (bad semantic date)'
      },
      {
        field: 'dateTime',
        value: '2026-09-09T12:00:00',
        format: 'date-time',
        desc: 'invalid date-times (missing timezone)'
      },
      {
        field: 'ipv4',
        value: '999.999.999.999',
        format: 'ipv4',
        desc: 'invalid IPv4 addresses'
      },
      {
        field: 'hostname',
        value: 'invalid_host@',
        format: 'hostname',
        desc: 'invalid hostnames'
      },
      {
        field: 'uri',
        value: 'not-a-valid-uri',
        format: 'uri',
        desc: 'invalid URIs'
      },
      {
        field: 'date',
        value: 'not-a-date',
        format: 'date',
        desc: 'completely invalid date formats'
      },
      {
        field: 'date',
        value: '2026-13-09',
        format: 'date',
        desc: 'invalid month in strict date check'
      },
      {
        field: 'date',
        value: '2026-09-00',
        format: 'date',
        desc: 'zero day in strict date check'
      }
    ];

    it.each(formatTestCases)(
      'should reject $desc',
      async ({ field, value, format }) => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats',
            method: 'GET',
            status: 200,
            body: { ...validPayload, [field]: value }
          })
        ).rejects.toThrow(
          `Expected string format '${format}', received '${value}'`
        );
      }
    );
  });

  describe('Formats Extended', () => {
    const validPayload = {
      ipv6: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      byte: 'U3BlY2tpdCBpcyBhd2Vzb21lIQ==',
      int32: 2147483647,
      int64: 9007199254740991,
      float: 3.40282e38,
      double: 1.7976931348623157e308
    };

    it('should pass with valid extended formats', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/formats-extended',
          method: 'GET',
          status: 200,
          body: validPayload
        })
      ).resolves.not.toThrow();
    });

    it('should pass with int64 as a valid BigInt string exceeding safe JS limits', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/formats-extended',
          method: 'GET',
          status: 200,
          body: { ...validPayload, int64: '9223372036854775807' }
        })
      ).resolves.not.toThrow();
    });

    it('should validate int64 min/max/multipleOf constraints correctly when string-based', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/formats-extended',
          method: 'GET',
          status: 200,
          body: { ...validPayload, int64: '10' }
        })
      ).resolves.not.toThrow();
    });

    const extendedFormatTestCases = [
      {
        field: 'ipv6',
        value: '2001:db8::invalid',
        expectedError:
          "Expected string format 'ipv6', received '2001:db8::invalid'",
        desc: 'invalid IPv6 addresses'
      },
      {
        field: 'byte',
        value: 'Not-Base64!!!',
        expectedError:
          "Expected string format 'byte', received 'Not-Base64!!!'",
        desc: 'invalid Base64 byte strings'
      },
      {
        field: 'int32',
        value: 2147483648,
        expectedError: 'Expected 32-bit integer, received 2147483648',
        desc: 'invalid int32 out of range'
      },
      {
        field: 'int64',
        value: '9223372036854775808',
        expectedError:
          'Value 9223372036854775808 exceeds 64-bit integer limits',
        desc: 'invalid int64 out of range (string)'
      },
      {
        field: 'float',
        value: 4e38,
        expectedError: 'Expected 32-bit float, received 4e+38',
        desc: 'invalid float exceeding 32-bit float limits'
      },
      {
        field: 'int32',
        value: 'not-a-number',
        expectedError: 'Expected integer, received string',
        desc: 'non-number for int32'
      },
      {
        field: 'int64',
        value: true,
        expectedError: 'Expected integer, received boolean',
        desc: 'non-number/non-string for int64'
      },
      {
        field: 'float',
        value: 'not-a-number',
        expectedError: 'Expected number, received string',
        desc: 'non-number for float'
      },
      {
        field: 'double',
        value: 'not-a-number',
        expectedError: 'Expected number, received string',
        desc: 'non-number for double'
      },
      {
        field: 'int64',
        value: 'not-a-valid-int',
        expectedError: 'Expected integer, received string',
        desc: 'invalid string for int64'
      },
      {
        field: 'int64',
        value: '-9223372036854775809',
        expectedError:
          'Value -9223372036854775809 exceeds 64-bit integer limits',
        desc: 'strict int64 bounds violating minimum'
      }
    ];

    it.each(extendedFormatTestCases)(
      'should reject $desc',
      async ({ field, value, expectedError }) => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats-extended',
            method: 'GET',
            status: 200,
            body: { ...validPayload, [field]: value }
          })
        ).rejects.toThrow(expectedError);
      }
    );
  });

  describe('Custom Formats Validation', () => {
    it('should pass with custom formats when the custom validator resolves to true', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/formats',
          method: 'GET',
          status: 200,
          body: {
            uuid: 'custom-prefix-12345',
            email: 'test@example.com',
            date: '2026-09-09',
            dateTime: '2026-09-09T12:00:00Z',
            ipv4: '192.168.1.1',
            hostname: 'agroapp.local',
            uri: 'https://agroapp.local/v1'
          },
          customFormats: {
            uuid: (val) => val.startsWith('custom-prefix-')
          }
        })
      ).resolves.not.toThrow();
    });

    it('should reject when custom formats validation resolves to false', async () => {
      await expect(
        assertResponseMatchesOpenAPI({
          specPath,
          path: '/test/formats',
          method: 'GET',
          status: 200,
          body: {
            uuid: 'bad-prefix-12345',
            email: 'test@example.com',
            date: '2026-09-09',
            dateTime: '2026-09-09T12:00:00Z',
            ipv4: '192.168.1.1',
            hostname: 'agroapp.local',
            uri: 'https://agroapp.local/v1'
          },
          customFormats: {
            uuid: (val) => val.startsWith('custom-prefix-')
          }
        })
      ).rejects.toThrow(
        "Expected string format 'uuid', received 'bad-prefix-12345'"
      );
    });
  });

  describe('Numeric Format Constraint Fallbacks (no explicit type in schema)', () => {
    const fallbackTestCases = [
      {
        path: '/test/formats/no-type/int32',
        body: { field: 'not-a-number-string' },
        error: 'Expected 32-bit integer, received string',
        desc: 'int32 format check (string)'
      },
      {
        path: '/test/formats/no-type/int32',
        body: { field: true },
        error: 'Expected 32-bit integer, received boolean',
        desc: 'int32 format check (boolean)'
      },
      {
        path: '/test/formats/no-type/int64',
        body: { field: '9223372036854775808' },
        error: 'Value 9223372036854775808 exceeds 64-bit integer limits',
        desc: 'int64 format check (string out of range)'
      },
      {
        path: '/test/formats/no-type/int64',
        // eslint-disable-next-line no-loss-of-precision
        body: { field: 9999999999999999 },
        error: 'Expected 64-bit integer, received 10000000000000000',
        desc: 'int64 format check (number out of range)'
      },
      {
        path: '/test/formats/no-type/float',
        body: { field: 'not-a-number-string' },
        error: 'Expected 32-bit float, received string',
        desc: 'float format check'
      },
      {
        path: '/test/formats/no-type/double',
        body: { field: 'not-a-number-string' },
        error: 'Expected 64-bit float, received not-a-number-string',
        desc: 'double format check'
      }
    ];

    it.each(fallbackTestCases)(
      'should validate $desc correctly without type in schema',
      async ({ path, body, error }) => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path,
            method: 'GET',
            status: 200,
            body
          })
        ).rejects.toThrow(error);
      }
    );
  });
});
