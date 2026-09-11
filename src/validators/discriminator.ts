import type { OpenAPIV3 } from 'openapi-types';
import { ValidationContext } from '../core/ValidationContext.js';
import { isPlainObject, isPrimitive } from '../core/utils.js';
import { findSchemaByPointer } from './pointers.js';
import { schemaMatchesProperty } from './properties.js';
import { type ValidationArgs } from './types.js';

type DiscriminatorResolution =
  | { type: 'no_discriminator' }
  | { type: 'failed' }
  | { type: 'resolved'; schema: OpenAPIV3.SchemaObject };

function matchByMappingOrPointer(args: {
  spec: OpenAPIV3.Document;
  schemas: Array<OpenAPIV3.SchemaObject>;
  discriminator: OpenAPIV3.DiscriminatorObject;
  discriminatorValue: string;
}): OpenAPIV3.SchemaObject | undefined {
  const { spec, schemas, discriminator, discriminatorValue } = args;
  const mapping = discriminator.mapping;

  if (mapping && Object.hasOwn(mapping, discriminatorValue)) {
    const mappedRef = mapping[discriminatorValue];
    if (mappedRef) {
      const match = findSchemaByPointer({ spec, pointer: mappedRef, schemas });
      if (match) return match;
    }
  }

  return findSchemaByPointer({ spec, pointer: discriminatorValue, schemas });
}

function matchByTitle(
  schemas: Array<OpenAPIV3.SchemaObject>,
  discriminatorValue: string
): OpenAPIV3.SchemaObject | undefined {
  let match: OpenAPIV3.SchemaObject | undefined;
  for (const schema of schemas) {
    if (Object.hasOwn(schema, 'title') && schema.title === discriminatorValue) {
      if (match !== undefined) return undefined;
      match = schema;
    }
  }
  return match;
}

function matchByProperties(args: {
  schemas: Array<OpenAPIV3.SchemaObject>;
  propertyName: string;
  discriminatorValue: string;
  spec?: OpenAPIV3.Document | undefined;
}): OpenAPIV3.SchemaObject | undefined {
  const { schemas, propertyName, discriminatorValue, spec } = args;
  let match: OpenAPIV3.SchemaObject | undefined;
  for (const schema of schemas) {
    if (
      schemaMatchesProperty({ schema, propertyName, discriminatorValue, spec })
    ) {
      if (match !== undefined) return undefined;
      match = schema;
    }
  }
  return match;
}

function getDiscriminatorValue(args: {
  value: unknown;
  propertyName: string;
  ctx: ValidationContext;
}): string | null {
  const { value, propertyName, ctx } = args;
  if (!isPlainObject(value)) {
    ctx.addError('Discriminator validation failed: value is not an object');
    return null;
  }

  if (!Object.hasOwn(value, propertyName)) {
    ctx.addError(
      `Discriminator property '${propertyName}' is missing in object`
    );
    return null;
  }

  const discriminatorValue = value[propertyName];
  if (discriminatorValue === undefined) {
    ctx.addError(
      `Discriminator property '${propertyName}' is missing in object`
    );
    return null;
  }

  if (!isPrimitive(discriminatorValue)) {
    ctx.addError(
      `Discriminator property '${propertyName}' must be a primitive value`
    );
    return null;
  }

  return String(discriminatorValue);
}

function findDiscriminatorMatch(args: {
  spec: OpenAPIV3.Document | undefined;
  schemas: Array<OpenAPIV3.SchemaObject>;
  discriminator: OpenAPIV3.DiscriminatorObject;
  discriminatorValue: string;
}): OpenAPIV3.SchemaObject | undefined {
  const { spec, schemas, discriminator, discriminatorValue } = args;
  if (spec) {
    const match = matchByMappingOrPointer({
      spec,
      schemas,
      discriminator,
      discriminatorValue
    });
    if (match) return match;
  }

  return (
    matchByTitle(schemas, discriminatorValue) ??
    matchByProperties({
      schemas,
      propertyName: discriminator.propertyName,
      discriminatorValue,
      spec
    })
  );
}

export function resolveDiscriminatorSchema(args: {
  validationArgs: ValidationArgs<unknown>;
  schemas: Array<OpenAPIV3.SchemaObject>;
  compositionType: 'oneOf' | 'anyOf';
}): DiscriminatorResolution {
  const { validationArgs, schemas, compositionType } = args;
  const { value, schema, ctx } = validationArgs;
  const discriminator = schema.discriminator;
  if (!discriminator) {
    return { type: 'no_discriminator' };
  }

  const discriminatorValue = getDiscriminatorValue({
    value,
    propertyName: discriminator.propertyName,
    ctx
  });
  if (discriminatorValue === null) {
    return { type: 'failed' };
  }

  const match = findDiscriminatorMatch({
    spec: ctx.spec,
    schemas,
    discriminator,
    discriminatorValue
  });
  if (match) {
    return { type: 'resolved', schema: match };
  }

  ctx.addError(
    `Discriminator '${discriminator.propertyName}' value '${discriminatorValue}' does not match any schema in '${compositionType}'`
  );

  return { type: 'failed' };
}
