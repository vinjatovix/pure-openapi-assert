import type { OpenAPIV3 } from 'openapi-types';
import { CycleTracker, CYCLE_DETECTED } from '../core/CycleTracker.js';
import { isPrimitive, isSchemaObject } from '../core/utils.js';
import { type ValidationArgs } from './args.js';

function validateArrayBounds(args: ValidationArgs<unknown[]>): void {
  const { value, schema, ctx } = args;
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    ctx.addError(
      `Array has ${value.length} items, minimum is ${schema.minItems}`
    );
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    ctx.addError(
      `Array has ${value.length} items, maximum is ${schema.maxItems}`
    );
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
  if (typeof value !== 'object') {
    return JSON.stringify(value);
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
        parts.push(`${JSON.stringify(key)}:${stringified}`);
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
        ctx.addError('Array elements must be unique');
        return;
      }
      seenPrimitives.add(item);
    } else {
      const serialized = canonicalStringify(item, tracker);
      if (seenObjects.has(serialized)) {
        ctx.addError('Array elements must be unique');
        return;
      }
      seenObjects.add(serialized);
    }
  }
}

function validateArrayItems(args: ValidationArgs<unknown[]>): void {
  const { value, schema, ctx, validateShape, customFormats } = args;
  const arraySchema = schema as OpenAPIV3.ArraySchemaObject;
  const itemsSchema: unknown = arraySchema.items;
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
    ctx.addError(
      `Expected array, received ${value === null ? 'null' : typeof value}`
    );
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
