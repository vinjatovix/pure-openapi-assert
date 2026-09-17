import fs from 'node:fs';
import type { OpenAPIV3 } from 'openapi-types';
import { FIFOCache } from './FIFOCache.js';

export interface SpecCacheEntry {
  document: OpenAPIV3.Document;
  mtimeMs: number;
}

export class StateManager {
  private readonly fileSpecCache = new Map<string, SpecCacheEntry>();
  private readonly pendingSpecLoads = new Map<
    string,
    Promise<OpenAPIV3.Document>
  >();
  private objectSpecCache = new WeakMap<object, OpenAPIV3.Document>();
  private pointerCache = new WeakMap<object, FIFOCache<string, unknown>>();
  private schemaPointerMatchCache = new WeakMap<
    object,
    WeakMap<object, FIFOCache<string, OpenAPIV3.SchemaObject | undefined>>
  >();

  readonly pathRegexCache = new FIFOCache<string, RegExp>();
  readonly wildcardRegexCache = new FIFOCache<string, RegExp>();
  readonly formatRegexCache = new FIFOCache<string, RegExp>();

  private readonly mtimeCheckCache = new Map<string, Promise<number>>();

  getPendingLoad(specPath: string): Promise<OpenAPIV3.Document> | undefined {
    return this.pendingSpecLoads.get(specPath);
  }

  setPendingLoad(specPath: string, promise: Promise<OpenAPIV3.Document>): void {
    this.pendingSpecLoads.set(specPath, promise);
  }

  clearPendingLoad(specPath: string): void {
    this.pendingSpecLoads.delete(specPath);
  }

  getFileSpec(specPath: string): OpenAPIV3.Document | undefined {
    return this.fileSpecCache.get(specPath)?.document;
  }

  getFileSpecEntry(specPath: string): SpecCacheEntry | undefined {
    return this.fileSpecCache.get(specPath);
  }

  setFileSpec(
    specPath: string,
    document: OpenAPIV3.Document,
    mtimeMs: number
  ): void {
    this.fileSpecCache.set(specPath, { document, mtimeMs });
  }

  getObjectSpec(spec: OpenAPIV3.Document): OpenAPIV3.Document | undefined {
    return this.objectSpecCache.get(spec);
  }

  setObjectSpec(spec: OpenAPIV3.Document, doc: OpenAPIV3.Document): void {
    this.objectSpecCache.set(spec, doc);
  }

  getOrInitPointerCache(spec: OpenAPIV3.Document): FIFOCache<string, unknown> {
    let cache = this.pointerCache.get(spec);
    if (!cache) {
      cache = new FIFOCache<string, unknown>();
      this.pointerCache.set(spec, cache);
    }
    return cache;
  }

  getOrInitSchemaPointerMatchCache(
    spec: OpenAPIV3.Document,
    schemas: object
  ): FIFOCache<string, OpenAPIV3.SchemaObject | undefined> {
    let docCache = this.schemaPointerMatchCache.get(spec);
    if (!docCache) {
      docCache = new WeakMap<
        object,
        FIFOCache<string, OpenAPIV3.SchemaObject | undefined>
      >();
      this.schemaPointerMatchCache.set(spec, docCache);
    }
    let cache = docCache.get(schemas);
    if (!cache) {
      cache = new FIFOCache<string, OpenAPIV3.SchemaObject | undefined>();
      docCache.set(schemas, cache);
    }
    return cache;
  }

  /**
   * Retrieves the modification time (mtimeMs) of an OpenAPI specification file.
   *
   * To prevent redundant disk/file system I/O operations in high-frequency concurrent
   * loops during a single event loop tick (e.g., when validating multiple nested payload
   * schemas in the same run), this method caches the stats lookup promise in `mtimeCheckCache`.
   *
   * On the first stat request within a tick, a same-tick cleanup microtask is scheduled
   * using `queueMicrotask`. This microtask runs after all synchronous and microtask executions
   * for the current tick are complete, clearing the cache so that subsequent ticks query the
   * disk afresh (guaranteeing real-time updates in watch mode).
   *
   * @param specPath - The absolute file path of the OpenAPI specification.
   * @returns A promise resolving to the file's modification time in milliseconds.
   * @throws An Error if the file is missing or inaccessible.
   */
  getMtimeMs(specPath: string): Promise<number> {
    const cachedPromise = this.mtimeCheckCache.get(specPath);
    if (cachedPromise !== undefined) {
      return cachedPromise;
    }

    const promise = (async () => {
      try {
        const stats = await fs.promises.stat(specPath);
        return stats.mtimeMs;
      } catch (err) {
        this.invalidate(specPath);
        throw new Error(
          `OpenAPI spec file not found or inaccessible at ${specPath}`,
          { cause: err }
        );
      }
    })();

    if (this.mtimeCheckCache.size === 0) {
      queueMicrotask(() => {
        this.mtimeCheckCache.clear();
      });
    }

    this.mtimeCheckCache.set(specPath, promise);
    return promise;
  }

  invalidate(specPath: string): void {
    const entry = this.fileSpecCache.get(specPath);
    if (entry) {
      this.pointerCache.delete(entry.document);
      this.schemaPointerMatchCache.delete(entry.document);
      this.fileSpecCache.delete(specPath);
    }
  }

  clear(): void {
    this.fileSpecCache.clear();
    this.pendingSpecLoads.clear();
    this.objectSpecCache = new WeakMap<object, OpenAPIV3.Document>();
    this.pointerCache = new WeakMap<object, FIFOCache<string, unknown>>();
    this.schemaPointerMatchCache = new WeakMap<
      object,
      WeakMap<object, FIFOCache<string, OpenAPIV3.SchemaObject | undefined>>
    >();
    this.pathRegexCache.clear();
    this.wildcardRegexCache.clear();
    this.formatRegexCache.clear();
    this.mtimeCheckCache.clear();
  }
}

export const stateManager = new StateManager();
