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
  code?: string;
  branches?: ValidationIssue[][];
}

export interface ValidationContextOptions {
  spec?: OpenAPIV3.Document | undefined;
  visited?: Set<object> | undefined;
  activeObjectPolymorphism?:
    WeakMap<object, Set<OpenAPIV3.SchemaObject>> | undefined;
  activePrimitivePolymorphism?: Set<OpenAPIV3.SchemaObject> | undefined;
  issues?: ValidationIssue[] | undefined;
  activeObjectNegations?:
    WeakMap<object, Set<OpenAPIV3.SchemaObject>> | undefined;
  activePrimitiveNegations?: Set<OpenAPIV3.SchemaObject> | undefined;
}

export class ValidationContext {
  public readonly spec?: OpenAPIV3.Document | undefined;
  public readonly issues: ValidationIssue[];
  public readonly visited: Set<object>;
  public currentPath: PathNode | null = null;
  private readonly activeObjectPolymorphism: WeakMap<
    object,
    Set<OpenAPIV3.SchemaObject>
  >;
  private readonly activePrimitivePolymorphism: Set<OpenAPIV3.SchemaObject>;
  private readonly activeObjectNegations: WeakMap<
    object,
    Set<OpenAPIV3.SchemaObject>
  >;
  private readonly activePrimitiveNegations: Set<OpenAPIV3.SchemaObject>;
  private readonly issueKeys = new Set<string>();

  constructor(options: ValidationContextOptions = {}) {
    this.spec = options.spec;
    this.visited = options.visited ?? new Set<object>();
    this.activeObjectPolymorphism =
      options.activeObjectPolymorphism ??
      new WeakMap<object, Set<OpenAPIV3.SchemaObject>>();
    this.activePrimitivePolymorphism =
      options.activePrimitivePolymorphism ?? new Set<OpenAPIV3.SchemaObject>();
    this.issues = options.issues ?? [];
    this.activeObjectNegations =
      options.activeObjectNegations ??
      new WeakMap<object, Set<OpenAPIV3.SchemaObject>>();
    this.activePrimitiveNegations =
      options.activePrimitiveNegations ?? new Set<OpenAPIV3.SchemaObject>();
    for (const issue of this.issues) {
      this.issueKeys.add(this.getIssueKey(issue));
    }
  }

  private getIssueKey(
    issue: Pick<ValidationIssue, 'path' | 'message' | 'severity' | 'code'>
  ): string {
    return `${issue.path}::${issue.severity}::${issue.message}::${issue.code || ''}`;
  }

  get errors(): readonly ValidationIssue[] {
    return this.issues.filter((i) => i.severity === 'error');
  }

  get warnings(): readonly ValidationIssue[] {
    return this.issues.filter((i) => i.severity === 'warning');
  }

  /**
   * Creates a nested child validation context for sub-schema validation.
   *
   * @note mutability of activeObjectNegations:
   * By passing the direct reference of `activeObjectNegations` to the child, both contexts
   * share state mutations in the WeakMap. Because this validation engine processes schemas
   * in a strictly synchronous, sequential manner, and negation states are properly isolated
   * and restored using try/finally blocks (via pushNegation/popNegation), this reference
   * sharing is highly performant and completely safe under the current execution model.
   * However, if asynchronous or concurrent schema evaluation is introduced in the future,
   * this shared WeakMap will cause race conditions and must be refactored to clone or isolate state.
   */
  createChildContext({
    resetVisited = false
  }: { resetVisited?: boolean } = {}): ValidationContext {
    const child = new ValidationContext({
      spec: this.spec,
      visited: resetVisited ? new Set<object>() : new Set<object>(this.visited),
      activeObjectPolymorphism: this.activeObjectPolymorphism,
      activePrimitivePolymorphism: new Set<OpenAPIV3.SchemaObject>(
        this.activePrimitivePolymorphism
      ),
      activeObjectNegations: this.activeObjectNegations,
      activePrimitiveNegations: new Set<OpenAPIV3.SchemaObject>(
        this.activePrimitiveNegations
      )
    });
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

  public hasActiveNegation(
    value: unknown,
    schema: OpenAPIV3.SchemaObject
  ): boolean {
    if (isPlainObject(value) || Array.isArray(value)) {
      const active = this.activeObjectNegations.get(value);
      return active?.has(schema) ?? false;
    }
    return this.activePrimitiveNegations.has(schema);
  }

  public pushNegation(value: unknown, schema: OpenAPIV3.SchemaObject): void {
    if (isPlainObject(value) || Array.isArray(value)) {
      let active = this.activeObjectNegations.get(value);
      if (!active) {
        active = new Set<OpenAPIV3.SchemaObject>();
        this.activeObjectNegations.set(value, active);
      }
      active.add(schema);
    } else {
      this.activePrimitiveNegations.add(schema);
    }
  }

  public popNegation(value: unknown, schema: OpenAPIV3.SchemaObject): void {
    if (isPlainObject(value) || Array.isArray(value)) {
      const active = this.activeObjectNegations.get(value);
      active?.delete(schema);
    } else {
      this.activePrimitiveNegations.delete(schema);
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
    return this.issueKeys.has(this.getIssueKey(issue));
  }

  addIssue(
    message: string,
    severity: IssueSeverity,
    options?: { branches?: ValidationIssue[][]; code?: string }
  ): void {
    const path = this.formatPath();
    const newIssue: ValidationIssue = {
      path,
      message,
      severity,
      ...(options?.code ? { code: options.code } : {}),
      ...(options?.branches ? { branches: options.branches } : {})
    };
    if (!this.hasIssue(newIssue)) {
      this.issues.push(newIssue);
      this.issueKeys.add(this.getIssueKey(newIssue));
    }
  }

  addError(
    message: string,
    options?: { branches?: ValidationIssue[][]; code?: string }
  ): void {
    this.addIssue(message, 'error', options);
  }

  addWarning(message: string): void {
    this.addIssue(message, 'warning');
  }

  addIssues(newIssues: ValidationIssue[]): void {
    for (const issue of newIssues) {
      if (!this.hasIssue(issue)) {
        this.issues.push(issue);
        this.issueKeys.add(this.getIssueKey(issue));
      }
    }
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }
}
