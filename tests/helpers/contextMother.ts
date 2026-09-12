import type { OpenAPIV3 } from 'openapi-types';
import { ValidationContextBuilder } from './ValidationContextBuilder.js';
import { ValidationContext } from '../../src/core/ValidationContext.js';
import { DocumentBuilder } from './DocumentBuilder.js';

export const contextMother = {
  empty: (): ValidationContext => new ValidationContextBuilder().build(),
  withSchemas: (
    schemas: Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>
  ): ValidationContext => {
    const docBuilder = new DocumentBuilder();
    for (const [name, schema] of Object.entries(schemas)) {
      docBuilder.withSchema(name, schema);
    }
    return new ValidationContextBuilder().withSpec(docBuilder.build()).build();
  }
};
