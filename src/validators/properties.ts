import type { OpenAPIV3 } from 'openapi-types';
import { isPrimitive, isSchemaObject } from '../core/utils.js';

type SchemaObjectWithConst = OpenAPIV3.SchemaObject & {
  const?: string | number | boolean | null;
};

interface ResolveResult {
  props: Record<string, OpenAPIV3.SchemaObject>;
  clean: boolean;
}

const resolvedPropsCache = new WeakMap<
  object,
  Record<string, OpenAPIV3.SchemaObject>
>();

function mergeSchemaProperties(
  target: Record<string, OpenAPIV3.SchemaObject>,
  source: Record<string, OpenAPIV3.SchemaObject>
): void {
  for (const [key, prop] of Object.entries(source)) {
    if (Object.hasOwn(target, key)) {
      target[key] = { ...target[key], ...prop };
    } else {
      target[key] = prop;
    }
  }
}

function mergeAllOfProperties(args: {
  allOf: OpenAPIV3.SchemaObject[];
  spec?: OpenAPIV3.Document | undefined;
  visited?: Set<unknown> | undefined;
}): ResolveResult {
  const { allOf, spec, visited } = args;
  const mergedProps: Record<string, OpenAPIV3.SchemaObject> = {};
  let isClean = true;

  for (const sub of allOf) {
    const subResult = resolveAllProperties({ schema: sub, spec, visited });
    mergeSchemaProperties(mergedProps, subResult.props);
    if (!subResult.clean) {
      isClean = false;
    }
  }

  return { props: mergedProps, clean: isClean };
}

function resolveAllProperties(args: {
  schema: OpenAPIV3.SchemaObject;
  spec?: OpenAPIV3.Document | undefined;
  visited?: Set<unknown> | undefined;
}): ResolveResult {
  const { schema, spec, visited = new Set<unknown>() } = args;
  if (resolvedPropsCache.has(schema)) {
    return { props: resolvedPropsCache.get(schema)!, clean: true };
  }

  if (visited.has(schema)) {
    return { props: {}, clean: false };
  }
  visited.add(schema);

  const initialProps = {
    ...((schema.properties as Record<string, OpenAPIV3.SchemaObject>) ?? {})
  };

  if (!schema.allOf) {
    visited.delete(schema);
    resolvedPropsCache.set(schema, initialProps);
    return { props: initialProps, clean: true };
  }

  const allOfResult = mergeAllOfProperties({
    allOf: schema.allOf as OpenAPIV3.SchemaObject[],
    spec,
    visited
  });
  const finalProps = { ...allOfResult.props };
  mergeSchemaProperties(finalProps, initialProps);

  visited.delete(schema);
  if (allOfResult.clean) {
    resolvedPropsCache.set(schema, finalProps);
  }

  return { props: finalProps, clean: allOfResult.clean };
}

function matchConst(
  prop: SchemaObjectWithConst,
  expectedValue: string
): boolean {
  return (
    prop.const !== undefined &&
    isPrimitive(prop.const) &&
    String(prop.const) === expectedValue
  );
}

function matchEnum(
  prop: OpenAPIV3.SchemaObject,
  expectedValue: string
): boolean {
  if (!Array.isArray(prop.enum)) return false;
  return prop.enum.some(
    (val) => isPrimitive(val) && String(val) === expectedValue
  );
}

export function schemaMatchesProperty(args: {
  schema: unknown;
  propertyName: string;
  discriminatorValue: string;
  spec?: OpenAPIV3.Document | undefined;
}): boolean {
  const { schema, propertyName, discriminatorValue, spec } = args;
  if (!isSchemaObject(schema)) return false;

  const { props: allProperties } = resolveAllProperties({ schema, spec });
  const prop = allProperties[propertyName];
  if (!isSchemaObject(prop)) return false;

  if (matchConst(prop, discriminatorValue)) return true;
  if (matchEnum(prop, discriminatorValue)) return true;

  return false;
}
