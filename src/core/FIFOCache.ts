import { MAX_CACHE_SIZE } from './constants.js';

export class FIFOCache<K, V> extends Map<K, V> {
  private readonly maxSize: number;

  constructor(maxSize: number = MAX_CACHE_SIZE) {
    super();
    if (maxSize <= 0) {
      throw new Error('Cache size must be greater than 0');
    }
    this.maxSize = maxSize;
  }

  override set(key: K, value: V): this {
    if (this.size >= this.maxSize && !this.has(key)) {
      const firstKey = this.keys().next().value;
      this.delete(firstKey as K);
    }
    return super.set(key, value);
  }
}
