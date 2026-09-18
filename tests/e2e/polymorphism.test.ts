import { describe, it, expect } from 'vitest';
import { assertResponseMatchesOpenApi } from '../../src/index.js';

describe('assertResponseMatchesOpenApi', () => {
  const specPath = 'tests/fixtures/e2e/polymorphism.yaml';

  describe('Polymorphism anyOf Tree Reporting', () => {
    it('should pass if matching at least one valid anyOf branch', async () => {
      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/polymorphism/anyof',
          method: 'GET',
          status: 200,
          body: { poly: { type: 'A', valA: 'hello' } }
        })
      ).resolves.not.toThrow();

      await expect(
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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

  describe('Polymorphism oneOf Constraints', () => {
    it('should pass if matching exactly one oneOf branch', async () => {
      await expect(
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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

  describe('Polymorphism allOf Constraints', () => {
    it('should pass if matching all schemas in allOf', async () => {
      await expect(
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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

  describe('Polymorphism oneOf with Discriminator Mapping', () => {
    it('should pass if matching the exact dog schema via discriminator', async () => {
      await expect(
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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
        assertResponseMatchesOpenApi({
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

  describe('Polymorphism with Nested References', () => {
    it('should pass and resolve reference schemas inside polymorphism ref-object successfully', async () => {
      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/polymorphism/ref-object',
          method: 'GET',
          status: 200,
          body: { poly: { name: 'Simple User Object' } }
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Polymorphism anyOf Warning Discarding (/test/polymorphism/deprecated-anyof)', () => {
    it('should discard warnings from failed branches and print warnings from selected branch', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(
        assertResponseMatchesOpenApi({
          specPath,
          path: '/test/polymorphism/deprecated-anyof',
          method: 'GET',
          status: 200,
          body: {
            poly: {
              successField: 'valid',
              activeDeprecatedProp: 'warning'
            }
          }
        })
      ).resolves.not.toThrow();

      const loggedWarnings = warnSpy.mock.calls.map((args): string => {
        const firstArg: unknown = args[0];
        return typeof firstArg === 'string' ? firstArg : '';
      });

      expect(
        loggedWarnings.some(
          (w) => w.includes('deprecated') && w.includes('body.poly')
        )
      ).toBe(true);
      expect(loggedWarnings.some((w) => w.includes('deprecatedProp'))).toBe(
        false
      );

      warnSpy.mockRestore();
    });
  });
});
