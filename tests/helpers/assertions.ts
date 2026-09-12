import { ValidationContext } from '../../src/core/ValidationContext.js';
import { expect } from 'vitest';

export function assertValid(ctx: ValidationContext): void {
  if (ctx.hasErrors()) {
    const errorMsg = `Expected ValidationContext to be valid, but it has the following errors:\n${ctx.errors.map((e) => `  - [${e.path}] ${e.message}`).join('\n')}`;
    expect.fail(errorMsg);
  }
}

export function assertHasValidationError(
  ctx: ValidationContext,
  expectedMessage: string | RegExp
): void {
  const errors = ctx.errors;

  const firstErrorObj = errors[0];

  if (firstErrorObj === undefined) {
    const errorMsg = `Expected ValidationContext to have validation error matching/containing "${expectedMessage}", but no errors were recorded.`;
    expect.fail(errorMsg);
  }

  const firstErrorStr = `[${firstErrorObj.path}] ${firstErrorObj.message}`;

  const pass =
    expectedMessage instanceof RegExp
      ? new RegExp(expectedMessage.source, expectedMessage.flags).test(
          firstErrorStr
        )
      : firstErrorStr.includes(expectedMessage);

  if (!pass) {
    const errorMsg = `Expected first validation error to match/contain "${expectedMessage}", but it didn't.\nErrors found:\n${errors.map((e) => `  - [${e.path}] ${e.message}`).join('\n')}`;
    expect.fail(errorMsg);
  }
}
