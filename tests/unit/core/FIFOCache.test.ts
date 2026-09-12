import { describe, expect, it } from 'vitest';
import { FIFOCache } from '../../../src/core/FIFOCache.js';
import { MAX_CACHE_SIZE } from '../../../src/core/constants.js';

describe('core/FIFOCache', () => {
  it('should behave like a standard Map', () => {
    const cache = new FIFOCache<string, number>();
    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.size).toBe(2);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('c')).toBe(false);
  });

  it('should evict the oldest entry in FIFO order when max size is exceeded', () => {
    const cache = new FIFOCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.size).toBe(2);
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    expect(cache.has('c')).toBe(true);
  });

  it('should not evict when updating an existing key', () => {
    const cache = new FIFOCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);

    expect(cache.size).toBe(2);
    expect(cache.has('a')).toBe(true);
    expect(cache.get('a')).toBe(10);
    expect(cache.has('b')).toBe(true);
  });

  it('should use MAX_CACHE_SIZE as default limit', () => {
    const cache = new FIFOCache<number, number>();

    for (let i = 0; i < MAX_CACHE_SIZE + 1; i++) {
      cache.set(i, i);
    }
    expect(cache.size).toBe(MAX_CACHE_SIZE);
    expect(cache.has(0)).toBe(false);
    expect(cache.has(MAX_CACHE_SIZE)).toBe(true);
  });
});
