import { CycleTracker, CYCLE_DETECTED } from '../core/CycleTracker.js';
import {
  describeType,
  isPrimitive,
  isSchemaObject,
  isArraySchema,
  safeStringify
} from '../core/utils.js';
import { type ValidationArgs } from './args.js';
import {
  formatArrayMinItemsError,
  formatArrayMaxItemsError,
  formatArrayUniqueError,
  formatExpectedArrayError
} from '../core/errors.js';

function validateArrayBounds(args: ValidationArgs<unknown[]>): void {
  const { value, schema, ctx } = args;
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    ctx.addError(formatArrayMinItemsError(value.length, schema.minItems));
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    ctx.addError(formatArrayMaxItemsError(value.length, schema.maxItems));
  }
}

function canonicalStringify(
  value: unknown,
  tracker: CycleTracker
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'bigint') {
    return `__bigint__${value.toString()}`;
  }
  if (typeof value !== 'object') {
    return safeStringify(value);
  }

  const result = tracker.track(value, () => {
    if (Array.isArray(value)) {
      const parts: string[] = [];
      for (const item of value) {
        const stringified = canonicalStringify(item, tracker);
        parts.push(stringified === undefined ? 'null' : stringified);
      }
      return `[${parts.join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const val = (value as Record<string, unknown>)[key];
      const stringified = canonicalStringify(val, tracker);
      if (stringified !== undefined) {
        parts.push(`${safeStringify(key)}:${stringified}`);
      }
    }
    return `{${parts.join(',')}}`;
  });

  if (result === CYCLE_DETECTED) {
    return '__CYCLE__';
  }
  return result;
}

function validateArrayUnique(args: ValidationArgs<unknown[]>): void {
  const { value, schema, ctx } = args;
  if (!schema.uniqueItems) {
    return;
  }

  const seenPrimitives = new Set<unknown>();
  const seenObjects = new Set<string | undefined>();
  const tracker = new CycleTracker();

  for (const item of value) {
    if (isPrimitive(item) || item === null) {
      if (seenPrimitives.has(item)) {
        ctx.addError(formatArrayUniqueError());
        return;
      }
      seenPrimitives.add(item);
    } else {
      const serialized = canonicalStringify(item, tracker);
      if (seenObjects.has(serialized)) {
        ctx.addError(formatArrayUniqueError());
        return;
      }
      seenObjects.add(serialized);
    }
  }
}

function validateArrayItems(args: ValidationArgs<unknown[]>): void {
  const { value, schema, ctx, validateShape, customFormats } = args;
  if (!isArraySchema(schema)) {
    return;
  }
  const itemsSchema: unknown = schema.items;
  if (!isSchemaObject(itemsSchema)) {
    return;
  }

  for (let i = 0; i < value.length; i++) {
    ctx.pushPath(i);
    validateShape({
      value: value[i],
      schema: itemsSchema,
      ctx,
      validateShape,
      customFormats
    });
    ctx.popPath();
  }
}

export function validateArray(args: ValidationArgs): void {
  const { value, ctx } = args;
  if (!Array.isArray(value)) {
    ctx.addError(formatExpectedArrayError(describeType(value)));
    return;
  }

  if (ctx.visited.has(value)) {
    return;
  }
  ctx.visited.add(value);

  try {
    const arrayArgs = args as ValidationArgs<unknown[]>;
    validateArrayBounds(arrayArgs);
    validateArrayUnique(arrayArgs);
    validateArrayItems(arrayArgs);
  } finally {
    ctx.visited.delete(value);
  }
}
