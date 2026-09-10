export interface PathNode {
  readonly segment: string | number;
  readonly parent: PathNode | null;
}

export class ValidationContext {
  public readonly errors: string[] = [];
  public readonly visited = new Set<object>();
  public currentPath: PathNode | null = null;

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
      if (segment === undefined) continue;
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

  addError(message: string): void {
    this.errors.push(`[${this.formatPath()}] ${message}`);
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }
}
