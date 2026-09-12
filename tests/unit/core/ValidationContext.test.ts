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

  it('should support adding structured warnings and prevent duplicates', () => {
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

    // Adding duplicate warning should be ignored
    ctx.addWarning('is deprecated');
    expect(ctx.warnings).toHaveLength(1);

    // Adding warning with different path is not a duplicate
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
    const ctx = new ValidationContext();
    ctx.issues.push({
      path: 'body.field1',
      message: 'warn 1',
      severity: 'warning'
    });

    ctx.addIssues([
      { path: 'body.field1', message: 'warn 1', severity: 'warning' }, // duplicate, should be ignored
      { path: 'body.field2', message: 'warn 2', severity: 'warning' }, // new warning, should be added
      { path: 'body.field3', message: 'err 1', severity: 'error' } // new error, should be added
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
});
