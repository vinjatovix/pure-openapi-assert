import type { OpenAPIV3 } from 'openapi-types';
import { isPlainObject } from './utils.js';

export interface PathNode {
  readonly segment: string | number;
  readonly parent: PathNode | null;
}

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  path: string;
  message: string;
  severity: IssueSeverity;
  branches?: ValidationIssue[][];
}

export class ValidationContext {
  public readonly issues: ValidationIssue[];
  public readonly visited: Set<object>;
  public currentPath: PathNode | null = null;
  private readonly activeObjectPolymorphism: WeakMap<
    object,
    Set<OpenAPIV3.SchemaObject>
  >;
  private readonly activePrimitivePolymorphism: Set<OpenAPIV3.SchemaObject>;

  constructor(
    public readonly spec?: OpenAPIV3.Document,
    visited?: Set<object>,
    activeObjectPolymorphism?: WeakMap<object, Set<OpenAPIV3.SchemaObject>>,
    activePrimitivePolymorphism?: Set<OpenAPIV3.SchemaObject>,
    issues?: ValidationIssue[]
  ) {
    this.visited = visited || new Set<object>();
    this.activeObjectPolymorphism =
      activeObjectPolymorphism ||
      new WeakMap<object, Set<OpenAPIV3.SchemaObject>>();
    this.activePrimitivePolymorphism =
      activePrimitivePolymorphism || new Set<OpenAPIV3.SchemaObject>();
    this.issues = issues || [];
  }

  get errors(): readonly ValidationIssue[] {
    return this.issues.filter((i) => i.severity === 'error');
  }

  get warnings(): readonly ValidationIssue[] {
    return this.issues.filter((i) => i.severity === 'warning');
  }

  createChildContext(): ValidationContext {
    const child = new ValidationContext(
      this.spec,
      new Set<object>(this.visited),
      this.activeObjectPolymorphism,
      new Set<OpenAPIV3.SchemaObject>(this.activePrimitivePolymorphism)
    );
    child.currentPath = this.currentPath;
    return child;
  }

  private getActiveSchemasSet(value: unknown): Set<OpenAPIV3.SchemaObject> {
    if (isPlainObject(value) || Array.isArray(value)) {
      let active = this.activeObjectPolymorphism.get(value);
      if (!active) {
        active = new Set<OpenAPIV3.SchemaObject>();
        this.activeObjectPolymorphism.set(value, active);
      }
      return active;
    }
    return this.activePrimitivePolymorphism;
  }

  public trackPolymorphism(
    value: unknown,
    schema: OpenAPIV3.SchemaObject,
    fn: () => void
  ): void {
    const active = this.getActiveSchemasSet(value);

    if (active.has(schema)) {
      return;
    }

    active.add(schema);
    try {
      fn();
    } finally {
      active.delete(schema);
    }
  }

  pushPath(segment: string | number): void {
    this.currentPath = { segment, parent: this.currentPath };
  }

  popPath(): void {
    this.currentPath = this.currentPath?.parent || null;
  }

  formatPath(): string {
    const segments: (string | number)[] = [];
    let current = this.currentPath;
    while (current !== null) {
      segments.push(current.segment);
      current = current.parent;
    }
    segments.reverse();

    let result = '';
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (typeof segment === 'number') {
        result += `[${segment}]`;
      } else {
        if (result.length > 0) {
          result += `.${segment}`;
        } else {
          result += segment;
        }
      }
    }
    return result;
  }

  private hasIssue(
    issue: Pick<ValidationIssue, 'path' | 'message' | 'severity'>
  ): boolean {
    return this.issues.some(
      (existing) =>
        existing.path === issue.path &&
        existing.message === issue.message &&
        existing.severity === issue.severity
    );
  }

  addIssue(
    message: string,
    severity: IssueSeverity,
    branches?: ValidationIssue[][]
  ): void {
    const path = this.formatPath();
    const newIssue: ValidationIssue = {
      path,
      message,
      severity,
      ...(branches ? { branches } : {})
    };
    if (!this.hasIssue(newIssue)) {
      this.issues.push(newIssue);
    }
  }

  addError(message: string, branches?: ValidationIssue[][]): void {
    this.addIssue(message, 'error', branches);
  }

  addWarning(message: string): void {
    this.addIssue(message, 'warning');
  }

  addIssues(newIssues: ValidationIssue[]): void {
    for (const issue of newIssues) {
      if (!this.hasIssue(issue)) {
        this.issues.push(issue);
      }
    }
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }
}
