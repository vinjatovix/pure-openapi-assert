export const CYCLE_DETECTED = Symbol('CYCLE_DETECTED');

export class CycleTracker {
  private readonly visited = new Set<object>();

  public track<T>(item: object, fn: () => T): T | typeof CYCLE_DETECTED {
    if (this.visited.has(item)) {
      return CYCLE_DETECTED;
    }
    this.visited.add(item);
    try {
      return fn();
    } finally {
      this.visited.delete(item);
    }
  }
}
