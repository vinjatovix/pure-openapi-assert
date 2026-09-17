import path from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIV3 } from 'openapi-types';
import { isPlainObject } from '../core/utils.js';
import { stateManager } from '../core/StateManager.js';

function isValidOpenAPIV3Document(spec: unknown): spec is OpenAPIV3.Document {
  if (!isPlainObject(spec)) {
    return false;
  }

  const hasOpenapi = typeof spec.openapi === 'string';
  const hasInfo = isPlainObject(spec.info);
  const hasPaths = isPlainObject(spec.paths);

  return hasOpenapi && hasInfo && hasPaths;
}

export async function loadSpec(specPath: string): Promise<OpenAPIV3.Document> {
  const absolutePath = path.resolve(process.cwd(), specPath);

  // Get current mtimeMs from stateManager (triggers same-tick microtask check)
  const currentMtimeMs = await stateManager.getMtimeMs(absolutePath);

  const cachedEntry = stateManager.getFileSpecEntry(absolutePath);

  if (cachedEntry) {
    if (cachedEntry.mtimeMs === currentMtimeMs) {
      return cachedEntry.document;
    }
    stateManager.invalidate(absolutePath);
  }

  const pending = stateManager.getPendingLoad(absolutePath);
  if (pending) {
    return pending;
  }

  const loadPromise = (async () => {
    try {
      const spec = await SwaggerParser.dereference(absolutePath);

      if (!isValidOpenAPIV3Document(spec)) {
        throw new Error(`Parsed OpenAPI spec is invalid at ${absolutePath}`);
      }

      stateManager.setFileSpec(absolutePath, spec, currentMtimeMs);
      return spec;
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.startsWith('Parsed OpenAPI spec is invalid')
      ) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Parsed OpenAPI spec is invalid at ${absolutePath}: ${message}`,
        { cause: err }
      );
    } finally {
      stateManager.clearPendingLoad(absolutePath);
    }
  })();

  stateManager.setPendingLoad(absolutePath, loadPromise);
  return loadPromise;
}
