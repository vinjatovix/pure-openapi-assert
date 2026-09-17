import { safeStringify } from './utils.js';

// Enums and Constants
export function formatEnumError(allowed: unknown[], received: unknown): string {
  return `Expected one of [${allowed.join(', ')}], received ${safeStringify(received)}`;
}

export function formatConstError(expected: unknown, received: unknown): string {
  return `Expected exactly ${safeStringify(expected)}, received ${safeStringify(received)}`;
}

// Core Types
export function formatTypeError(expected: string, received: string): string {
  return `Expected ${expected}, received ${received}`;
}

// Numeric Limits & Multiples
export function formatMinError(args: {
  value: unknown;
  minimum: unknown;
  exclusive: boolean;
}): string {
  const { value, minimum, exclusive } = args;
  return `Value ${String(value)} is less than ${exclusive ? 'or equal to ' : ''}minimum ${String(minimum)}`;
}

export function formatMaxError(args: {
  value: unknown;
  maximum: unknown;
  exclusive: boolean;
}): string {
  const { value, maximum, exclusive } = args;
  return `Value ${String(value)} is greater than ${exclusive ? 'or equal to ' : ''}maximum ${String(maximum)}`;
}

export function formatMultipleOfError(
  value: unknown,
  multipleOf: unknown
): string {
  return `Value ${String(value)} is not a multiple of ${String(multipleOf)}`;
}

// Numeric Range Formats
export function formatInt32Error(receivedTypeOrVal: string): string {
  return `Expected 32-bit integer, received ${receivedTypeOrVal}`;
}

export function formatInt64Error(receivedTypeOrVal: string): string {
  return `Expected 64-bit integer, received ${receivedTypeOrVal}`;
}

export function formatInt64InvalidError(value: unknown): string {
  return `Value ${String(value)} is not a valid 64-bit integer`;
}

export function formatInt64ExceedsError(value: unknown): string {
  return `Value ${String(value)} exceeds 64-bit integer limits`;
}

export function formatFloatError(receivedTypeOrVal: string): string {
  return `Expected 32-bit float, received ${receivedTypeOrVal}`;
}

export function formatDoubleError(value: unknown): string {
  return `Expected 64-bit float, received ${String(value)}`;
}

// String Constraints
export function formatStringMinLengthError(
  length: number,
  minLength: number
): string {
  return `String length ${length} is less than minimum ${minLength}`;
}

export function formatStringMaxLengthError(
  length: number,
  maxLength: number
): string {
  return `String length ${length} exceeds maximum ${maxLength}`;
}

export function formatStringPatternError(pattern: string): string {
  return `String does not match pattern ${pattern}`;
}

export function formatStringFormatError(
  format: string,
  received: string
): string {
  return `Expected string format '${format}', received '${received}'`;
}

// Arrays
export function formatArrayMinItemsError(
  length: number,
  minItems: number
): string {
  return `Array has ${length} items, minimum is ${minItems}`;
}

export function formatArrayMaxItemsError(
  length: number,
  maxItems: number
): string {
  return `Array has ${length} items, maximum is ${maxItems}`;
}

export function formatArrayUniqueError(): string {
  return 'Array elements must be unique';
}

export function formatExpectedArrayError(receivedType: string): string {
  return `Expected array, received ${receivedType}`;
}

// Objects
export function formatExpectedObjectError(receivedType: string): string {
  return `Expected object, received ${receivedType}`;
}

export function formatObjectMinPropertiesError(
  length: number,
  minProperties: number
): string {
  return `Object has ${length} properties, minimum is ${minProperties}`;
}

export function formatObjectMaxPropertiesError(
  length: number,
  maxProperties: number
): string {
  return `Object has ${length} properties, maximum is ${maxProperties}`;
}

export function formatRequiredFieldError(): string {
  return 'Missing required field';
}

export function formatAdditionalPropertiesError(key: string): string {
  return `Key '${key}' is not allowed by OpenAPI schema`;
}

// Structural & Nullable Metadata
export function formatNullableError(): string {
  return 'Field is not nullable but received null';
}

export function formatWriteOnlyError(): string {
  return 'Field is writeOnly and must not be present in the response';
}

export function formatRequiredPropertyError(): string {
  return 'Field is required but received undefined';
}

export function formatCyclicNotSchemaError(): string {
  return 'Cyclic not schema detected';
}

export function formatProhibitedSchemaError(): string {
  return 'Value matches prohibited schema';
}

// Discriminators
export function formatDiscriminatorNotObjectError(): string {
  return 'Discriminator validation failed: value is not an object';
}

export function formatDiscriminatorMissingPropertyError(
  propertyName: string
): string {
  return `Discriminator property '${propertyName}' is missing in object`;
}

export function formatDiscriminatorNotPrimitiveError(
  propertyName: string
): string {
  return `Discriminator property '${propertyName}' must be a primitive value`;
}

export function formatDiscriminatorMismatchError(args: {
  propertyName: string;
  value: string;
  compositionType: string;
}): string {
  const { propertyName, value, compositionType } = args;
  return `Discriminator '${propertyName}' value '${value}' does not match any schema in '${compositionType}'`;
}

// References
export function formatUnresolvedRefError(ref: string): string {
  return `Unresolved $ref: '${ref}'. Ensure your OpenAPI spec is fully dereferenced.`;
}
