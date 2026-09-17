import type { OpenAPIV3 } from 'openapi-types';
import { ValidationContextBuilder } from './ValidationContextBuilder.js';
import {
  ValidationContext,
  type ValidationIssue
} from '../../src/core/ValidationContext.js';
import { DocumentBuilder } from './DocumentBuilder.js';

export const contextMother = {
  empty: (): ValidationContext => new ValidationContextBuilder().build(),
  withIssues: (issues: ValidationIssue[]): ValidationContext =>
    new ValidationContextBuilder().withIssues(issues).build(),
  withSpec: (spec: OpenAPIV3.Document): ValidationContext =>
    new ValidationContextBuilder().withSpec(spec).build(),
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
