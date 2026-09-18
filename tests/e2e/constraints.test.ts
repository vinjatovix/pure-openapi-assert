import { describe, it, expect } from 'vitest';
import { assertResponseMatchesOpenApi } from '../../src/index.js';

describe('assertResponseMatchesOpenApi - Constraints E2E', () => {
  const specPath = 'tests/fixtures/e2e/constraints.yaml';

  describe('Numeric Constraints', () => {
    const validPayload = {
      valMin: 10,
      valMax: 100,
      valExMin: 6,
      valExMax: 49,
      valMultiple: 7.5
    };

    it('should pass with valid numeric bounds', async () => {
      await expect(
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/constraints/numbers',
          method: 'GET',
          status: 200,
          body: { ...validPayload, valMultiple: 6.2 }
        })
      ).rejects.toThrow('Value 6.2 is not a multiple of 2.5');
    });
  });

  describe('String Constraints', () => {
    it('should pass with valid string constraints', async () => {
      await expect(
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/constraints/strings',
          method: 'GET',
          status: 200,
          body: { valStr: 'hello12' }
        })
      ).rejects.toThrow('String does not match pattern ^[a-z]+$');
    });
  });

  describe('Array Constraints', () => {
    it('should pass with valid array constraints', async () => {
      await expect(
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/constraints/arrays',
          method: 'GET',
          status: 200,
          body: { valArr: 'not-an-array' }
        })
      ).rejects.toThrow('Expected array, received string');
    });
  });

  describe('Array of Objects Constraints', () => {
    it('should pass with unique object structures', async () => {
      await expect(
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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

  describe('Objects & Additional Properties', () => {
    it('should pass when allowed additional fields match schema', async () => {
      await expect(
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/objects/strict',
          method: 'GET',
          status: 200,
          body: 'not-an-object'
        })
      ).rejects.toThrow('Expected object, received string');
    });
  });

  describe('Validation Keywords (const, enum, nullable, writeOnly)', () => {
    it('should throw an error if a writeOnly field is present in response', async () => {
      await expect(
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/validation/const',
          method: 'GET',
          status: 200,
          body: { status: 'success', code: 200 }
        })
      ).resolves.not.toThrow();
    });

    const constRejectionCases = [
      {
        body: { status: 'failed', code: 200 },
        error: 'Expected exactly "success", received "failed"',
        desc: 'const constraint violated (string)'
      },
      {
        body: { status: 'success', code: 500 },
        error: 'Expected exactly 200, received 500',
        desc: 'const constraint violated (integer)'
      }
    ];

    it.each(constRejectionCases)(
      'should reject if $desc',
      async ({ body, error }) => {
        await expect(
          assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/validation/enum',
          method: 'GET',
          status: 200,
          body: { role: 'admin', level: 1 }
        })
      ).resolves.not.toThrow();
    });

    const enumRejectionCases = [
      {
        body: { role: 'invalid-role', level: 1 },
        error: 'Expected one of [admin, user, guest], received "invalid-role"',
        desc: 'enum constraint violated (string)'
      },
      {
        body: { role: 'admin', level: 5 },
        error: 'Expected one of [1, 2, 3], received 5',
        desc: 'enum constraint violated (integer)'
      }
    ];

    it.each(enumRejectionCases)(
      'should reject if $desc',
      async ({ body, error }) => {
        await expect(
          assertResponseMatchesOpenApi({
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

  describe('Robustness Against Malformed Schema Constraints', () => {
    const malformedCases = [
      {
        path: '/test/validation/invalid-minimum',
        desc: 'invalid minimum configuration'
      },
      {
        path: '/test/validation/invalid-maximum',
        desc: 'invalid maximum configuration'
      },
      {
        path: '/test/validation/invalid-multipleof',
        desc: 'invalid multipleof configuration'
      }
    ];

    it.each(malformedCases)(
      'should ignore $desc gracefully',
      async ({ path }) => {
        await expect(
          assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/validation/bigint-constraints',
          method: 'GET',
          status: 200,
          body: { field: '50' }
        })
      ).resolves.not.toThrow();
    });

    const bigintRejectionCases = [
      {
        value: '5',
        error: 'Value 5 is less than minimum 10',
        desc: 'bigint minimum'
      },
      {
        value: '150',
        error: 'Value 150 is greater than maximum 100',
        desc: 'bigint maximum'
      },
      {
        value: '23',
        error: 'Value 23 is not a multiple of 5',
        desc: 'bigint multipleOf'
      }
    ];

    it.each(bigintRejectionCases)(
      'should reject if string-based int64 violates $desc',
      async ({ value, error }) => {
        await expect(
          assertResponseMatchesOpenApi({
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
});
