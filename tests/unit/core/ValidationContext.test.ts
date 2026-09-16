import { describe, it, expect } from 'vitest';
import { ValidationContext, type ValidationIssue } from '../../../src/index.js';

describe('core/ValidationContext', () => {
  it('should initialize with empty issues, errors, warnings, and visited set', () => {
    const ctx = new ValidationContext();

    expect(ctx.issues).toEqual([]);
    expect(ctx.errors).toEqual([]);
    expect(ctx.warnings).toEqual([]);
    expect(ctx.visited.size).toBe(0);
    expect(ctx.currentPath).toBeNull();
  });

  it('should initialize with currentPath as null', () => {
    const ctx = new ValidationContext();

    const result = ctx.currentPath;

    expect(result).toBeNull();
  });

  it('should push a single path segment correctly', () => {
    const ctx = new ValidationContext();

    ctx.pushPath('body');

    expect(ctx.currentPath).toEqual({ segment: 'body', parent: null });
  });

  it('should push multiple nested path segments', () => {
    const ctx = new ValidationContext();
    ctx.pushPath('body');

    ctx.pushPath('users');

    expect(ctx.currentPath).toEqual({
      segment: 'users',
      parent: { segment: 'body', parent: null }
    });
  });

  it('should push numeric segments for array indices', () => {
    const ctx = new ValidationContext();
    ctx.pushPath('body');
    ctx.pushPath('users');

    ctx.pushPath(0);

    expect(ctx.currentPath).toEqual({
      segment: 0,
      parent: {
        segment: 'users',
        parent: { segment: 'body', parent: null }
      }
    });
  });

  it('should pop a path segment to restore the parent path', () => {
    const ctx = new ValidationContext();
    ctx.pushPath('body');
    ctx.pushPath('users');
    ctx.pushPath(0);

    ctx.popPath();

    expect(ctx.currentPath).toEqual({
      segment: 'users',
      parent: { segment: 'body', parent: null }
    });
  });

  it('should pop back to the root path segment', () => {
    const ctx = new ValidationContext();
    ctx.pushPath('body');
    ctx.pushPath('users');

    ctx.popPath();

    expect(ctx.currentPath).toEqual({ segment: 'body', parent: null });
  });

  it('should pop the last path segment to make currentPath null', () => {
    const ctx = new ValidationContext();
    ctx.pushPath('body');

    ctx.popPath();

    expect(ctx.currentPath).toBeNull();
  });

  it('should format path as empty string when no segments are pushed', () => {
    const ctx = new ValidationContext();

    const result = ctx.formatPath();

    expect(result).toBe('');
  });

  it('should format path with a single segment', () => {
    const ctx = new ValidationContext();
    ctx.pushPath('body');

    const result = ctx.formatPath();

    expect(result).toBe('body');
  });

  it('should format path with nested object segments', () => {
    const ctx = new ValidationContext();
    ctx.pushPath('body');
    ctx.pushPath('users');

    const result = ctx.formatPath();

    expect(result).toBe('body.users');
  });

  it('should format path with array index segment', () => {
    const ctx = new ValidationContext();
    ctx.pushPath('body');
    ctx.pushPath('users');
    ctx.pushPath(0);

    const result = ctx.formatPath();

    expect(result).toBe('body.users[0]');
  });

  it('should format path with segment following an array index', () => {
    const ctx = new ValidationContext();
    ctx.pushPath('body');
    ctx.pushPath('users');
    ctx.pushPath(0);
    ctx.pushPath('name');

    const result = ctx.formatPath();

    expect(result).toBe('body.users[0].name');
  });

  it('should add errors in the correct path-based format', () => {
    const ctx = new ValidationContext();
    ctx.pushPath('body');
    ctx.pushPath('id');

    ctx.addError('is required');

    expect(ctx.errors).toEqual([
      { path: 'body.id', message: 'is required', severity: 'error' }
    ]);
    expect(ctx.hasErrors()).toBe(true);
  });

  it('should support and allow using the ValidationIssue type for errors', () => {
    const error: ValidationIssue = {
      path: 'body.id',
      message: 'is required',
      severity: 'error',
      branches: [
        [{ path: 'body.id', message: 'failed branch 1', severity: 'error' }]
      ]
    };

    expect(error.path).toBe('body.id');
    expect(error.message).toBe('is required');
    expect(error.severity).toBe('error');
    expect(error.branches?.[0]?.[0]?.message).toBe('failed branch 1');
  });

  it('should support adding structured warnings', () => {
    const ctx = new ValidationContext();
    ctx.pushPath('body');
    ctx.pushPath('oldField');

    ctx.addWarning('is deprecated');

    expect(ctx.warnings).toEqual([
      { path: 'body.oldField', message: 'is deprecated', severity: 'warning' }
    ]);
    expect(ctx.issues).toEqual([
      { path: 'body.oldField', message: 'is deprecated', severity: 'warning' }
    ]);
  });

  it('should prevent duplicate warnings at the same path', () => {
    const ctx = new ValidationContext();
    ctx.pushPath('body');
    ctx.pushPath('oldField');
    ctx.addWarning('is deprecated');

    ctx.addWarning('is deprecated');

    expect(ctx.warnings).toHaveLength(1);
  });

  it('should allow warnings with the same message at different paths', () => {
    const ctx = new ValidationContext();
    ctx.pushPath('body');
    ctx.pushPath('oldField');
    ctx.addWarning('is deprecated');
    ctx.pushPath('newField');

    ctx.addWarning('is deprecated');

    expect(ctx.warnings).toEqual([
      { path: 'body.oldField', message: 'is deprecated', severity: 'warning' },
      {
        path: 'body.oldField.newField',
        message: 'is deprecated',
        severity: 'warning'
      }
    ]);
  });

  it('should support merging arrays of issues cleanly via addIssues', () => {
    const ctx = new ValidationContext({
      issues: [
        {
          path: 'body.field1',
          message: 'warn 1',
          severity: 'warning'
        }
      ]
    });

    ctx.addIssues([
      { path: 'body.field1', message: 'warn 1', severity: 'warning' },
      { path: 'body.field2', message: 'warn 2', severity: 'warning' },
      { path: 'body.field3', message: 'err 1', severity: 'error' }
    ]);

    expect(ctx.warnings).toEqual([
      { path: 'body.field1', message: 'warn 1', severity: 'warning' },
      { path: 'body.field2', message: 'warn 2', severity: 'warning' }
    ]);
    expect(ctx.errors).toEqual([
      { path: 'body.field3', message: 'err 1', severity: 'error' }
    ]);
    expect(ctx.issues).toEqual([
      { path: 'body.field1', message: 'warn 1', severity: 'warning' },
      { path: 'body.field2', message: 'warn 2', severity: 'warning' },
      { path: 'body.field3', message: 'err 1', severity: 'error' }
    ]);
  });

  it('should support and allow using the ValidationIssue type for warnings', () => {
    const warning: ValidationIssue = {
      path: 'body.oldField',
      message: 'is deprecated',
      severity: 'warning'
    };

    expect(warning.path).toBe('body.oldField');
    expect(warning.message).toBe('is deprecated');
    expect(warning.severity).toBe('warning');
  });

  it('should handle popNegation on a plain object with no active negation', () => {
    const ctx = new ValidationContext();
    const obj = { foo: 'bar' };
    const schema = { type: 'object' as const };

    ctx.popNegation(obj, schema);

    expect(ctx.hasActiveNegation(obj, schema)).toBe(false);
  });
});

describe('core/ValidationContext Child Instantiation optimizations', () => {
  it('should clone the visited set when creating a child context by default', () => {
    const parent = new ValidationContext();
    const mockObject = {};
    parent.visited.add(mockObject);

    const child = parent.createChildContext();

    expect(child.visited.has(mockObject)).toBe(true);
    expect(child.visited).not.toBe(parent.visited);
  });

  it('should instantiate an empty visited set when resetVisited is true', () => {
    const parent = new ValidationContext();
    const mockObject = {};
    parent.visited.add(mockObject);

    const child = parent.createChildContext({ resetVisited: true });

    expect(child.visited.size).toBe(0);
    expect(child.visited.has(mockObject)).toBe(false);
  });

  it('should inherit activePrimitiveNegations from the parent context', () => {
    const parent = new ValidationContext();
    const mockSchema = { type: 'string' } as const;
    parent.pushNegation('test-string', mockSchema);

    const child = parent.createChildContext();

    expect(child.hasActiveNegation('test-string', mockSchema)).toBe(true);
  });

  it('should not reflect activePrimitiveNegations pushed to the child context in the parent', () => {
    const parent = new ValidationContext();
    const child = parent.createChildContext();
    const mockSchema = { type: 'number' } as const;

    child.pushNegation(42, mockSchema);

    expect(parent.hasActiveNegation(42, mockSchema)).toBe(false);
  });

  it('should keep activePrimitiveNegations active in the child context when pushed to the child', () => {
    const parent = new ValidationContext();
    const child = parent.createChildContext();
    const mockSchema = { type: 'number' } as const;

    child.pushNegation(42, mockSchema);

    expect(child.hasActiveNegation(42, mockSchema)).toBe(true);
  });

  it('should not affect parent activePrimitiveNegations when popped in the child context', () => {
    const parent = new ValidationContext();
    const mockSchema = { type: 'string' } as const;
    parent.pushNegation('test-string', mockSchema);
    const child = parent.createChildContext();

    child.popNegation('test-string', mockSchema);

    expect(parent.hasActiveNegation('test-string', mockSchema)).toBe(true);
  });

  it('should deactivate child activePrimitiveNegations when popped in the child context', () => {
    const parent = new ValidationContext();
    const mockSchema = { type: 'string' } as const;
    parent.pushNegation('test-string', mockSchema);
    const child = parent.createChildContext();

    child.popNegation('test-string', mockSchema);

    expect(child.hasActiveNegation('test-string', mockSchema)).toBe(false);
  });

  it('should not affect sibling activePrimitiveNegations when pushed in other sibling', () => {
    const parent = new ValidationContext();
    const child1 = parent.createChildContext();
    const child2 = parent.createChildContext();
    const mockSchema = { type: 'string' } as const;

    child1.pushNegation('test-string', mockSchema);

    expect(child2.hasActiveNegation('test-string', mockSchema)).toBe(false);
  });
});
