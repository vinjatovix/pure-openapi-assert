import { describe, it, expect, vi, beforeEach } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIV3 } from 'openapi-types';
import { loadSpec } from '../../../src/openapi/loader.js';
import { stateManager } from '../../../src/core/StateManager.js';
import { DocumentBuilder } from '../../helpers/DocumentBuilder.js';

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
});
