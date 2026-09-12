import { type MockInstance, vi } from 'vitest';
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

      const formatTestCases = [
        { field: 'uuid', value: 'invalid-uuid', format: 'uuid', desc: 'invalid UUIDs' },
        { field: 'email', value: 'not-an-email', format: 'email', desc: 'invalid emails' },
        { field: 'date', value: '2026-02-30', format: 'date', desc: 'invalid dates (bad semantic date)' },
        { field: 'dateTime', value: '2026-09-09T12:00:00', format: 'date-time', desc: 'invalid date-times (missing timezone)' },
        { field: 'ipv4', value: '999.999.999.999', format: 'ipv4', desc: 'invalid IPv4 addresses' },
        { field: 'hostname', value: 'invalid_host@', format: 'hostname', desc: 'invalid hostnames' },
        { field: 'uri', value: 'not-a-valid-uri', format: 'uri', desc: 'invalid URIs' },
        { field: 'date', value: 'not-a-date', format: 'date', desc: 'completely invalid date formats' },
        { field: 'date', value: '2026-13-09', format: 'date', desc: 'invalid month in strict date check' },
        { field: 'date', value: '2026-09-00', format: 'date', desc: 'zero day in strict date check' }
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
        { field: 'ipv6', value: '2001:db8::invalid', expectedError: "Expected string format 'ipv6', received '2001:db8::invalid'", desc: 'invalid IPv6 addresses' },
        { field: 'byte', value: 'Not-Base64!!!', expectedError: "Expected string format 'byte', received 'Not-Base64!!!'", desc: 'invalid Base64 byte strings' },
        { field: 'int32', value: 2147483648, expectedError: 'Expected 32-bit integer, received 2147483648', desc: 'invalid int32 out of range' },
        { field: 'int64', value: '9223372036854775808', expectedError: 'Value 9223372036854775808 exceeds 64-bit integer limits', desc: 'invalid int64 out of range (string)' },
        { field: 'float', value: 4e38, expectedError: 'Expected 32-bit float, received 4e+38', desc: 'invalid float exceeding 32-bit float limits' },
        { field: 'int32', value: 'not-a-number', expectedError: 'Expected integer, received string', desc: 'non-number for int32' },
        { field: 'int64', value: true, expectedError: 'Expected integer, received boolean', desc: 'non-number/non-string for int64' },
        { field: 'float', value: 'not-a-number', expectedError: 'Expected number, received string', desc: 'non-number for float' },
        { field: 'double', value: 'not-a-number', expectedError: 'Expected number, received string', desc: 'non-number for double' },
        { field: 'int64', value: 'not-a-valid-int', expectedError: 'Expected integer, received string', desc: 'invalid string for int64' },
        { field: 'int64', value: '-9223372036854775809', expectedError: 'Value -9223372036854775809 exceeds 64-bit integer limits', desc: 'strict int64 bounds violating minimum' }
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
    });

    describe('Array of Objects Constraints (/test/constraints/arrays-objects)', () => {
      it('should pass with unique object structures', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/constraints/arrays-objects',
            method: 'GET',
            status: 200,
            body: {
              valArr: [
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Bob' }
              ]
            }
          })
        ).resolves.not.toThrow();
      });

      it('should reject non-unique object structures', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/constraints/arrays-objects',
            method: 'GET',
            status: 200,
            body: {
              valArr: [
                { id: 1, name: 'Alice' },
                { id: 1, name: 'Alice' }
              ]
            }
          })
        ).rejects.toThrow('Array elements must be unique');
      });

      it('should safely validate uniqueness with circular objects and reject structurally identical ones without infinite recursion', async () => {
        const cyclicObj1 = { name: 'cyclic', self: {} as unknown };
        cyclicObj1.self = cyclicObj1;

        const cyclicObj2 = { name: 'cyclic', self: {} as unknown };
        cyclicObj2.self = cyclicObj2;

        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/constraints/arrays-objects',
            method: 'GET',
            status: 200,
            body: {
              valArr: [cyclicObj1, cyclicObj2]
            }
          })
        ).rejects.toThrow('Array elements must be unique');
      });

      it('should pass when circular objects are structurally distinct', async () => {
        const cyclicObj1 = { name: 'cyclic-1', self: {} as unknown };
        cyclicObj1.self = cyclicObj1;

        const cyclicObj2 = { name: 'cyclic-2', self: {} as unknown };
        cyclicObj2.self = cyclicObj2;

        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/constraints/arrays-objects',
            method: 'GET',
            status: 200,
            body: {
              valArr: [cyclicObj1, cyclicObj2]
            }
          })
        ).resolves.not.toThrow();
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

    describe('Polymorphism oneOf with Discriminator Mapping (/test/polymorphism/discriminator)', () => {
      it('should pass if matching the exact dog schema via discriminator', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/polymorphism/discriminator',
            method: 'POST',
            status: 200,
            body: { poly: { petType: 'dog', barkVolume: 5 } }
          })
        ).resolves.not.toThrow();
      });

      it('should pass if matching the exact cat schema via discriminator', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/polymorphism/discriminator',
            method: 'POST',
            status: 200,
            body: { poly: { petType: 'cat', nestsCount: 3 } }
          })
        ).resolves.not.toThrow();
      });

      it('should report the specific error of the selected branch (Dog) if validation fails', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/polymorphism/discriminator',
            method: 'POST',
            status: 200,
            body: { poly: { petType: 'dog', barkVolume: 'loud' } } // barkVolume should be integer
          })
        ).rejects.toThrow(
          '[body.poly.barkVolume] Expected integer, received string'
        );
      });

      it('should report the specific error of the selected branch (Cat) if validation fails', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/polymorphism/discriminator',
            method: 'POST',
            status: 200,
            body: { poly: { petType: 'cat', nestsCount: 'many' } } // nestsCount should be integer
          })
        ).rejects.toThrow(
          '[body.poly.nestsCount] Expected integer, received string'
        );
      });

      it('should reject with a clear error if the discriminator property value is invalid/unmapped', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/polymorphism/discriminator',
            method: 'POST',
            status: 200,
            body: { poly: { petType: 'bird', nestsCount: 2 } }
          })
        ).rejects.toThrow(
          "Discriminator 'petType' value 'bird' does not match any schema in 'oneOf'"
        );
      });

      it('should fail if the resolved branch constraints are violated (polymorphic const check)', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/polymorphism/discriminator',
            method: 'POST',
            status: 200,
            body: { poly: { petType: 'puppy', barkVolume: 5 } }
          })
        ).rejects.toThrow(
          '[body.poly.petType] Expected exactly "dog", received "puppy"'
        );
      });
    });

    describe('Polymorphism anyOf with Discriminator Mapping (/test/polymorphism/discriminator-anyof)', () => {
      it('should pass if matching the exact car schema via discriminator', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/polymorphism/discriminator-anyof',
            method: 'POST',
            status: 200,
            body: { poly: { vehicleType: 'car', doors: 4 } }
          })
        ).resolves.not.toThrow();
      });

      it('should report the specific error of the selected branch (Truck) if validation fails', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/polymorphism/discriminator-anyof',
            method: 'POST',
            status: 200,
            body: { poly: { vehicleType: 'truck', cargoCapacity: 'heavy' } } // cargoCapacity should be number
          })
        ).rejects.toThrow(
          '[body.poly.cargoCapacity] Expected number, received string'
        );
      });
    });

    describe('Polymorphism oneOf with Implicit Discriminator Name (/test/polymorphism/discriminator-no-mapping)', () => {
      it('should pass if matching the implicit Circle schema', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/polymorphism/discriminator-no-mapping',
            method: 'POST',
            status: 200,
            body: { poly: { shape: 'Circle', radius: 4.5 } }
          })
        ).resolves.not.toThrow();
      });

      it('should report specific error of the implicit Square schema', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/polymorphism/discriminator-no-mapping',
            method: 'POST',
            status: 200,
            body: { poly: { shape: 'Square', sideLength: 'ten' } } // sideLength should be number
          })
        ).rejects.toThrow(
          '[body.poly.sideLength] Expected number, received string'
        );
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

    describe('Validation Keywords (const, enum, nullable, writeOnly)', () => {
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

      it('should validate const constraints successfully', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/validation/const',
            method: 'GET',
            status: 200,
            body: { status: 'success', code: 200 }
          })
        ).resolves.not.toThrow();
      });

      const constRejectionCases = [
        { body: { status: 'failed', code: 200 }, error: 'Expected exactly "success", received "failed"', desc: 'const constraint violated (string)' },
        { body: { status: 'success', code: 500 }, error: 'Expected exactly 200, received 500', desc: 'const constraint violated (integer)' }
      ];

      it.each(constRejectionCases)(
        'should reject if $desc',
        async ({ body, error }) => {
          await expect(
            assertResponseMatchesOpenAPI({
              specPath,
              path: '/test/validation/const',
              method: 'GET',
              status: 200,
              body
            })
          ).rejects.toThrow(error);
        }
      );

      it('should validate enum constraints successfully', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path: '/test/validation/enum',
            method: 'GET',
            status: 200,
            body: { role: 'admin', level: 1 }
          })
        ).resolves.not.toThrow();
      });

      const enumRejectionCases = [
        { body: { role: 'invalid-role', level: 1 }, error: 'Expected one of [admin, user, guest], received "invalid-role"', desc: 'enum constraint violated (string)' },
        { body: { role: 'admin', level: 5 }, error: 'Expected one of [1, 2, 3], received 5', desc: 'enum constraint violated (integer)' }
      ];

      it.each(enumRejectionCases)(
        'should reject if $desc',
        async ({ body, error }) => {
          await expect(
            assertResponseMatchesOpenAPI({
              specPath,
              path: '/test/validation/enum',
              method: 'GET',
              status: 200,
              body
            })
          ).rejects.toThrow(error);
        }
      );
    });

    describe('Numeric Format Constraint Fallbacks (no explicit type in schema)', () => {
      const fallbackTestCases = [
        { path: '/test/formats/no-type/int32', body: { field: 'not-a-number-string' }, error: 'Expected 32-bit integer, received string', desc: 'int32 format check (string)' },
        { path: '/test/formats/no-type/int32', body: { field: true }, error: 'Expected 32-bit integer, received boolean', desc: 'int32 format check (boolean)' },
        { path: '/test/formats/no-type/int64', body: { field: '9223372036854775808' }, error: 'Value 9223372036854775808 exceeds 64-bit integer limits', desc: 'int64 format check (string out of range)' },
        { path: '/test/formats/no-type/int64', body: { field: 9999999999999999 }, error: 'Expected 64-bit integer, received 10000000000000000', desc: 'int64 format check (number out of range)' },
        { path: '/test/formats/no-type/float', body: { field: 'not-a-number-string' }, error: 'Expected 32-bit float, received string', desc: 'float format check' },
        { path: '/test/formats/no-type/double', body: { field: 'not-a-number-string' }, error: 'Expected 64-bit float, received not-a-number-string', desc: 'double format check' }
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

    describe('Robustness Against Malformed Schema Constraints', () => {
      const malformedCases = [
        { path: '/test/validation/invalid-minimum', desc: 'invalid minimum configuration' },
        { path: '/test/validation/invalid-maximum', desc: 'invalid maximum configuration' },
        { path: '/test/validation/invalid-multipleof', desc: 'invalid multipleof configuration' }
      ];

      it.each(malformedCases)(
        'should ignore $desc gracefully',
        async ({ path }) => {
          await expect(
            assertResponseMatchesOpenAPI({
              specPath,
              path,
              method: 'GET',
              status: 200,
              body: { field: '10' }
            })
          ).resolves.not.toThrow();
        }
      );
    });

    describe('BigInt Constraints on String-Based Integers', () => {
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

      const bigintRejectionCases = [
        { value: '5', error: 'Value 5 is less than minimum 10', desc: 'bigint minimum' },
        { value: '150', error: 'Value 150 is greater than maximum 100', desc: 'bigint maximum' },
        { value: '23', error: 'Value 23 is not a multiple of 5', desc: 'bigint multipleOf' }
      ];

      it.each(bigintRejectionCases)(
        'should reject if string-based int64 violates $desc',
        async ({ value, error }) => {
          await expect(
            assertResponseMatchesOpenAPI({
              specPath,
              path: '/test/validation/bigint-constraints',
              method: 'GET',
              status: 200,
              body: { field: value }
            })
          ).rejects.toThrow(error);
        }
      );
    });

    describe('Polymorphism with Nested References', () => {
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
      const specPath = 'tests/fixtures/mock-openapi.yaml';
      const path = '/test/no-content';

      it('should pass if 204 status has an undefined body', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path,
            method: 'GET',
            status: 204,
            body: undefined
          })
        ).resolves.not.toThrow();
      });

      it('should pass if 204 status has a null body', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path,
            method: 'GET',
            status: 204,
            body: null
          })
        ).resolves.not.toThrow();
      });

      it('should pass if 204 status has an empty object body', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path,
            method: 'GET',
            status: 204,
            body: {}
          })
        ).resolves.not.toThrow();
      });

      it('should throw if 204 status has a non-empty body', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path,
            method: 'GET',
            status: 204,
            body: { hasContent: true }
          })
        ).rejects.toThrow('204 must have empty body');
      });

      it('should throw if 204 status has a non-empty string body', async () => {
        await expect(
          assertResponseMatchesOpenAPI({
            specPath,
            path,
            method: 'GET',
            status: 204,
            body: 'non-empty-string'
          })
        ).rejects.toThrow('204 must have empty body');
      });
    });

    describe('Track 3.2: Content-Type Validation and Deprecations', () => {
      let warnSpy: MockInstance;

      beforeEach(() => {
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      });

      afterEach(() => {
        warnSpy.mockRestore();
      });

      describe('Content-Type Strict Matching', () => {
        it('should pass if contentType matches declared type', async () => {
          await expect(
            assertResponseMatchesOpenAPI({
              specPath: 'tests/fixtures/mock-openapi.yaml',
              path: '/test/formats',
              method: 'GET',
              status: 200,
              contentType: 'application/json',
              body: {
                uuid: '123e4567-e89b-12d3-a456-426614174000',
                email: 'test@example.com',
                date: '2026-09-12',
                dateTime: '2026-09-12T16:00:00Z',
                ipv4: '192.168.1.1',
                hostname: 'example.com',
                uri: 'https://example.com'
              }
            })
          ).resolves.not.toThrow();
        });

        it('should throw an error if contentType is not declared', async () => {
          await expect(
            assertResponseMatchesOpenAPI({
              specPath: 'tests/fixtures/mock-openapi.yaml',
              path: '/test/formats',
              method: 'GET',
              status: 200,
              contentType: 'application/xml',
              body: '<xml></xml>'
            })
          ).rejects.toThrow(
            "Content-Type 'application/xml' is not declared for GET /test/formats 200. Declared: application/json"
          );
        });

        it('should support wildcard media types like image/*', async () => {
          await expect(
            assertResponseMatchesOpenAPI({
              specPath: 'tests/fixtures/mock-openapi.yaml',
              path: '/test/content-type/wildcard',
              method: 'GET',
              status: 200,
              contentType: 'image/png',
              body: 'opaque-image-string'
            })
          ).rejects.toThrow(
            "Expected body to be a Buffer for binary Content-Type 'image/png', received string"
          );

          await expect(
            assertResponseMatchesOpenAPI({
              specPath: 'tests/fixtures/mock-openapi.yaml',
              path: '/test/content-type/wildcard',
              method: 'GET',
              status: 200,
              contentType: 'image/png',
              body: Buffer.from('image-binary-data')
            })
          ).resolves.not.toThrow();
        });

        it('should support wildcard media types like application/*+json', async () => {
          await expect(
            assertResponseMatchesOpenAPI({
              specPath: 'tests/fixtures/mock-openapi.yaml',
              path: '/test/content-type/wildcard',
              method: 'GET',
              status: 200,
              contentType: 'application/vnd.api+json',
              body: { status: 'success' }
            })
          ).resolves.not.toThrow();
        });
      });

      describe('Non-JSON Short-circuit Validation', () => {
        it('should validate text content type as string and skip structural schema checks', async () => {
          await expect(
            assertResponseMatchesOpenAPI({
              specPath: 'tests/fixtures/mock-openapi.yaml',
              path: '/test/content-type/xml',
              method: 'GET',
              status: 200,
              contentType: 'application/xml',
              body: '<response>ok</response>'
            })
          ).resolves.not.toThrow();

          await expect(
            assertResponseMatchesOpenAPI({
              specPath: 'tests/fixtures/mock-openapi.yaml',
              path: '/test/content-type/xml',
              method: 'GET',
              status: 200,
              contentType: 'application/xml',
              body: { some: 'object' }
            })
          ).rejects.toThrow(
            "Expected body to be a string for Content-Type 'application/xml', received object"
          );
        });

        it('should validate binary content type as Buffer and skip structural schema checks', async () => {
          await expect(
            assertResponseMatchesOpenAPI({
              specPath: 'tests/fixtures/mock-openapi.yaml',
              path: '/test/content-type/binary',
              method: 'GET',
              status: 200,
              contentType: 'application/octet-stream',
              body: Buffer.from([1, 2, 3])
            })
          ).resolves.not.toThrow();

          await expect(
            assertResponseMatchesOpenAPI({
              specPath: 'tests/fixtures/mock-openapi.yaml',
              path: '/test/content-type/binary',
              method: 'GET',
              status: 200,
              contentType: 'application/octet-stream',
              body: 'not-a-buffer'
            })
          ).rejects.toThrow(
            "Expected body to be a Buffer for binary Content-Type 'application/octet-stream', received string"
          );
        });
      });

      describe('Deprecation Warnings Support', () => {
        it('should warn when a deprecated endpoint is consumed', async () => {
          await assertResponseMatchesOpenAPI({
            specPath: 'tests/fixtures/mock-openapi.yaml',
            path: '/test/deprecated-route',
            method: 'GET',
            status: 200,
            body: { message: 'hello' }
          });

          expect(warnSpy).toHaveBeenCalledWith(
            "[] Endpoint 'GET /test/deprecated-route' is deprecated"
          );
        });

        it('should warn when a schema property contains deprecated: true', async () => {
          await assertResponseMatchesOpenAPI({
            specPath: 'tests/fixtures/mock-openapi.yaml',
            path: '/test/deprecated-property',
            method: 'GET',
            status: 200,
            body: {
              activeField: 'active',
              oldField: 'deprecated-value'
            }
          });

          expect(warnSpy).toHaveBeenCalledWith(
            '[body.oldField] Schema property is deprecated'
          );
        });

        it('should warn when a deprecated 204 endpoint is consumed with an empty body', async () => {
          await assertResponseMatchesOpenAPI({
            specPath: 'tests/fixtures/mock-openapi.yaml',
            path: '/test/deprecated-no-content',
            method: 'GET',
            status: 204,
            body: undefined
          });

          expect(warnSpy).toHaveBeenCalledWith(
            "[] Endpoint 'GET /test/deprecated-no-content' is deprecated"
          );
        });

        it('should throw an error when response content is an empty object', async () => {
          await expect(
            assertResponseMatchesOpenAPI({
              specPath: 'tests/fixtures/mock-openapi.yaml',
              path: '/test/empty-content-map',
              method: 'GET',
              status: 200,
              body: { message: 'hello' }
            })
          ).rejects.toThrow(
            "Content-Type 'application/json' is not declared for GET /test/empty-content-map 200. No content declared in OpenAPI spec."
          );
        });

        it('should isolate speculative warnings and only warn for successful/selected branches', async () => {
          await assertResponseMatchesOpenAPI({
            specPath: 'tests/fixtures/mock-openapi.yaml',
            path: '/test/polymorphism/deprecated-anyof',
            method: 'GET',
            status: 200,
            body: {
              poly: {
                successField: 'valid',
                normalProp: 'value',
                activeDeprecatedProp: 'this-should-warn',
                deprecatedProp:
                  'this-should-not-warn-because-speculative-branch-failed'
              }
            }
          });

          // activeDeprecatedProp is in the matching branch (Branch 2), so it should warn
          expect(warnSpy).toHaveBeenCalledWith(
            '[body.poly.activeDeprecatedProp] Schema property is deprecated'
          );

          // deprecatedProp is in Branch 1 which failed requirements (failField was missing),
          // so its warning should be isolated and discarded.
          expect(warnSpy).not.toHaveBeenCalledWith(
            '[body.poly.deprecatedProp] Schema property is deprecated'
          );
        });
      });
    });
  });
});
