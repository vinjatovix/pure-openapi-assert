import path from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIV3 } from 'openapi-types';

const specCache = new Map<string, OpenAPIV3.Document>();

function isNonNullObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isValidOpenAPIV3Document(spec: unknown): spec is OpenAPIV3.Document {
  if (!isNonNullObject(spec)) {
    return false;
  }

  const hasOpenapi = typeof spec.openapi === 'string';
  const hasInfo = isNonNullObject(spec.info);
  const hasPaths = isNonNullObject(spec.paths);

  return hasOpenapi && hasInfo && hasPaths;
}

export async function loadSpec(specPath: string): Promise<OpenAPIV3.Document> {
  const absolutePath = path.resolve(process.cwd(), specPath);
  const cachedSpec = specCache.get(absolutePath);
  if (cachedSpec) {
    return cachedSpec;
  }

  let spec: unknown;
  try {
    spec = await SwaggerParser.dereference(absolutePath);
  } catch (err) {
    throw new Error(
      `Parsed OpenAPI spec is invalid at ${absolutePath}: ${(err as Error).message}`,
      { cause: err }
    );
  }

  if (!isValidOpenAPIV3Document(spec)) {
    throw new Error(`Parsed OpenAPI spec is invalid at ${absolutePath}`);
  }

  specCache.set(absolutePath, spec);
  return spec;
}
