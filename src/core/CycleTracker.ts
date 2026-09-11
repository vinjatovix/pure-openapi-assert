export const CYCLE_DETECTED = Symbol('CYCLE_DETECTED');

export class CycleTracker {
  private readonly visited = new Set<unknown>();

  public track<T>(item: unknown, fn: () => T): T | typeof CYCLE_DETECTED {
    if (item !== null && typeof item === 'object') {
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

    return fn();
  }
}
