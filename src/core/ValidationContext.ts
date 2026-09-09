export class ValidationContext {
  public readonly errors: string[] = [];
  public readonly visited = new Set<object>();
  public path: (string | number)[] = [];

  pushPath(segment: string | number): void {
    this.path.push(segment);
  }

  popPath(): void {
    this.path.pop();
  }

  formatPath(): string {
    let result = '';
    for (let i = 0; i < this.path.length; i++) {
      const segment = this.path[i];
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
