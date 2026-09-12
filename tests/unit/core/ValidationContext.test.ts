import { describe, it, expect } from 'vitest';
import { ValidationContext, type ValidationError } from '../../../src/index.js';

describe('ValidationContext (Unit)', () => {
  it('should initialize with empty errors and visited set', () => {
    const ctx = new ValidationContext();
    expect(ctx.errors).toEqual([]);
    expect(ctx.visited.size).toBe(0);
    expect(ctx.currentPath).toBeNull();
  });

  it('should push and pop path segments correctly (O(1) linked list)', () => {
    const ctx = new ValidationContext();
    ctx.pushPath('body');
    expect(ctx.currentPath).toEqual({ segment: 'body', parent: null });

    ctx.pushPath('users');
    expect(ctx.currentPath).toEqual({
      segment: 'users',
      parent: { segment: 'body', parent: null }
    });

    ctx.pushPath(0);
    expect(ctx.currentPath).toEqual({
      segment: 0,
      parent: {
        segment: 'users',
        parent: { segment: 'body', parent: null }
      }
    });

    ctx.popPath();
    expect(ctx.currentPath).toEqual({
      segment: 'users',
      parent: { segment: 'body', parent: null }
    });

    ctx.popPath();
    expect(ctx.currentPath).toEqual({ segment: 'body', parent: null });

    ctx.popPath();
    expect(ctx.currentPath).toBeNull();
  });

  it('should format path correctly', () => {
    const ctx = new ValidationContext();
    expect(ctx.formatPath()).toBe('');

    ctx.pushPath('body');
    expect(ctx.formatPath()).toBe('body');

    ctx.pushPath('users');
    expect(ctx.formatPath()).toBe('body.users');

    ctx.pushPath(0);
    expect(ctx.formatPath()).toBe('body.users[0]');

    ctx.pushPath('name');
    expect(ctx.formatPath()).toBe('body.users[0].name');
  });

  it('should add errors in the correct path-based format', () => {
    const ctx = new ValidationContext();
    ctx.pushPath('body');
    ctx.pushPath('id');
    ctx.addError('is required');

    expect(ctx.errors).toEqual([{ path: 'body.id', message: 'is required' }]);
    expect(ctx.hasErrors()).toBe(true);
  });

  it('should export and allow using the ValidationError type', () => {
    const error: ValidationError = {
      path: 'body.id',
      message: 'is required',
      branches: [[{ path: 'body.id', message: 'failed branch 1' }]]
    };
    expect(error.path).toBe('body.id');
    expect(error.message).toBe('is required');
    expect(error.branches?.[0]?.[0]?.message).toBe('failed branch 1');
  });
});
