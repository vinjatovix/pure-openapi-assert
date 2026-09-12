import type { OpenAPIV3 } from 'openapi-types';
import { ValidationContext } from '../../src/core/ValidationContext.js';

export class ValidationContextBuilder {
  private spec?: OpenAPIV3.Document;
  private visited: Set<object> = new Set<object>();

  withSpec(spec: OpenAPIV3.Document): this {
    this.spec = spec;
    return this;
  }

  withVisited(visited: Set<object>): this {
    this.visited = visited;
    return this;
  }

  build(): ValidationContext {
    return new ValidationContext(this.spec, this.visited);
  }
}
