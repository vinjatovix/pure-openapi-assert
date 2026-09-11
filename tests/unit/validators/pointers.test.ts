import { describe, it, expect } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';
import {
  resolvePointer,
  findSchemaByPointer
} from '../../../src/validators/pointers.js';

describe('Validators pointers.ts (Unit)', () => {
  describe('resolvePointer', () => {
    it('should resolve standard JSON pointers', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            User: { type: 'object' }
          }
        }
      };
      const result = resolvePointer(spec, '#/components/schemas/User');
      expect(result).toBe(spec.components?.schemas?.User);
    });

    it('should resolve the empty pointer "#" to the document root', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {}
      };
      const result = resolvePointer(spec, '#');
      expect(result).toBe(spec);
    });

    it('should retrieve resolved pointers from cache on subsequent resolvePointer lookups', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            User: { type: 'object' }
          }
        }
      };
      const result1 = resolvePointer(spec, '#/components/schemas/User');
      const result2 = resolvePointer(spec, '#/components/schemas/User');
      expect(result1).toBe(spec.components?.schemas?.User);
      expect(result2).toBe(result1);
    });

    it('should return undefined for invalid or non-matching pointers', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {}
      };
      expect(resolvePointer(spec, '#/components/schemas/User')).toBeUndefined();
      expect(resolvePointer(spec, 'components/schemas/User')).toBeUndefined();
    });

    it('should support RFC 6901 escaping for ~1 and ~0', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            'User/Type': { type: 'object' },
            'User~Name': { type: 'string' }
          }
        }
      };
      expect(resolvePointer(spec, '#/components/schemas/User~1Type')).toBe(
        spec.components?.schemas?.['User/Type']
      );
      expect(resolvePointer(spec, '#/components/schemas/User~0Name')).toBe(
        spec.components?.schemas?.['User~Name']
      );
    });

    it('should return undefined when attempting to read inherited Object prototype properties', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      expect(resolvePointer(spec, '#/__proto__')).toBeUndefined();
      expect(resolvePointer(spec, '#/info/toString')).toBeUndefined();
      expect(resolvePointer(spec, '#/info/hasOwnProperty')).toBeUndefined();
    });

    it('should exit traversal and return undefined upon encountering a primitive value', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'TestTitle', version: '1.0.0' },
        paths: {}
      };

      const invalidPointerAttemptingToReadStringProperty =
        '#/info/title/invalidTraverse';
      expect(
        resolvePointer(spec, invalidPointerAttemptingToReadStringProperty)
      ).toBeUndefined();
    });

    it('should percent-decode URI-fragment JSON pointer parts during resolve', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            'User Type': { type: 'object' }
          }
        }
      };
      expect(resolvePointer(spec, '#/components/schemas/User%20Type')).toBe(
        spec.components?.schemas?.['User Type']
      );
    });

    it('should split before percent-decoding URI-fragment JSON pointer parts during resolve', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            'User/Type': { type: 'object' }
          }
        }
      };
      expect(resolvePointer(spec, '#/components/schemas/User%2FType')).toBe(
        spec.components?.schemas?.['User/Type']
      );
    });

    it('should handle malformed percent-encoding safely inside resolvePointer', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            'User%Type': { type: 'object' }
          }
        }
      };
      expect(resolvePointer(spec, '#/components/schemas/User%Type')).toBe(
        spec.components?.schemas?.['User%Type']
      );
    });
  });

  describe('findSchemaByPointer', () => {
    it('should scope cache by spec to avoid contamination with reused schemas arrays', () => {
      const targetA = { type: 'object' as const, title: 'TargetA' };
      const targetB = { type: 'object' as const, title: 'TargetB' };

      const specA = {
        openapi: '3.0.0',
        info: { title: 'SpecA', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Target: targetA
          }
        }
      } as unknown as OpenAPIV3.Document;

      const specB = {
        openapi: '3.0.0',
        info: { title: 'SpecB', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Target: targetB
          }
        }
      } as unknown as OpenAPIV3.Document;

      const sharedSchemasArray = [targetA, targetB];

      const resultFromSpecA = findSchemaByPointer({
        spec: specA,
        pointer: '#/components/schemas/Target',
        schemas: sharedSchemasArray
      });
      expect(resultFromSpecA).toBe(targetA);

      const resultFromSpecB = findSchemaByPointer({
        spec: specB,
        pointer: '#/components/schemas/Target',
        schemas: sharedSchemasArray
      });
      expect(resultFromSpecB).toBe(targetB);
    });

    it('should prioritize structural match and ignore ambiguous same-title fallback matches', () => {
      const targetA = {
        type: 'object' as const,
        title: 'SameTitle',
        properties: { propA: { type: 'string' as const } }
      } as OpenAPIV3.SchemaObject;
      const targetB = {
        type: 'object' as const,
        title: 'SameTitle',
        properties: { propB: { type: 'number' as const } }
      } as OpenAPIV3.SchemaObject;

      const spec = {
        openapi: '3.0.0',
        info: { title: 'Spec', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Target: targetB
          }
        }
      } as unknown as OpenAPIV3.Document;

      const sharedSchemasArray = [targetA, targetB];

      const result = findSchemaByPointer({
        spec,
        pointer: '#/components/schemas/Target',
        schemas: sharedSchemasArray
      });
      expect(result).toBe(targetB);
    });

    it('should ignore title fallback match if the title is ambiguous', () => {
      const targetA = {
        type: 'object' as const,
        title: 'SameTitle',
        properties: { propA: { type: 'string' as const } }
      } as OpenAPIV3.SchemaObject;
      const targetB = {
        type: 'object' as const,
        title: 'SameTitle',
        properties: { propB: { type: 'number' as const } }
      } as OpenAPIV3.SchemaObject;
      const targetSpec = {
        type: 'object' as const,
        title: 'SameTitle',
        properties: { propC: { type: 'boolean' as const } }
      } as OpenAPIV3.SchemaObject;

      const spec = {
        openapi: '3.0.0',
        info: { title: 'Spec', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Target: targetSpec
          }
        }
      } as unknown as OpenAPIV3.Document;

      const sharedSchemasArray = [targetA, targetB];

      const result = findSchemaByPointer({
        spec,
        pointer: '#/components/schemas/Target',
        schemas: sharedSchemasArray
      });
      expect(result).toBeUndefined();
    });

    it('should resolve short pointers by implicitly prepending the OpenAPI 3 schema path', () => {
      const targetSchema = { type: 'object' as const, title: 'Target' };
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Spec', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Target: targetSchema
          }
        }
      } as unknown as OpenAPIV3.Document;

      const shortPointer = 'Target';
      const result = findSchemaByPointer({
        spec,
        pointer: shortPointer,
        schemas: [targetSchema]
      });
      expect(result).toBe(targetSchema);
    });

    it('should prioritize exact memory reference match over structural or title matches', () => {
      const exactReferenceTarget = { type: 'object' as const, title: 'Target' };
      const structurallyIdenticalDecoy = {
        type: 'object' as const,
        title: 'Target'
      };

      const spec = {
        openapi: '3.0.0',
        info: { title: 'Spec', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Target: exactReferenceTarget
          }
        }
      } as unknown as OpenAPIV3.Document;

      const result = findSchemaByPointer({
        spec,
        pointer: '#/components/schemas/Target',
        schemas: [structurallyIdenticalDecoy, exactReferenceTarget]
      });
      expect(result).toBe(exactReferenceTarget);
    });

    it('should return undefined when pointer resolves to a value that is not a valid schema object', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Spec', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Target: 'invalid-primitive-not-an-object'
          }
        }
      } as unknown as OpenAPIV3.Document;

      const result = findSchemaByPointer({
        spec,
        pointer: '#/components/schemas/Target',
        schemas: []
      });
      expect(result).toBeUndefined();
    });

    it('should allow resolvePointer to resolve non-schema targets, while findSchemaByPointer returns undefined for them', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test Title', version: '1.0.0' },
        paths: {},
        components: {}
      } as unknown as OpenAPIV3.Document;

      const resolved = resolvePointer(spec, '#/info/title');
      expect(resolved).toBe('Test Title');

      const result = findSchemaByPointer({
        spec,
        pointer: '#/info/title',
        schemas: []
      });
      expect(result).toBeUndefined();
    });

    it('should bound search cache and evict old entries to prevent memory leaks', () => {
      const targetSchema = { type: 'object' as const, title: 'Target' };
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Spec', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Target: targetSchema
          }
        }
      } as unknown as OpenAPIV3.Document;

      const emptySchemas: OpenAPIV3.SchemaObject[] = [];
      for (let i = 0; i < 1005; i++) {
        findSchemaByPointer({
          spec,
          pointer: `non-existent-${i}`,
          schemas: emptySchemas
        });
      }

      const result = findSchemaByPointer({
        spec,
        pointer: 'Target',
        schemas: [targetSchema]
      });
      expect(result).toBe(targetSchema);
    });
  });
});
