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
    });
  });
});
