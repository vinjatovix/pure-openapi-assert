import path from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIV3 } from 'openapi-types';

const specCache = new Map<string, OpenAPIV3.Document>();

export async function loadSpec(specPath: string): Promise<OpenAPIV3.Document> {
  const absolutePath = path.resolve(process.cwd(), specPath);
  const cachedSpec = specCache.get(absolutePath);
  if (cachedSpec) {
    return cachedSpec;
  }

  const spec = (await SwaggerParser.dereference(absolutePath)) as unknown;
  if (!spec || typeof spec !== 'object' || !('paths' in spec)) {
    throw new Error(`Parsed OpenAPI spec is invalid at ${absolutePath}`);
  }

  const doc = spec as OpenAPIV3.Document;
  specCache.set(absolutePath, doc);
  return doc;
}
