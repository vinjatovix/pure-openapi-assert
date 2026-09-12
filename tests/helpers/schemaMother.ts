import type { OpenAPIV3 } from 'openapi-types';
import { SchemaBuilder } from './SchemaBuilder.js';

const create = (
  configure: (builder: SchemaBuilder) => SchemaBuilder = (b) => b
) => {
  return (
    overrides?: Partial<OpenAPIV3.SchemaObject>
  ): OpenAPIV3.SchemaObject =>
    Object.assign(configure(new SchemaBuilder()).build(), overrides);
};

const createPolymorphic = (method: 'oneOf' | 'anyOf' | 'allOf') => {
  return (
    schemas: Array<
      OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | SchemaBuilder
    >,
    overrides?: Partial<OpenAPIV3.SchemaObject>
  ): OpenAPIV3.SchemaObject => {
    const builder = new SchemaBuilder();
    builder[method](...schemas);
    return Object.assign(builder.build(), overrides);
  };
};

export const schemaMother = {
  empty: create(),
  string: create((b) => b.type('string')),
  number: create((b) => b.type('number')),
  integer: create((b) => b.type('integer')),
  object: create((b) => b.type('object')),
  array: create((b) => b.type('array')),
  int64: create((b) => b.format('int64')),
  float: create((b) => b.format('float')),
  double: create((b) => b.format('double')),
  oneOf: createPolymorphic('oneOf'),
  anyOf: createPolymorphic('anyOf'),
  allOf: createPolymorphic('allOf')
};
