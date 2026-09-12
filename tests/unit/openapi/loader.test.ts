import { describe, it, expect, vi } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIV3 } from 'openapi-types';
import { loadSpec } from '../../../src/openapi/loader.js';

vi.mock('@apidevtools/swagger-parser', () => {
  return {
    default: {
      dereference: vi.fn()
    }
  };
});

describe('openapi/loader', () => {
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
    const validSpec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {}
    };
    vi.mocked(SwaggerParser).dereference.mockResolvedValueOnce(validSpec);

    const spec1 = await loadSpec('dummy-cached.yaml');
    expect(spec1).toBe(validSpec);

    // This second call should hit the cache and not call dereference again
    const spec2 = await loadSpec('dummy-cached.yaml');
    expect(spec2).toBe(validSpec);
    expect(vi.mocked(SwaggerParser).dereference).toHaveBeenCalledTimes(1);
  });
});
