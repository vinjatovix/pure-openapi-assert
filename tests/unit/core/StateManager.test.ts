import fs from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';
import { stateManager } from '../../../src/core/StateManager.js';
import { DocumentBuilder } from '../../helpers/DocumentBuilder.js';

describe('StateManager', () => {
  beforeEach(() => {
    stateManager.clear();
    vi.restoreAllMocks();
  });

  it('should store and retrieve file specifications correctly', () => {
    const specPath = 'specs/petstore.yaml';
    const doc = new DocumentBuilder().build();
    const mtimeMs = 123456789;

    stateManager.setFileSpec(specPath, doc, mtimeMs);
    const retrieved = stateManager.getFileSpec(specPath);

    expect(retrieved).toBe(doc);
  });

  it('should return undefined when retrieving an uncached file spec', () => {
    const specPath = 'specs/non-existent.yaml';

    const retrieved = stateManager.getFileSpec(specPath);

    expect(retrieved).toBeUndefined();
  });

  it('should store and retrieve object specifications correctly', () => {
    const obj = new DocumentBuilder().build();
    const doc = new DocumentBuilder().build();

    stateManager.setObjectSpec(obj, doc);
    const retrieved = stateManager.getObjectSpec(obj);

    expect(retrieved).toBe(doc);
  });

  it('should return undefined when retrieving an uncached object spec', () => {
    const obj = new DocumentBuilder().build();

    const retrieved = stateManager.getObjectSpec(obj);

    expect(retrieved).toBeUndefined();
  });

  it('should reject non-document objects at compile time for public signatures', () => {
    const invalidObj = { custom: 'invalid' };

    // @ts-expect-error - should fail compilation since invalidObj is not typed as OpenAPIV3.Document
    stateManager.getObjectSpec(invalidObj);

    // @ts-expect-error - should fail compilation since invalidObj is not typed as OpenAPIV3.Document
    stateManager.setObjectSpec(invalidObj, new DocumentBuilder().build());

    // @ts-expect-error - should fail compilation since invalidObj is not typed as OpenAPIV3.Document
    stateManager.getOrInitPointerCache(invalidObj);

    // @ts-expect-error - should fail compilation since invalidObj is not typed as OpenAPIV3.Document
    stateManager.getOrInitSchemaPointerMatchCache(invalidObj, {});
  });

  it('should initialize and reuse pointer caches for a spec document', () => {
    const doc = new DocumentBuilder().build();

    const cache1 = stateManager.getOrInitPointerCache(doc);
    const cache2 = stateManager.getOrInitPointerCache(doc);

    expect(cache1).toBe(cache2);
  });

  it('should initialize and reuse schema pointer match caches', () => {
    const doc = new DocumentBuilder().build();
    const schemas: Array<OpenAPIV3.SchemaObject> = [];

    const cache1 = stateManager.getOrInitSchemaPointerMatchCache(doc, schemas);
    const cache2 = stateManager.getOrInitSchemaPointerMatchCache(doc, schemas);

    expect(cache1).toBe(cache2);
  });

  it('should invoke fs.promises.stat exactly once for multiple concurrent calls within the same tick', async () => {
    const specPath = 'specs/petstore.yaml';
    const spy = vi.spyOn(fs.promises, 'stat').mockResolvedValue({
      mtimeMs: 123456789
    } as fs.Stats);

    const [t1, t2, t3] = await Promise.all([
      stateManager.getMtimeMs(specPath),
      stateManager.getMtimeMs(specPath),
      stateManager.getMtimeMs(specPath)
    ]);

    expect(t1).toBe(123456789);
    expect(t2).toBe(123456789);
    expect(t3).toBe(123456789);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should purge cached values on the next tick', async () => {
    const specPath = 'specs/petstore.yaml';
    const spy = vi.spyOn(fs.promises, 'stat').mockResolvedValue({
      mtimeMs: 123456789
    } as fs.Stats);

    await stateManager.getMtimeMs(specPath);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await stateManager.getMtimeMs(specPath);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('should clear dependent pointer caches when a spec file is invalidated', () => {
    const specPath = 'specs/petstore.yaml';
    const doc = new DocumentBuilder().build();
    stateManager.setFileSpec(specPath, doc, 12345);
    const pointerCache = stateManager.getOrInitPointerCache(doc);
    pointerCache.set('key', 'value');

    stateManager.invalidate(specPath);
    const newPointerCache = stateManager.getOrInitPointerCache(doc);

    expect(stateManager.getFileSpec(specPath)).toBeUndefined();
    expect(newPointerCache).not.toBe(pointerCache);
    expect(newPointerCache.has('key')).toBe(false);
  });

  it('should clear all caches on clear', () => {
    const specPath = 'specs/petstore.yaml';
    const doc = new DocumentBuilder().build();
    stateManager.setFileSpec(specPath, doc, 12345);
    const pointerCache = stateManager.getOrInitPointerCache(doc);
    pointerCache.set('key', 'value');

    stateManager.clear();
    const newPointerCache = stateManager.getOrInitPointerCache(doc);

    expect(stateManager.getFileSpec(specPath)).toBeUndefined();
    expect(newPointerCache).not.toBe(pointerCache);
    expect(newPointerCache.has('key')).toBe(false);
  });

  it('should throw structured error and invalidate if fs.stat fails', async () => {
    const specPath = 'specs/missing.yaml';
    const doc = new DocumentBuilder().build();
    stateManager.setFileSpec(specPath, doc, 12345);
    vi.spyOn(fs.promises, 'stat').mockRejectedValue(new Error('ENOENT'));

    const run = () => stateManager.getMtimeMs(specPath);

    await expect(run).rejects.toThrow(
      'OpenAPI spec file not found or inaccessible at specs/missing.yaml'
    );
    expect(stateManager.getFileSpec(specPath)).toBeUndefined();
  });
});
