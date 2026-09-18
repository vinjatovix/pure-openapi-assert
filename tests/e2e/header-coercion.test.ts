import { describe, it, expect } from 'vitest';
import { assertResponseMatchesOpenApi } from '../../src/index.js';

describe('assertResponseMatchesOpenApi - Header Coercion and Precision (E2E)', () => {
  const specPath = 'tests/fixtures/header-coercion-openapi.yaml';

  it('should normalize and concatenate duplicate headers containing arrays', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-headers',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Duplicate': 'first',
          'x-duplicate': ['second', 'third']
        }
      })
    ).resolves.not.toThrow();
  });

  it('should ignore coercion and pass non-string/non-boolean values in coerceBoolean', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-headers',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Bool': { not: 'a-bool' } as unknown as string
        }
      })
    ).rejects.toThrow('Expected boolean, received object');
  });

  it('should ignore coercion and pass non-string/non-array values in coerceArray', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-headers',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Array': { not: 'an-array' } as unknown as string[]
        }
      })
    ).rejects.toThrow('Expected array, received object');
  });

  it('should return the original value when an array is passed to a non-array schema', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-headers',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-String': ['one', 'two']
        }
      })
    ).rejects.toThrow('Expected string, received object');
  });

  it('should ignore mediaTypeObjects that lack a schema', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-headers',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-No-Schema': '{"foo": "bar"}'
        }
      })
    ).resolves.not.toThrow();
  });

  it('should extract first element if array is passed to mediaTypeObject JSON validation', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-headers',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-No-Schema': ['{"foo": "bar"}']
        }
      })
    ).resolves.not.toThrow();
  });

  it('should ignore header validations when neither schema nor content is present', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-headers',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Empty': 'some-value'
        }
      })
    ).resolves.not.toThrow();
  });

  it('should pass for 204 No Content with inferred Content-Type response header', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-204',
        method: 'POST',
        status: 204,
        body: undefined,
        headers: {
          'content-type': 'application/json'
        }
      })
    ).resolves.not.toThrow();
  });

  it('should coerce large numeric header without precision loss into BigInt', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-large-header',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Large-Int': '9007199254740993'
        }
      })
    ).resolves.not.toThrow();
  });

  it('should fail with large numeric header violating minimum constraint', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-large-header-fail',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Large-Int': '9007199254740989'
        }
      })
    ).rejects.toThrow(
      'Value 9007199254740989 is less than minimum 9007199254740991'
    );
  });

  it('should fail validation when a large float header is evaluated against an integer schema', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-large-float-header',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Large-Float': '9007199254740993.5'
        }
      })
    ).rejects.toThrow('Expected integer, received string');
  });

  it('should fail validation when a non-integer float near 1.0 is evaluated against an integer schema', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-precision-coercion',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Integer-Precision': '1.0000000000000001'
        }
      })
    ).rejects.toThrow('Expected integer, received string');
  });

  it('should fail validation when an unsafe float is evaluated against a number schema to prevent silent loss of precision', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-precision-coercion',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Number-Precision': '9007199254740993.5'
        }
      })
    ).rejects.toThrow('Expected number, received string');
  });

  it('should fail validation when an unsafe integer is passed in floating-point notation (.0) to prevent precision rounding', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-precision-coercion',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Integer-Precision': '9007199254740993.0'
        }
      })
    ).rejects.toThrow('Expected integer, received string');
  });

  it('should fail validation when an unsafe integer is passed in scientific notation (e0) to prevent precision rounding', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-precision-coercion',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Number-Precision': '9007199254740993e0'
        }
      })
    ).rejects.toThrow('Expected number, received string');
  });

  it('should prevent infinite loops inside header coercion for circular array schemas', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-circular-array-header',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Circular-Array': 'foo,bar'
        }
      })
    ).rejects.toThrow();
  });

  it('should correctly resolve $ref item schemas in arrays during coercion', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-array-ref',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Ref-Array': '1,2'
        }
      })
    ).resolves.not.toThrow();

    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-array-ref',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Ref-Array': 'not-an-integer,2'
        }
      })
    ).rejects.toThrow('Expected integer, received string');
  });

  it('should preserve spec context during composed dry-run coercion to resolve discriminators', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-dry-run-ref-discriminator',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Discriminated-Header': '{"type": "A", "valueA": 123}'
        }
      })
    ).resolves.not.toThrow();
  });

  it('should successfully detect cycles inside composed schemas without infinite loops', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-circular-composed-header',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Circular-Composed': 'foo'
        }
      })
    ).rejects.toThrow();
  });

  it('should correctly coerce and validate int64 headers with enum/const limits', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-int64-enum-header',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Int64-Header': '9007199254740991'
        }
      })
    ).resolves.not.toThrow();
  });

  it('should successfully coerce header values defined using composed schemas (oneOf, anyOf, allOf)', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-composed-header',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Integer-Header': '1'
        }
      })
    ).resolves.not.toThrow();
  });

  it('should use dry-run validation in composed coercion to avoid wrong branch type mismatches', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-dry-run-fallback-to-string',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Composed-Header': '3'
        }
      })
    ).resolves.not.toThrow();
  });

  it('should use dry-run validation in composed coercion to select the coercible branch that passes', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-dry-run-coerce-to-integer',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Composed-Header': '3'
        }
      })
    ).resolves.not.toThrow();
  });

  it('should cumulatively coerce allOf header schemas sequentially', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-all-of-header',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-AllOf-Header': '10'
        }
      })
    ).resolves.not.toThrow();
  });

  it('should parse content-backed JSON headers containing large integers losslessly without precision loss', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-content-large-integer',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-JSON-Header': '9007199254740993'
        }
      })
    ).resolves.not.toThrow();
  });

  it('should fail format checks for positive overflow of int64 headers', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-int64-overflow',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Int64-Header': '9223372036854775808'
        }
      })
    ).rejects.toThrow(
      'Value 9223372036854775808 exceeds 64-bit integer limits'
    );
  });

  it('should fail format checks for negative underflow of int64 headers', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-int64-underflow',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Int64-Header': '-9223372036854775809'
        }
      })
    ).rejects.toThrow(
      'Value -9223372036854775809 exceeds 64-bit integer limits'
    );
  });

  it('should handle mixed allOf and oneOf coercion correctly', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-mixed-allof-oneof',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-Mixed-Header': '6'
        }
      })
    ).resolves.not.toThrow();
  });

  it('should parse 16-digit safe integers as numbers, not bigints', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-json-float',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-JSON-Header': '1000000000000000'
        }
      })
    ).resolves.not.toThrow();
  });

  it('should correctly unwrap array for JSON content-backed headers with a strict schema', async () => {
    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-json-object',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-JSON-Header': ['{"id": 123}']
        }
      })
    ).resolves.not.toThrow();

    await expect(
      assertResponseMatchesOpenApi({
        specPath,
        path: '/test-json-object',
        method: 'GET',
        status: 200,
        body: {},
        headers: {
          'X-JSON-Header': ['{"id": "not-an-integer"}']
        }
      })
    ).rejects.toThrow();
  });

  describe('parseCSVHeader Edge Cases', () => {
    const csvTestCases = [
      { name: 'simple comma list', header: 'a, b, c' },
      { name: 'commas inside quotes', header: '"a,b", c' },
      { name: 'escaped quotes inside quotes', header: '"a,\\"b", c' },
      {
        name: 'Windows paths (not stripped)',
        header: 'C:\\path\\to\\file, D:\\other'
      },
      {
        name: 'trim whitespace outside quotes',
        header: '  "a , b"  ,  c  '
      },
      { name: 'preserve internal word spaces', header: 'hello world, other' },
      { name: 'whitespace inside quotes', header: '"  a  "' },
      { name: 'empty parts', header: 'a,,b' },
      { name: 'blank input', header: '' },
      { name: 'unbalanced quotes', header: '"a,b,c' },
      { name: 'double quotes inside tokens', header: 'a"b,c' }
    ];

    it.each(csvTestCases)('$name', async ({ header }) => {
      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test-csv-edge',
          method: 'GET',
          status: 200,
          body: {},
          headers: {
            'X-CSV': header
          }
        })
      ).resolves.not.toThrow();
    });
  });

  describe('parseJSONLossless Edge Cases', () => {
    const jsonTestCases = [
      {
        name: 'naked positive safe integer',
        headerValue: '123',
        type: 'number'
      },
      {
        name: 'naked negative safe integer',
        headerValue: '-123',
        type: 'number'
      },
      {
        name: 'naked positive unsafe integer',
        headerValue: '9007199254740993',
        type: 'number'
      },
      {
        name: 'naked negative unsafe integer',
        headerValue: '-9007199254740993',
        type: 'number'
      },
      {
        name: 'naked safe float',
        headerValue: '12.34',
        type: 'float'
      },
      {
        name: 'complex object with bigints',
        headerValue: '{"id": 9007199254740993}',
        type: 'object'
      },
      {
        name: 'URL brackets non-corruption',
        headerValue: '{"url": "http://example.com/items/[123456789012345678]"}',
        type: 'object'
      },
      {
        name: 'float with long decimal digits',
        headerValue: '{"val": 1.23456789012345678}',
        type: 'object'
      },
      {
        name: 'scientific float notation',
        headerValue: '{"val": 1.2e20}',
        type: 'object'
      },
      {
        name: 'escaped quotes inside strings',
        headerValue: '{"text": "My \\"9007199254740993\\" item"}',
        type: 'object'
      },
      {
        name: 'keys as numbers ignored',
        headerValue: '{"9007199254740993": "val"}',
        type: 'object'
      },
      {
        name: 'large stringified values ignored',
        headerValue: '{"id": "9007199254740993"}',
        type: 'object'
      },
      {
        name: 'coincidental prefixes safely ignored',
        headerValue: '{"text": "__bigint__9007199254740993"}',
        type: 'object'
      },
      {
        name: 'Unicode and Multibyte JSON characters',
        headerValue: '{"name": "Español 😎", "id": 9007199254740993}',
        type: 'object'
      },
      {
        name: 'nested array of bigints',
        headerValue: '{"a": [9007199254740993]}',
        type: 'object'
      },
      {
        name: 'boolean value',
        headerValue: 'true',
        type: 'boolean'
      },
      {
        name: 'consecutive bigints in array',
        headerValue: '[9007199254740993, -9007199254740995]',
        type: 'array'
      },
      {
        name: 'spaces around JSON string',
        headerValue: '   {"id": 9007199254740993}   ',
        type: 'object'
      },
      {
        name: 'escaped linebreaks and tabs',
        headerValue: '{"desc": "Line1\\nLine2 with 9007199254740993"}',
        type: 'object'
      },
      {
        name: '16-digit safe integer for number schema is not rejected',
        headerValue: '1000000000000000',
        type: 'float'
      },
      {
        name: 'nested 16-digit safe integer inside object is not rejected',
        headerValue: '{"val": 1000000000000000}',
        type: 'object'
      }
    ];

    it.each(jsonTestCases)('$name', async ({ headerValue, type }) => {
      let path = '/test-json-object';
      if (type === 'number') {
        path = '/test-json-number';
      } else if (type === 'float') {
        path = '/test-json-float';
      } else if (type === 'boolean') {
        path = '/test-json-boolean';
      } else if (type === 'array') {
        path = '/test-json-array';
      }

      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path,
          method: 'GET',
          status: 200,
          body: {},
          headers: {
            'X-JSON-Header': headerValue
          }
        })
      ).resolves.not.toThrow();
    });

    it('rejects invalid zero-prefixed integers', async () => {
      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test-json-number',
          method: 'GET',
          status: 200,
          body: {},
          headers: {
            'X-JSON-Header': '00000000009007199254740993'
          }
        })
      ).rejects.toThrow();
    });

    it('rejects unsafe fractional float tokens under an integer schema to prevent silent rounding', async () => {
      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test-json-number',
          method: 'GET',
          status: 200,
          body: {},
          headers: {
            'X-JSON-Header': '9007199254740993.5'
          }
        })
      ).rejects.toThrow();
    });

    it('rejects decimal values near 1.0 (e.g. 1.0000000000000001) under a JSON-backed integer schema', async () => {
      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test-json-number',
          method: 'GET',
          status: 200,
          body: {},
          headers: {
            'X-JSON-Header': '1.0000000000000001'
          }
        })
      ).rejects.toThrow();
    });
  });
});
