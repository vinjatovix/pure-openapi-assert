import type { OpenAPIV3 } from 'openapi-types';
import {
  ValidationContext,
  type ValidationIssue
} from '../../src/core/ValidationContext.js';

export class ValidationContextBuilder {
  private spec?: OpenAPIV3.Document;
  private visited: Set<object> = new Set<object>();
  private issues: ValidationIssue[] = [];

  withSpec(spec: OpenAPIV3.Document): this {
    this.spec = spec;
    return this;
  }

  withVisited(visited: Set<object>): this {
    this.visited = visited;
    return this;
  }

  withIssues(issues: ValidationIssue[]): this {
    this.issues = issues;
    return this;
  }

  build(): ValidationContext {
    return new ValidationContext({
      spec: this.spec,
      visited: this.visited,
      issues: this.issues
    });
  }
}
