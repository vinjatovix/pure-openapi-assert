import { describe, it, expect } from 'vitest';
import * as errors from '../../../src/core/errors.js';

describe('core/errors message formatting', () => {
  it('should format enum error strings correctly', () => {
    const allowed = ['admin', 'user'];
    const received = 'guest';

    const result = errors.formatEnumError(allowed, received);

    expect(result).toBe('Expected one of [admin, user], received "guest"');
  });

  it('should format const error strings correctly', () => {
    const expected = 42;
    const received = 43;

    const result = errors.formatConstError(expected, received);

    expect(result).toBe('Expected exactly 42, received 43');
  });

  it('should format type error strings correctly', () => {
    const expected = 'string';
    const received = 'number';

    const result = errors.formatTypeError(expected, received);

    expect(result).toBe('Expected string, received number');
  });

  it('should format minimum error strings correctly (inclusive)', () => {
    const value = 4;
    const minimum = 5;
    const exclusive = false;

    const result = errors.formatMinError({ value, minimum, exclusive });

    expect(result).toBe('Value 4 is less than minimum 5');
  });

  it('should format minimum error strings correctly (exclusive)', () => {
    const value = 5;
    const minimum = 5;
    const exclusive = true;

    const result = errors.formatMinError({ value, minimum, exclusive });

    expect(result).toBe('Value 5 is less than or equal to minimum 5');
  });

  it('should format maximum error strings correctly (inclusive)', () => {
    const value = 6;
    const maximum = 5;
    const exclusive = false;

    const result = errors.formatMaxError({ value, maximum, exclusive });

    expect(result).toBe('Value 6 is greater than maximum 5');
  });

  it('should format maximum error strings correctly (exclusive)', () => {
    const value = 5;
    const maximum = 5;
    const exclusive = true;

    const result = errors.formatMaxError({ value, maximum, exclusive });

    expect(result).toBe('Value 5 is greater than or equal to maximum 5');
  });

  it('should format multipleOf error strings correctly', () => {
    const value = 7;
    const multipleOf = 3;

    const result = errors.formatMultipleOfError(value, multipleOf);

    expect(result).toBe('Value 7 is not a multiple of 3');
  });

  it('should format int32 error strings correctly', () => {
    const received = '5.5';

    const result = errors.formatInt32Error(received);

    expect(result).toBe('Expected 32-bit integer, received 5.5');
  });

  it('should format int64 error strings correctly', () => {
    const received = '9007199254740993';

    const result = errors.formatInt64Error(received);

    expect(result).toBe('Expected 64-bit integer, received 9007199254740993');
  });

  it('should format int64 invalid error strings correctly', () => {
    const value = 'abc';

    const result = errors.formatInt64InvalidError(value);

    expect(result).toBe('Value abc is not a valid 64-bit integer');
  });

  it('should format int64 exceeds limits error strings correctly', () => {
    const value = '999999999999999999999999999999999999';

    const result = errors.formatInt64ExceedsError(value);

    expect(result).toBe(
      'Value 999999999999999999999999999999999999 exceeds 64-bit integer limits'
    );
  });

  it('should format float error strings correctly', () => {
    const received = '1.23e+40';

    const result = errors.formatFloatError(received);

    expect(result).toBe('Expected 32-bit float, received 1.23e+40');
  });

  it('should format double error strings correctly', () => {
    const value = NaN;

    const result = errors.formatDoubleError(value);

    expect(result).toBe('Expected 64-bit float, received NaN');
  });

  it('should format string minLength error strings correctly', () => {
    const length = 2;
    const minLength = 5;

    const result = errors.formatStringMinLengthError(length, minLength);

    expect(result).toBe('String length 2 is less than minimum 5');
  });

  it('should format string maxLength error strings correctly', () => {
    const length = 10;
    const maxLength = 5;

    const result = errors.formatStringMaxLengthError(length, maxLength);

    expect(result).toBe('String length 10 exceeds maximum 5');
  });

  it('should format string pattern error strings correctly', () => {
    const pattern = '^abc$';

    const result = errors.formatStringPatternError(pattern);

    expect(result).toBe('String does not match pattern ^abc$');
  });

  it('should format string format error strings correctly', () => {
    const format = 'uuid';
    const received = 'not-a-uuid';

    const result = errors.formatStringFormatError(format, received);

    expect(result).toBe("Expected string format 'uuid', received 'not-a-uuid'");
  });

  it('should format array minItems error strings correctly', () => {
    const length = 1;
    const minItems = 3;

    const result = errors.formatArrayMinItemsError(length, minItems);

    expect(result).toBe('Array has 1 items, minimum is 3');
  });

  it('should format array maxItems error strings correctly', () => {
    const length = 5;
    const maxItems = 3;

    const result = errors.formatArrayMaxItemsError(length, maxItems);

    expect(result).toBe('Array has 5 items, maximum is 3');
  });

  it('should format array uniqueness error strings correctly', () => {
    const result = errors.formatArrayUniqueError();

    expect(result).toBe('Array elements must be unique');
  });

  it('should format expected array error strings correctly', () => {
    const receivedType = 'string';

    const result = errors.formatExpectedArrayError(receivedType);

    expect(result).toBe('Expected array, received string');
  });

  it('should format expected object error strings correctly', () => {
    const receivedType = 'number';

    const result = errors.formatExpectedObjectError(receivedType);

    expect(result).toBe('Expected object, received number');
  });

  it('should format object minProperties error strings correctly', () => {
    const length = 1;
    const minProperties = 3;

    const result = errors.formatObjectMinPropertiesError(length, minProperties);

    expect(result).toBe('Object has 1 properties, minimum is 3');
  });

  it('should format object maxProperties error strings correctly', () => {
    const length = 5;
    const maxProperties = 3;

    const result = errors.formatObjectMaxPropertiesError(length, maxProperties);

    expect(result).toBe('Object has 5 properties, maximum is 3');
  });

  it('should format required field error strings correctly', () => {
    const result = errors.formatRequiredFieldError();

    expect(result).toBe('Missing required field');
  });

  it('should format additional properties error strings correctly', () => {
    const key = 'invalidKey';

    const result = errors.formatAdditionalPropertiesError(key);

    expect(result).toBe("Key 'invalidKey' is not allowed by OpenAPI schema");
  });

  it('should format nullable error strings correctly', () => {
    const result = errors.formatNullableError();

    expect(result).toBe('Field is not nullable but received null');
  });

  it('should format writeOnly error strings correctly', () => {
    const result = errors.formatWriteOnlyError();

    expect(result).toBe(
      'Field is writeOnly and must not be present in the response'
    );
  });

  it('should format required property error strings correctly', () => {
    const result = errors.formatRequiredPropertyError();

    expect(result).toBe('Field is required but received undefined');
  });

  it('should format cyclic not schema error strings correctly', () => {
    const result = errors.formatCyclicNotSchemaError();

    expect(result).toBe('Cyclic not schema detected');
  });

  it('should format prohibited schema error strings correctly', () => {
    const result = errors.formatProhibitedSchemaError();

    expect(result).toBe('Value matches prohibited schema');
  });

  it('should format discriminator mismatch error strings correctly', () => {
    const args = {
      propertyName: 'type',
      value: 'cat',
      compositionType: 'oneOf'
    };

    const result = errors.formatDiscriminatorMismatchError(args);

    expect(result).toBe(
      "Discriminator 'type' value 'cat' does not match any schema in 'oneOf'"
    );
  });

  it('should format unresolved ref error strings correctly', () => {
    const ref = '#/components/schemas/Pet';

    const result = errors.formatUnresolvedRefError(ref);

    expect(result).toBe(
      "Unresolved $ref: '#/components/schemas/Pet'. Ensure your OpenAPI spec is fully dereferenced."
    );
  });
});
