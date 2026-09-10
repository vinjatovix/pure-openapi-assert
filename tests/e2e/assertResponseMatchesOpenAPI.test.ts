import { assertResponseMatchesOpenAPI } from '../../src/index.js';

describe('assertResponseMatchesOpenAPI', () => {
  describe('Exhaustive Validation Specs (mock-openapi.yaml)', () => {
    const specPath = 'tests/fixtures/mock-openapi.yaml';

    describe('Formats (/test/formats)', () => {
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

      it('should reject invalid UUIDs', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats',
            method: 'GET',
            status: 200,
            body: { ...validPayload, uuid: 'invalid-uuid' }
          })
        ).rejects.toThrow(
          "Expected string format 'uuid', received 'invalid-uuid'"
        );
      });

      it('should reject invalid emails', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats',
            method: 'GET',
            status: 200,
            body: { ...validPayload, email: 'not-an-email' }
          })
        ).rejects.toThrow(
          "Expected string format 'email', received 'not-an-email'"
        );
      });

      it('should reject invalid dates', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats',
            method: 'GET',
            status: 200,
            body: { ...validPayload, date: '2026-02-30' } // Bad semantic date
          })
        ).rejects.toThrow(
          "Expected string format 'date', received '2026-02-30'"
        );
      });

      it('should reject invalid date-times', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats',
            method: 'GET',
            status: 200,
            body: { ...validPayload, dateTime: '2026-09-09T12:00:00' } // Missing timezone
          })
        ).rejects.toThrow(
          "Expected string format 'date-time', received '2026-09-09T12:00:00'"
        );
      });

      it('should reject invalid IPv4 addresses', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats',
            method: 'GET',
            status: 200,
            body: { ...validPayload, ipv4: '999.999.999.999' }
          })
        ).rejects.toThrow(
          "Expected string format 'ipv4', received '999.999.999.999'"
        );
      });

      it('should reject invalid hostnames', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats',
            method: 'GET',
            status: 200,
            body: { ...validPayload, hostname: 'invalid_host@' }
          })
        ).rejects.toThrow(
          "Expected string format 'hostname', received 'invalid_host@'"
        );
      });

      it('should reject invalid URIs', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats',
            method: 'GET',
            status: 200,
            body: { ...validPayload, uri: 'not-a-valid-uri' }
          })
        ).rejects.toThrow(
          "Expected string format 'uri', received 'not-a-valid-uri'"
        );
      });

      it('should reject completely invalid date formats in strict date check', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats',
            method: 'GET',
            status: 200,
            body: { ...validPayload, date: 'not-a-date' }
          })
        ).rejects.toThrow(
          "Expected string format 'date', received 'not-a-date'"
        );
      });
    });

    describe('Formats Extended (/test/formats-extended)', () => {
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

      it('should reject invalid IPv6 addresses', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats-extended',
            method: 'GET',
            status: 200,
            body: { ...validPayload, ipv6: '2001:db8::invalid' }
          })
        ).rejects.toThrow(
          "Expected string format 'ipv6', received '2001:db8::invalid'"
        );
      });

      it('should reject invalid Base64 byte strings', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats-extended',
            method: 'GET',
            status: 200,
            body: { ...validPayload, byte: 'Not-Base64!!!' }
          })
        ).rejects.toThrow(
          "Expected string format 'byte', received 'Not-Base64!!!'"
        );
      });

      it('should reject invalid int32 out of range', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats-extended',
            method: 'GET',
            status: 200,
            body: { ...validPayload, int32: 2147483648 }
          })
        ).rejects.toThrow('Expected 32-bit integer, received 2147483648');
      });

      it('should reject invalid int64 out of range (string)', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats-extended',
            method: 'GET',
            status: 200,
            body: { ...validPayload, int64: '9223372036854775808' }
          })
        ).rejects.toThrow(
          'Value 9223372036854775808 exceeds 64-bit integer limits'
        );
      });

      it('should reject invalid float exceeding 32-bit float limits', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats-extended',
            method: 'GET',
            status: 200,
            body: { ...validPayload, float: 4e38 }
          })
        ).rejects.toThrow('Expected 32-bit float, received 4e+38');
      });
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

    describe('Numeric Constraints (/test/constraints/numbers)', () => {
      const validPayload = {
        valMin: 10,
        valMax: 100,
        valExMin: 6,
        valExMax: 49,
        valMultiple: 7.5
      };

      it('should pass with valid numeric bounds', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/constraints/numbers',
            method: 'GET',
            status: 200,
            body: validPayload
          })
        ).resolves.not.toThrow();
      });

      it('should reject values below minimum', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/constraints/numbers',
            method: 'GET',
            status: 200,
            body: { ...validPayload, valMin: 9 }
          })
        ).rejects.toThrow('Value 9 is less than minimum 10');
      });

      it('should reject values above maximum', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/constraints/numbers',
            method: 'GET',
            status: 200,
            body: { ...validPayload, valMax: 101 }
          })
        ).rejects.toThrow('Value 101 is greater than maximum 100');
      });

      it('should reject values breaking exclusiveMinimum', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/constraints/numbers',
            method: 'GET',
            status: 200,
            body: { ...validPayload, valExMin: 5 }
          })
        ).rejects.toThrow('Value 5 is less than or equal to minimum 5');
      });

      it('should reject values breaking exclusiveMaximum', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/constraints/numbers',
            method: 'GET',
            status: 200,
            body: { ...validPayload, valExMax: 50 }
          })
        ).rejects.toThrow('Value 50 is greater than or equal to maximum 50');
      });

      it('should reject values that are not multiples of multipleOf', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/constraints/numbers',
            method: 'GET',
            status: 200,
            body: { ...validPayload, valMultiple: 6.2 }
          })
        ).rejects.toThrow('Value 6.2 is not a multiple of 2.5');
      });
    });

    describe('String Constraints (/test/constraints/strings)', () => {
      it('should pass with valid string constraints', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/constraints/strings',
            method: 'GET',
            status: 200,
            body: { valStr: 'hello' }
          })
        ).resolves.not.toThrow();
      });

      it('should reject strings that are too short', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/constraints/strings',
            method: 'GET',
            status: 200,
            body: { valStr: 'ab' }
          })
        ).rejects.toThrow('String length 2 is less than minimum 3');
      });

      it('should reject strings that are too long', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/constraints/strings',
            method: 'GET',
            status: 200,
            body: { valStr: 'abcdefghijkl' }
          })
        ).rejects.toThrow('String length 12 exceeds maximum 10');
      });

      it('should reject strings that do not match the regex pattern', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/constraints/strings',
            method: 'GET',
            status: 200,
            body: { valStr: 'hello12' }
          })
        ).rejects.toThrow('String does not match pattern ^[a-z]+$');
      });
    });

    describe('Array Constraints (/test/constraints/arrays)', () => {
      it('should pass with valid array constraints', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/constraints/arrays',
            method: 'GET',
            status: 200,
            body: { valArr: ['one', 'two'] }
          })
        ).resolves.not.toThrow();
      });

      it('should reject arrays with duplicate items when uniqueItems is true', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/constraints/arrays',
            method: 'GET',
            status: 200,
            body: { valArr: ['one', 'one'] }
          })
        ).rejects.toThrow('Array elements must be unique');
      });

      it('should reject arrays with too few items', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/constraints/arrays',
            method: 'GET',
            status: 200,
            body: { valArr: ['one'] }
          })
        ).rejects.toThrow('Array has 1 items, minimum is 2');
      });

      it('should reject arrays with too many items', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/constraints/arrays',
            method: 'GET',
            status: 200,
            body: { valArr: ['one', 'two', 'three', 'four', 'five'] }
          })
        ).rejects.toThrow('Array has 5 items, maximum is 4');
      });
    });

    describe('Objects & Additional Properties (/test/objects/*)', () => {
      it('should pass when allowed additional fields match schema', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/objects/additional-schema',
            method: 'GET',
            status: 200,
            body: {
              declaredField: 'base',
              customField1: { nestedVal: 42 }
            }
          })
        ).resolves.not.toThrow();
      });

      it('should reject when additional fields violate their nested schema', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/objects/additional-schema',
            method: 'GET',
            status: 200,
            body: {
              declaredField: 'base',
              customField1: { nestedVal: 'not-a-number' }
            }
          })
        ).rejects.toThrow(
          '- [body.customField1.nestedVal] Expected number, received string'
        );
      });

      it('should reject additional fields when additionalProperties is false', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/objects/strict',
            method: 'GET',
            status: 200,
            body: {
              allowedField: 'yes',
              forbiddenField: 'no'
            }
          })
        ).rejects.toThrow(
          "Key 'forbiddenField' is not allowed by OpenAPI schema"
        );
      });
    });

    describe('Polymorphism anyOf Tree Reporting (/test/polymorphism/anyof)', () => {
      it('should pass if matching at least one valid anyOf branch', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/polymorphism/anyof',
            method: 'GET',
            status: 200,
            body: { poly: { type: 'A', valA: 'hello' } }
          })
        ).resolves.not.toThrow();

        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/polymorphism/anyof',
            method: 'GET',
            status: 200,
            body: { poly: { type: 'B', valB: 123 } }
          })
        ).resolves.not.toThrow();
      });

      it('should output a detailed tree of errors showing all failing branches', async () => {
        const invalidPayload = {
          poly: {
            type: 'C',
            valA: 123, // should be string
            valB: 'hello' // should be number
          }
        };

        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/polymorphism/anyof',
            method: 'GET',
            status: 200,
            body: invalidPayload
          })
        ).rejects.toThrow(
          'Failed anyOf:\n' +
            '  ├─ Branch 1:\n' +
            '  │    [body.poly.type] Expected one of [A], received "C"\n' +
            '  │    [body.poly.valA] Expected string, received number\n' +
            '  └─ Branch 2:\n' +
            '       [body.poly.type] Expected one of [B], received "C"\n' +
            '       [body.poly.valB] Expected number, received string'
        );
      });
    });

    describe('Polymorphism oneOf Constraints (/test/polymorphism/oneof)', () => {
      it('should pass if matching exactly one oneOf branch', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/polymorphism/oneof',
            method: 'GET',
            status: 200,
            body: { poly: { isX: true } }
          })
        ).resolves.not.toThrow();
      });

      it('should reject if matching more than one oneOf branch', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/polymorphism/oneof',
            method: 'GET',
            status: 200,
            body: { poly: { isX: true, isY: false } } // matches both schemas
          })
        ).rejects.toThrow(
          "Value matches 2 schemas from 'oneOf' (expected exactly 1)"
        );
      });

      it('should reject if matching zero oneOf branches', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/polymorphism/oneof',
            method: 'GET',
            status: 200,
            body: { poly: { unrelated: true } }
          })
        ).rejects.toThrow(
          "Value matches 0 schemas from 'oneOf' (expected exactly 1)"
        );
      });
    });

    describe('Polymorphism allOf Constraints (/test/polymorphism/allof)', () => {
      it('should pass if matching all schemas in allOf', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/polymorphism/allof',
            method: 'GET',
            status: 200,
            body: {
              poly: {
                baseField: 'valid',
                extraField: 42
              }
            }
          })
        ).resolves.not.toThrow();
      });

      it('should reject if any schema in allOf is violated', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/polymorphism/allof',
            method: 'GET',
            status: 200,
            body: {
              poly: {
                baseField: 'valid' // missing extraField
              }
            }
          })
        ).rejects.toThrow('[body.poly.extraField] Missing required field');
      });
    });

    describe('Nested & Nullable Constraints (/test/nested)', () => {
      const validNestedResponse = {
        items: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Nested Item',
            description: 'A test nested item',
            tags: ['test', 'nested'],
            aliases: ['item-alias'],
            metadata: {
              creator: 'test-user',
              version: 1.2
            }
          }
        ],
        pagination: {
          total: 1
        }
      };

      it('should pass if a nested object with arrays matches the schema perfectly', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/nested',
            method: 'GET',
            status: 200,
            body: validNestedResponse
          })
        ).resolves.not.toThrow();
      });

      it('should pass if optional nested structures are null or missing and allowed by schema', async () => {
        const responseWithNulls = {
          ...validNestedResponse,
          items: [
            {
              ...validNestedResponse.items[0],
              aliases: null,
              metadata: null
            }
          ]
        };

        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/nested',
            method: 'GET',
            status: 200,
            body: responseWithNulls
          })
        ).resolves.not.toThrow();
      });

      it('should throw an error if items is not an array (type validation)', async () => {
        const invalidResponse = {
          ...validNestedResponse,
          items: 'not-an-array'
        };

        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/nested',
            method: 'GET',
            status: 200,
            body: invalidResponse
          })
        ).rejects.toThrow(
          'OpenAPI contract violation for GET /test/nested 200.\nValidation errors:\n- [body.items] Expected array, received string'
        );
      });

      it('should throw an error with detailed path if a nested element in an array has a missing required field', async () => {
        const invalidResponse = {
          ...validNestedResponse,
          items: [
            {
              id: '123e4567-e89b-12d3-a456-426614174000',
              tags: ['test']
            }
          ]
        };

        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/nested',
            method: 'GET',
            status: 200,
            body: invalidResponse
          })
        ).rejects.toThrow(
          'OpenAPI contract violation for GET /test/nested 200.\nValidation errors:\n- [body.items[0].name] Missing required field'
        );
      });

      it('should throw an error if a deep nested field has an invalid type', async () => {
        const invalidResponse = {
          ...validNestedResponse,
          items: [
            {
              ...validNestedResponse.items[0],
              metadata: {
                creator: 'test-user',
                version: 'not-a-number'
              }
            }
          ]
        };

        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/nested',
            method: 'GET',
            status: 200,
            body: invalidResponse
          })
        ).rejects.toThrow(
          'OpenAPI contract violation for GET /test/nested 200.\nValidation errors:\n- [body.items[0].metadata.version] Expected number, received string'
        );
      });

      it('should throw an error if a nullable field has an invalid type instead of null or its schema', async () => {
        const invalidResponse = {
          ...validNestedResponse,
          items: [
            {
              ...validNestedResponse.items[0],
              aliases: 12345
            }
          ]
        };

        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/nested',
            method: 'GET',
            status: 200,
            body: invalidResponse
          })
        ).rejects.toThrow(
          'OpenAPI contract violation for GET /test/nested 200.\nValidation errors:\n- [body.items[0].aliases] Expected array, received number'
        );
      });

      it('should throw an error if a field does not match its expected format (e.g. invalid UUID)', async () => {
        const invalidResponse = {
          ...validNestedResponse,
          items: [
            {
              ...validNestedResponse.items[0],
              id: 'not-a-valid-uuid'
            }
          ]
        };

        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/nested',
            method: 'GET',
            status: 200,
            body: invalidResponse
          })
        ).rejects.toThrow(
          "OpenAPI contract violation for GET /test/nested 200.\nValidation errors:\n- [body.items[0].id] Expected string format 'uuid', received 'not-a-valid-uuid'"
        );
      });
    });

    describe('Uncovered Edge Cases', () => {
      const validExtendedPayload = {
        ipv6: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        byte: 'U3BlY2tpdCBpcyBhd2Vzb21lIQ==',
        int32: 2147483647,
        int64: 9007199254740991,
        float: 3.40282e38,
        double: 1.7976931348623157e308
      };

      it('should throw an error if validateArray receives a non-array', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/constraints/arrays',
            method: 'GET',
            status: 200,
            body: { valArr: 'not-an-array' }
          })
        ).rejects.toThrow('Expected array, received string');
      });

      it('should throw an error if validateObject receives a non-object', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/objects/strict',
            method: 'GET',
            status: 200,
            body: 'not-an-object'
          })
        ).rejects.toThrow('Expected object, received string');
      });

      it('should throw an error if validateNumberFormatConstraint receives a non-number for int32', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats-extended',
            method: 'GET',
            status: 200,
            body: { ...validExtendedPayload, int32: 'not-a-number' }
          })
        ).rejects.toThrow('Expected integer, received string');
      });

      it('should throw an error if validateNumberFormatConstraint receives a non-number/non-string for int64', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats-extended',
            method: 'GET',
            status: 200,
            body: { ...validExtendedPayload, int64: true }
          })
        ).rejects.toThrow('Expected integer, received boolean');
      });

      it('should throw an error if validateNumberFormatConstraint receives a non-number for float', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats-extended',
            method: 'GET',
            status: 200,
            body: { ...validExtendedPayload, float: 'not-a-number' }
          })
        ).rejects.toThrow('Expected number, received string');
      });

      it('should throw an error if validateNumberFormatConstraint receives a non-number for double', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats-extended',
            method: 'GET',
            status: 200,
            body: { ...validExtendedPayload, double: 'not-a-number' }
          })
        ).rejects.toThrow('Expected number, received string');
      });

      it('should throw an error if validateNumberFormatConstraint receives an invalid string for int64', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats-extended',
            method: 'GET',
            status: 200,
            body: { ...validExtendedPayload, int64: 'not-a-valid-int' }
          })
        ).rejects.toThrow('Expected integer, received string');
      });

      it('should reject with strict int64 bounds violating minimum', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats-extended',
            method: 'GET',
            status: 200,
            body: { ...validExtendedPayload, int64: '-9223372036854775809' } // less than signed 64-bit min
          })
        ).rejects.toThrow(
          'Value -9223372036854775809 exceeds 64-bit integer limits'
        );
      });

      it('should validate int64 min/max/multipleOf constraints correctly when string-based', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats-extended',
            method: 'GET',
            status: 200,
            body: { ...validExtendedPayload, int64: '10' }
          })
        ).resolves.not.toThrow();
      });
    });

    describe('Specific Coverage Gap Assertions', () => {
      it('should fail with invalid month in strict date check', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats',
            method: 'GET',
            status: 200,
            body: {
              uuid: '123e4567-e89b-12d3-a456-426614174000',
              email: 'test@example.com',
              date: '2026-13-09',
              dateTime: '2026-09-09T12:00:00Z',
              ipv4: '192.168.1.1',
              hostname: 'agroapp.local',
              uri: 'https://agroapp.local/v1'
            }
          })
        ).rejects.toThrow(
          "Expected string format 'date', received '2026-13-09'"
        );
      });

      it('should fail with zero day in strict date check', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats',
            method: 'GET',
            status: 200,
            body: {
              uuid: '123e4567-e89b-12d3-a456-426614174000',
              email: 'test@example.com',
              date: '2026-09-00',
              dateTime: '2026-09-09T12:00:00Z',
              ipv4: '192.168.1.1',
              hostname: 'agroapp.local',
              uri: 'https://agroapp.local/v1'
            }
          })
        ).rejects.toThrow(
          "Expected string format 'date', received '2026-09-00'"
        );
      });

      it('should throw an error if a writeOnly field is present in response', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/validation/write-only',
            method: 'GET',
            status: 200,
            body: { field: 'any-value' }
          })
        ).rejects.toThrow(
          'Field is writeOnly and must not be present in the response'
        );
      });

      it('should pass if a nullable field is true and received null', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/validation/nullable',
            method: 'GET',
            status: 200,
            body: { field: null }
          })
        ).resolves.not.toThrow();
      });

      it('should validate int32 format constraint without a specified type in schema', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats/no-type/int32',
            method: 'GET',
            status: 200,
            body: { field: 'not-a-number-string' }
          })
        ).rejects.toThrow('Expected 32-bit integer, received string');
      });

      it('should validate int64 format constraint without a specified type in schema (string)', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats/no-type/int64',
            method: 'GET',
            status: 200,
            body: { field: '9223372036854775808' }
          })
        ).rejects.toThrow(
          'Value 9223372036854775808 exceeds 64-bit integer limits'
        );
      });

      it('should validate int64 format constraint without a type (number out of range)', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats/no-type/int64',
            method: 'GET',
            status: 200,
            // eslint-disable-next-line no-loss-of-precision
            body: { field: 9999999999999999 }
          })
        ).rejects.toThrow(
          'Expected 64-bit integer, received 10000000000000000'
        );
      });

      it('should validate float format constraint without a specified type in schema', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats/no-type/float',
            method: 'GET',
            status: 200,
            body: { field: 'not-a-number-string' }
          })
        ).rejects.toThrow('Expected 32-bit float, received string');
      });

      it('should validate double format constraint without a specified type in schema', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats/no-type/double',
            method: 'GET',
            status: 200,
            body: { field: 'not-a-number-string' }
          })
        ).rejects.toThrow(
          'Expected 64-bit float, received not-a-number-string'
        );
      });

      it('should ignore invalid minimum schema configuration gracefully', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/validation/invalid-minimum',
            method: 'GET',
            status: 200,
            body: { field: '10' }
          })
        ).resolves.not.toThrow();
      });

      it('should ignore invalid maximum schema configuration gracefully', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/validation/invalid-maximum',
            method: 'GET',
            status: 200,
            body: { field: '10' }
          })
        ).resolves.not.toThrow();
      });

      it('should ignore invalid multipleof schema configuration gracefully', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/validation/invalid-multipleof',
            method: 'GET',
            status: 200,
            body: { field: '10' }
          })
        ).resolves.not.toThrow();
      });

      it('should pass if string-based int64 satisfies valid bigint constraints', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/validation/bigint-constraints',
            method: 'GET',
            status: 200,
            body: { field: '50' }
          })
        ).resolves.not.toThrow();
      });

      it('should reject if string-based int64 violates bigint minimum', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/validation/bigint-constraints',
            method: 'GET',
            status: 200,
            body: { field: '5' }
          })
        ).rejects.toThrow('Value 5 is less than minimum 10');
      });

      it('should reject if string-based int64 violates bigint maximum', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/validation/bigint-constraints',
            method: 'GET',
            status: 200,
            body: { field: '150' }
          })
        ).rejects.toThrow('Value 150 is greater than maximum 100');
      });

      it('should reject if string-based int64 violates bigint multipleOf', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/validation/bigint-constraints',
            method: 'GET',
            status: 200,
            body: { field: '23' }
          })
        ).rejects.toThrow('Value 23 is not a multiple of 5');
      });

      it('should pass and resolve reference schemas inside polymorphism ref-object successfully', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/polymorphism/ref-object',
            method: 'GET',
            status: 200,
            body: { poly: { name: 'Simple User Object' } }
          })
        ).resolves.not.toThrow();
      });
    });

    describe('OpenAPI Router and Loader Coverage Gaps', () => {
      it('should throw an error when parsing an invalid OpenAPI spec (falsy paths)', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath: 'tests/fixtures/invalid-openapi.yaml',
            path: '/any',
            method: 'GET',
            status: 200,
            body: {}
          })
        ).rejects.toThrow('Parsed OpenAPI spec is invalid');
      });

      it('should throw an error when parsing an OpenAPI spec missing the openapi version field', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath: 'tests/fixtures/missing-openapi-version.yaml',
            path: '/any',
            method: 'GET',
            status: 200,
            body: {}
          })
        ).rejects.toThrow('Parsed OpenAPI spec is invalid');
      });

      it('should throw an error when parsing an OpenAPI spec missing the info object field', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath: 'tests/fixtures/missing-info-object.yaml',
            path: '/any',
            method: 'GET',
            status: 200,
            body: {}
          })
        ).rejects.toThrow('Parsed OpenAPI spec is invalid');
      });

      it('should throw an error when parsing an OpenAPI spec that is a primitive string', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath: 'tests/fixtures/primitive-openapi.yaml',
            path: '/any',
            method: 'GET',
            status: 200,
            body: {}
          })
        ).rejects.toThrow('Parsed OpenAPI spec is invalid');
      });

      it('should throw an error when parsing an empty OpenAPI spec', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath: 'tests/fixtures/null-openapi.yaml',
            path: '/any',
            method: 'GET',
            status: 200,
            body: {}
          })
        ).rejects.toThrow('Parsed OpenAPI spec is invalid');
      });

      it('should throw an error when requesting a non-existent path in spec', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/non-existent-path',
            method: 'GET',
            status: 200,
            body: {}
          })
        ).rejects.toThrow('Path not found in OpenAPI: /test/non-existent-path');
      });

      it('should throw an error when requesting an invalid method for an existing path', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats',
            method: 'POST',
            status: 200,
            body: {}
          })
        ).rejects.toThrow('Operation not found: POST /test/formats');
      });

      it('should throw an error when requesting an unmatched status code response', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats',
            method: 'GET',
            status: 500,
            body: {}
          })
        ).rejects.toThrow('Response not found: GET /test/formats 500');
      });

      it('should throw an error when requesting a response status with no schema defined', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/formats-extended',
            method: 'GET',
            status: 201,
            body: {}
          })
        ).rejects.toThrow('No schema found for GET /test/formats-extended 201');
      });

      it('should resolve successfully for a dynamic path and hits the path regex cache on second query', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/dynamic/user123',
            method: 'GET',
            status: 200,
            body: { id: 'user123' }
          })
        ).resolves.not.toThrow();

        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/dynamic/user123',
            method: 'GET',
            status: 200,
            body: { id: 'user123' }
          })
        ).resolves.not.toThrow();
      });
    });

    describe('HTTP 204 Early Validation', () => {
      it('should pass if 204 status has an undefined body', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath: 'any',
            path: '/any',
            method: 'GET',
            status: 204,
            body: undefined
          })
        ).resolves.not.toThrow();
      });

      it('should pass if 204 status has a null body', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath: 'any',
            path: '/any',
            method: 'GET',
            status: 204,
            body: null
          })
        ).resolves.not.toThrow();
      });

      it('should pass if 204 status has an empty object body', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath: 'any',
            path: '/any',
            method: 'GET',
            status: 204,
            body: {}
          })
        ).resolves.not.toThrow();
      });

      it('should throw if 204 status has a non-empty body', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath: 'any',
            path: '/any',
            method: 'GET',
            status: 204,
            body: { hasContent: true }
          })
        ).rejects.toThrow('204 must have empty body');
      });

      it('should throw if 204 status has a non-empty string body', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath: 'any',
            path: '/any',
            method: 'GET',
            status: 204,
            body: 'non-empty-string'
          })
        ).rejects.toThrow('204 must have empty body');
      });
    });
  });
});
