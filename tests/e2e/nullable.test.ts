import { describe, it, expect } from 'vitest';
import { assertResponseMatchesOpenApi } from '../../src/index.js';

describe('assertResponseMatchesOpenApi nullable semantics', () => {
  const specPath = 'tests/fixtures/e2e/nullable-semantics.yaml';

  const check = (path: string, body: unknown) =>
    assertResponseMatchesOpenApi({
      specPath,
      path,
      method: 'GET',
      status: 200,
      body
    });

  const NOT_NULLABLE =
    /\[body\.image\] Field is not nullable but received null/;
  const EXPECTED_OBJECT = /\[body\.image\] Expected object, received string/;

  describe('Compositions and $ref decide on null', () => {
    it('should reject null when allOf/$ref does not admit it, even if the container is nullable', async () => {
      await expect(
        check('/test/nullable/allof-object', { image: null })
      ).rejects.toThrow(NOT_NULLABLE);
    });

    it('should accept a valid object under a nullable allOf', async () => {
      await expect(
        check('/test/nullable/allof-object', { image: { url: 'a.png' } })
      ).resolves.not.toThrow();
    });

    it('should accept null when an anyOf branch admits it', async () => {
      await expect(
        check('/test/nullable/anyof-null-branch', { image: null })
      ).resolves.not.toThrow();
    });

    it('should reject null when two oneOf branches admit it', async () => {
      await expect(
        check('/test/nullable/oneof-two-nullable', { image: null })
      ).rejects.toThrow('expected exactly 1');
    });

    it('should accept null when exactly one oneOf branch admits it', async () => {
      await expect(
        check('/test/nullable/oneof-one-nullable', { image: null })
      ).resolves.not.toThrow();
    });
  });

  describe('nullable only takes effect alongside type', () => {
    it('should reject null with allOf and nullable but no type', async () => {
      await expect(
        check('/test/nullable/allof-no-type', { image: null })
      ).rejects.toThrow(NOT_NULLABLE);
    });

    it('should accept null with type: string and nullable: true', async () => {
      await expect(
        check('/test/nullable/string-nullable', { image: null })
      ).resolves.not.toThrow();
    });

    it('should reject null with type: string without nullable', async () => {
      await expect(
        check('/test/nullable/string-plain', { image: null })
      ).rejects.toThrow(NOT_NULLABLE);
    });

    it('should accept null with nullable and no type or composition', async () => {
      await expect(
        check('/test/nullable/no-constraints', { image: null })
      ).resolves.not.toThrow();
    });

    it('should accept null when the not subschema does not admit it', async () => {
      await expect(
        check('/test/nullable/not-only', { image: null })
      ).resolves.not.toThrow();
    });

    it('should not evaluate enum against a null admitted by type and nullable', async () => {
      await expect(
        check('/test/nullable/string-enum', { image: null })
      ).resolves.not.toThrow();
    });

    it('should accept null with type: array and nullable', async () => {
      await expect(
        check('/test/nullable/array-nullable', { image: null })
      ).resolves.not.toThrow();
    });

    it('should reject null with type: array without nullable', async () => {
      await expect(
        check('/test/nullable/array-plain', { image: null })
      ).rejects.toThrow(NOT_NULLABLE);
    });

    it('should accept null with type: integer, format: int64 and nullable', async () => {
      await expect(
        check('/test/nullable/int64-nullable', { image: null })
      ).resolves.not.toThrow();
    });

    it('should reject null with a direct $ref whose target does not admit it (sibling nullable ignored)', async () => {
      await expect(
        check('/test/nullable/ref-direct', { image: null })
      ).rejects.toThrow(NOT_NULLABLE);
    });

    it('should reject null with allOf and nullable: false', async () => {
      await expect(
        check('/test/nullable/allof-not-nullable', { image: null })
      ).rejects.toThrow(NOT_NULLABLE);
    });
  });

  describe('$ref to an external file', () => {
    const checkExternal = (spec: string, path: string, body: unknown) =>
      assertResponseMatchesOpenApi({
        specPath: `tests/fixtures/e2e/nullable-external-ref/${spec}`,
        path,
        method: 'GET',
        status: 200,
        body
      });
    const validImage = { url: 'a.png' };

    it('should reject null with a single external $ref and a sibling nullable', async () => {
      await expect(
        checkExternal('single.yaml', '/test/nullable/external-ref-single', {
          image: null
        })
      ).rejects.toThrow(NOT_NULLABLE);
    });

    it('should accept a valid object with a single external $ref', async () => {
      await expect(
        checkExternal('single.yaml', '/test/nullable/external-ref-single', {
          image: validImage
        })
      ).resolves.not.toThrow();
    });

    it('should reject null with a repeated external $ref and a sibling nullable', async () => {
      await expect(
        checkExternal('repeated.yaml', '/test/nullable/external-ref', {
          image: null,
          thumbnail: validImage
        })
      ).rejects.toThrow(NOT_NULLABLE);
    });

    it('should reject null in another $ref to the same external file without nullable', async () => {
      await expect(
        checkExternal('repeated.yaml', '/test/nullable/external-ref', {
          image: validImage,
          thumbnail: null
        })
      ).rejects.toThrow(
        /\[body\.thumbnail\] Field is not nullable but received null/
      );
    });
  });

  describe('Non-null values are unchanged', () => {
    it('should reject an empty object that breaks the required fields of Image', async () => {
      await expect(
        check('/test/nullable/allof-object', { image: {} })
      ).rejects.toThrow(/\[body\.image\.url\]/);
    });

    it('should reject a string where an object is expected', async () => {
      await expect(
        check('/test/nullable/allof-object', { image: 'text' })
      ).rejects.toThrow(EXPECTED_OBJECT);
    });
  });
});
