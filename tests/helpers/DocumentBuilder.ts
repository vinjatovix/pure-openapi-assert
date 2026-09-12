import type { OpenAPIV3 } from 'openapi-types';

export class DocumentBuilder {
  private doc: Partial<OpenAPIV3.Document> = {
    openapi: '3.0.0',
    info: { title: 'Test', version: '1.0.0' },
    paths: {}
  };

  withSchema(
    name: string,
    schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
  ): this {
    if (!this.doc.components) {
      this.doc.components = {};
    }
    if (!this.doc.components.schemas) {
      this.doc.components.schemas = {};
    }
    this.doc.components.schemas[name] = schema;
    return this;
  }

  build(): OpenAPIV3.Document {
    return this.doc as OpenAPIV3.Document;
  }
}
