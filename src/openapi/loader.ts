import path from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import {
  getJsonSchemaRefParserDefaultOptions,
  type FileInfo,
  type Plugin
} from '@apidevtools/json-schema-ref-parser';
import type { OpenAPIV3 } from 'openapi-types';
import { isPlainObject } from '../core/utils.js';
import { stateManager } from '../core/StateManager.js';

const HTTP_METHODS = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace'
]);

function isValidOpenAPIV3Document(spec: unknown): spec is OpenAPIV3.Document {
  if (!isPlainObject(spec)) {
    return false;
  }

  const hasOpenapi = typeof spec.openapi === 'string';
  const hasInfo = isPlainObject(spec.info);
  const hasPaths = isPlainObject(spec.paths);

  return hasOpenapi && hasInfo && hasPaths;
}

/**
 * OAS 3.0.3 ignores the siblings of a `$ref`. `SwaggerParser` merges them into
 * the resolved schema (e.g. a sibling `nullable` would apply to the target),
 * so they are dropped before any resolution happens.
 * @internal
 */
export function stripRefSiblings(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripRefSiblings);
  }
  if (!isPlainObject(node)) {
    return node;
  }
  if (typeof node.$ref === 'string') {
    return { $ref: node.$ref };
  }
  return mapEntries(node, (_, value) => stripRefSiblings(value));
}

function mapEntries(
  node: Record<string, unknown>,
  map: (key: string, value: unknown) => unknown
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [key, map(key, value)])
  );
}

function isExtension(key: string): boolean {
  return key.startsWith('x-');
}

/** Maps expressions to Path Items, or is itself a Reference Object. */
function stripCallbackRefSiblings(callback: unknown): unknown {
  if (!isPlainObject(callback) || typeof callback.$ref === 'string') {
    return stripRefSiblings(callback);
  }
  return mapEntries(callback, (key, value) =>
    isExtension(key) ? stripRefSiblings(value) : stripPathItemRefSiblings(value)
  );
}

function stripCallbacksRefSiblings(callbacks: unknown): unknown {
  if (!isPlainObject(callbacks)) {
    return stripRefSiblings(callbacks);
  }
  return mapEntries(callbacks, (_, callback) =>
    stripCallbackRefSiblings(callback)
  );
}

function stripOperationRefSiblings(operation: unknown): unknown {
  if (!isPlainObject(operation)) {
    return stripRefSiblings(operation);
  }
  return mapEntries(operation, (key, value) =>
    key === 'callbacks'
      ? stripCallbacksRefSiblings(value)
      : stripRefSiblings(value)
  );
}

function stripPathItemRefSiblings(pathItem: unknown): unknown {
  if (!isPlainObject(pathItem)) {
    return stripRefSiblings(pathItem);
  }
  return mapEntries(pathItem, (key, value) => {
    if (key === '$ref') {
      return value;
    }
    return HTTP_METHODS.has(key)
      ? stripOperationRefSiblings(value)
      : stripRefSiblings(value);
  });
}

function stripPathsRefSiblings(paths: Record<string, unknown>): unknown {
  return mapEntries(paths, (key, value) =>
    isExtension(key) ? stripRefSiblings(value) : stripPathItemRefSiblings(value)
  );
}

function stripComponentsRefSiblings(components: unknown): unknown {
  if (!isPlainObject(components)) {
    return stripRefSiblings(components);
  }
  return mapEntries(components, (key, value) =>
    key === 'callbacks'
      ? stripCallbacksRefSiblings(value)
      : stripRefSiblings(value)
  );
}

/**
 * Like `stripRefSiblings`, but keeps the fields next to a Path Item `$ref`,
 * under `paths` and inside callbacks: OAS 3.0.3 allows them there, unlike in
 * a Reference Object.
 * @internal
 */
export function stripDocumentRefSiblings(document: unknown): unknown {
  if (
    !isPlainObject(document) ||
    typeof document.openapi !== 'string' ||
    !isPlainObject(document.paths)
  ) {
    return stripRefSiblings(document);
  }
  const paths = document.paths;
  return mapEntries(document, (key, value) => {
    if (key === 'paths') {
      return stripPathsRefSiblings(paths);
    }
    if (key === 'components') {
      return stripComponentsRefSiblings(value);
    }
    return stripRefSiblings(value);
  });
}

/**
 * Wraps a parser plugin so every file (root and external) is cleaned as it is
 * parsed. Cleaning the bundled document is too late: `bundle` inlines external
 * files and merges the siblings into them, leaving no `$ref` to clean.
 * @internal
 */
export function withoutRefSiblings(
  plugin: Plugin | boolean | undefined
): Plugin {
  if (typeof plugin !== 'object' || typeof plugin.parse !== 'function') {
    throw new Error('Unexpected default parser plugin shape');
  }
  const parse = plugin.parse;
  return {
    ...plugin,
    parse: async (file: FileInfo) =>
      stripDocumentRefSiblings(await parse.call(plugin, file))
  };
}

function buildParserOptions(): SwaggerParser.Options {
  const { parse: defaultParsers } = getJsonSchemaRefParserDefaultOptions();
  return {
    parse: {
      json: withoutRefSiblings(defaultParsers.json),
      yaml: withoutRefSiblings(defaultParsers.yaml)
    }
  };
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
      const spec = await SwaggerParser.dereference(
        absolutePath,
        buildParserOptions()
      );

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
