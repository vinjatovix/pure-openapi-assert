import { describe, it, expect } from 'vitest';
import { getCachedRegex } from '../../../src/validators/format.js';

describe('validators/format', () => {
  describe('getCachedRegex', () => {
    it('should cache regular expressions and reuse them', () => {
      const rx1 = getCachedRegex('^[a-z]+$');
      const rx2 = getCachedRegex('^[a-z]+$');
      expect(rx1).toBe(rx2);
    });

    it('should evict the oldest entry in FIFO order when cache size exceeds the limit', () => {
      const firstRx = getCachedRegex('^pattern-0$');

      for (let i = 1; i <= 1000; i++) {
        getCachedRegex(`^pattern-${i}$`);
      }

      const firstRxAfterEviction = getCachedRegex('^pattern-0$');

      expect(firstRx).not.toBe(firstRxAfterEviction);
    });
  });
});
