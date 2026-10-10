import { createRequire } from 'node:module';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIV3 } from 'openapi-types';
import type { FileInfo, Plugin } from '@apidevtools/json-schema-ref-parser';
import {
  loadSpec,
  stripDocumentRefSiblings,
  stripRefSiblings,
  withoutRefSiblings
} from '../../../src/openapi/loader.js';
import { stateManager } from '../../../src/core/StateManager.js';
import { DocumentBuilder } from '../../helpers/DocumentBuilder.js';

interface PackageManifest {
  version: string;
  dependencies: Record<string, string>;
}

vi.mock('@apidevtools/swagger-parser', () => {
  return {
    default: {
      dereference: vi.fn()
    }
  };
});

describe('openapi/loader', () => {
  beforeEach(() => {
    vi.spyOn(stateManager, 'getMtimeMs').mockResolvedValue(123456);
  });

  it('should dereference the absolute path with sibling-stripping json and yaml parsers', async () => {
    const validSpec = new DocumentBuilder().build();
    vi.mocked(SwaggerParser).dereference.mockResolvedValueOnce(validSpec);

    await loadSpec('dummy-parsers.yaml');
    const [api, options] = vi.mocked(SwaggerParser).dereference.mock
      .calls[0] as unknown as [string, SwaggerParser.Options];
    const yaml = options.parse?.yaml as Plugin;
    const json = options.parse?.json as Plugin;
    const file = (data: string): FileInfo => ({
      url: 'x',
      extension: '',
      data,
      hash: ''
    });
    const parseYaml = yaml.parse as (f: FileInfo) => Promise<unknown>;
    const parseJson = json.parse as (f: FileInfo) => Promise<unknown>;

    expect(api).toMatch(/dummy-parsers\.yaml$/);
    expect(
      await parseYaml(file('a: { $ref: "./b.yaml", nullable: true }'))
    ).toEqual({
      a: { $ref: './b.yaml' }
    });
    expect(
      await parseJson(file('{ "a": { "$ref": "./b.json", "nullable": true } }'))
    ).toEqual({ a: { $ref: './b.json' } });
  });

  it('should throw an error if the spec is null', async () => {
    vi.mocked(SwaggerParser).dereference.mockResolvedValueOnce(
      null as unknown as OpenAPIV3.Document
    );

    await expect(loadSpec('dummy.yaml')).rejects.toThrow(
      'Parsed OpenAPI spec is invalid at'
    );
  });

  it('should throw an error if the spec is an array', async () => {
    vi.mocked(SwaggerParser).dereference.mockResolvedValueOnce(
      [] as unknown as OpenAPIV3.Document
    );

    await expect(loadSpec('dummy.yaml')).rejects.toThrow(
      'Parsed OpenAPI spec is invalid at'
    );
  });

  it('should throw an error if the spec is a primitive', async () => {
    vi.mocked(SwaggerParser).dereference.mockResolvedValueOnce(
      'invalid' as unknown as OpenAPIV3.Document
    );

    await expect(loadSpec('dummy.yaml')).rejects.toThrow(
      'Parsed OpenAPI spec is invalid at'
    );
  });

  it('should return cached spec on subsequent calls', async () => {
    const validSpec = new DocumentBuilder().build();
    vi.mocked(SwaggerParser).dereference.mockResolvedValueOnce(validSpec);

    const spec1 = await loadSpec('dummy-cached.yaml');
    const spec2 = await loadSpec('dummy-cached.yaml');
    const parserMock = vi.mocked(SwaggerParser).dereference;

    expect(spec1).toBe(validSpec);
    expect(spec2).toBe(validSpec);
    expect(parserMock).toHaveBeenCalledTimes(1);
  });

  it('should coalesce concurrent calls to load the same spec and run dereference exactly once', async () => {
    const validSpec = new DocumentBuilder().build();
    let resolveDereference: (val: OpenAPIV3.Document) => void = () => {};
    const dereferencePromise = new Promise<OpenAPIV3.Document>((resolve) => {
      resolveDereference = resolve;
    });
    vi.mocked(SwaggerParser).dereference.mockReturnValueOnce(
      dereferencePromise
    );

    const promise1 = loadSpec('dummy-concurrent.yaml');
    const promise2 = loadSpec('dummy-concurrent.yaml');
    resolveDereference(validSpec);
    const [spec1, spec2] = await Promise.all([promise1, promise2]);
    const parserMock = vi.mocked(SwaggerParser).dereference;

    expect(spec1).toBe(validSpec);
    expect(spec2).toBe(validSpec);
    expect(parserMock).toHaveBeenCalledTimes(1);
  });

  it('should propagate failure to all concurrent callers when coalesced loading fails', async () => {
    let rejectDereference: (err: Error) => void = () => {};
    const dereferencePromise = new Promise<OpenAPIV3.Document>((_, reject) => {
      rejectDereference = reject;
    });
    vi.mocked(SwaggerParser).dereference.mockReturnValueOnce(
      dereferencePromise
    );
    const promise1 = loadSpec('dummy-failed-coalesce.yaml');
    const promise2 = loadSpec('dummy-failed-coalesce.yaml');

    rejectDereference(new Error('Dereference failed'));

    await expect(promise1).rejects.toThrow('Dereference failed');
    await expect(promise2).rejects.toThrow('Dereference failed');
  });

  it('should clear pending load tracker on failure allowing a subsequent retry to succeed', async () => {
    let rejectDereference: (err: Error) => void = () => {};
    const dereferencePromise = new Promise<OpenAPIV3.Document>((_, reject) => {
      rejectDereference = reject;
    });
    vi.mocked(SwaggerParser).dereference.mockReturnValueOnce(
      dereferencePromise
    );
    const promise1 = loadSpec('dummy-failed-retry.yaml');
    rejectDereference(new Error('Dereference failed'));
    await expect(promise1).rejects.toThrow('Dereference failed');

    const validSpec = new DocumentBuilder().build();
    vi.mocked(SwaggerParser).dereference.mockResolvedValueOnce(validSpec);

    const spec = await loadSpec('dummy-failed-retry.yaml');

    expect(spec).toBe(validSpec);
  });

  describe('stripRefSiblings', () => {
    it('should drop the siblings of a $ref', () => {
      expect(
        stripRefSiblings({ $ref: '#/a', nullable: true, description: 'x' })
      ).toEqual({ $ref: '#/a' });
    });

    it('should drop $ref siblings inside arrays such as allOf', () => {
      expect(
        stripRefSiblings({
          allOf: [{ $ref: '#/a', nullable: true }, { type: 'object' }]
        })
      ).toEqual({ allOf: [{ $ref: '#/a' }, { type: 'object' }] });
    });

    it('should keep objects whose $ref is not a string, such as a property named $ref', () => {
      const schema = {
        type: 'object',
        properties: { $ref: { type: 'string', nullable: true } }
      };

      expect(stripRefSiblings(schema)).toEqual(schema);
    });

    it('should return primitives unchanged', () => {
      expect(stripRefSiblings('text')).toBe('text');
      expect(stripRefSiblings(null)).toBeNull();
    });

    it('should not mutate its input', () => {
      const schema = {
        properties: { image: { $ref: '#/a', nullable: true } },
        allOf: [{ $ref: '#/b', nullable: true }]
      };
      const snapshot = structuredClone(schema);

      stripRefSiblings(schema);

      expect(schema).toEqual(snapshot);
    });
  });

  describe('stripDocumentRefSiblings', () => {
    it('should keep the fields next to a Path Item $ref', () => {
      const pathItem = { $ref: './pets.yaml', post: { responses: {} } };

      expect(
        stripDocumentRefSiblings({
          openapi: '3.0.3',
          paths: { '/pets': pathItem }
        })
      ).toEqual({ openapi: '3.0.3', paths: { '/pets': pathItem } });
    });

    it('should drop $ref siblings inside a Path Item and the rest of the document', () => {
      expect(
        stripDocumentRefSiblings({
          openapi: '3.0.3',
          paths: {
            '/pets': {
              get: { responses: { '200': { $ref: '#/r', description: 'x' } } }
            }
          },
          components: { schemas: { A: { $ref: '#/b', nullable: true } } }
        })
      ).toEqual({
        openapi: '3.0.3',
        paths: { '/pets': { get: { responses: { '200': { $ref: '#/r' } } } } },
        components: { schemas: { A: { $ref: '#/b' } } }
      });
    });

    it('should leave malformed path items, operations, callbacks and components unchanged', () => {
      const document = {
        openapi: '3.0.3',
        paths: {
          '/broken': null,
          '/pets': { get: 'not-an-operation', post: { callbacks: [] } }
        },
        components: 'not-components'
      };

      expect(stripDocumentRefSiblings(document)).toEqual(document);
    });

    it('should keep the fields next to a Path Item $ref inside operation and component callbacks', () => {
      const pathItem = { $ref: '#/x', summary: 's', post: { responses: {} } };

      expect(
        stripDocumentRefSiblings({
          openapi: '3.0.3',
          paths: {
            '/pets': {
              post: { callbacks: { cb: { '{$request.body#/url}': pathItem } } }
            }
          },
          components: {
            callbacks: { cb: { '{$request.body#/url}': pathItem } }
          }
        })
      ).toEqual({
        openapi: '3.0.3',
        paths: {
          '/pets': {
            post: { callbacks: { cb: { '{$request.body#/url}': pathItem } } }
          }
        },
        components: {
          callbacks: { cb: { '{$request.body#/url}': pathItem } }
        }
      });
    });

    it('should drop the siblings of a callback Reference Object and of extensions', () => {
      expect(
        stripDocumentRefSiblings({
          openapi: '3.0.3',
          paths: {
            'x-ext': { $ref: '#/e', nullable: true },
            '/pets': {
              post: {
                callbacks: {
                  ref: { $ref: '#/components/callbacks/cb', summary: 's' },
                  cb: { 'x-ext': { $ref: '#/e', nullable: true } }
                }
              }
            }
          },
          components: {
            schemas: { properties: { callbacks: { $ref: '#/a', x: 1 } } }
          }
        })
      ).toEqual({
        openapi: '3.0.3',
        paths: {
          'x-ext': { $ref: '#/e' },
          '/pets': {
            post: {
              callbacks: {
                ref: { $ref: '#/components/callbacks/cb' },
                cb: { 'x-ext': { $ref: '#/e' } }
              }
            }
          }
        },
        components: {
          schemas: { properties: { callbacks: { $ref: '#/a' } } }
        }
      });
    });

    it('should strip files that are not an OpenAPI document as plain nodes', () => {
      expect(
        stripDocumentRefSiblings({ paths: { $ref: '#/a', nullable: true } })
      ).toEqual({ paths: { $ref: '#/a' } });
    });
  });

  describe('json-schema-ref-parser version', () => {
    it('should match the version swagger-parser depends on, so the default parsers come from the same copy', () => {
      const require = createRequire(import.meta.url);
      const own = require('../../../package.json') as PackageManifest;
      const swaggerParser =
        require('@apidevtools/swagger-parser/package.json') as PackageManifest;
      const refParser = '@apidevtools/json-schema-ref-parser';

      expect(own.dependencies[refParser]).toBe(
        swaggerParser.dependencies[refParser]
      );
      expect(own.dependencies['@apidevtools/swagger-parser']).toBe(
        swaggerParser.version
      );
    });
  });

  describe('withoutRefSiblings', () => {
    it('should call the wrapped parser with the plugin as this', async () => {
      const plugin: Plugin = {
        allowBOM: true,
        parse(this: Plugin) {
          return { allowBOM: this.allowBOM, $ref: '#/a', nullable: true };
        }
      };
      const wrapped = withoutRefSiblings(plugin);
      const parse = wrapped.parse as (f: FileInfo) => Promise<unknown>;

      expect(wrapped.allowBOM).toBe(true);
      expect(
        await parse({ url: 'x', extension: '', data: '', hash: '' })
      ).toEqual({ $ref: '#/a' });
    });

    it.each([
      ['undefined', undefined],
      ['a boolean', false],
      ['a plugin without a parse function', { parse: 'text' }]
    ])('should throw when the default parser is %s', (_, plugin) => {
      expect(() => withoutRefSiblings(plugin as Plugin | boolean)).toThrow(
        'Unexpected default parser plugin shape'
      );
    });
  });
});
