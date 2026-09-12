import type { OpenAPIV3 } from 'openapi-types';

export class SchemaBuilder {
  private schema: Partial<OpenAPIV3.SchemaObject> = {};

  type(type: OpenAPIV3.SchemaObject['type']): this {
    if (type !== undefined) {
      this.schema.type = type;
    }
    return this;
  }

  format(format: string): this {
    this.schema.format = format;
    return this;
  }

  properties(
    properties: Record<
      string,
      OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject | SchemaBuilder
    >
  ): this {
    const resolved: Record<
      string,
      OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject
    > = {};
    for (const key in properties) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        const val = properties[key];
        if (val !== undefined) {
          resolved[key] = val instanceof SchemaBuilder ? val.build() : val;
        }
      }
    }
    this.schema.properties = resolved;
    return this;
  }

  property(
    name: string,
    value: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject | SchemaBuilder
  ): this {
    if (!this.schema.properties) {
      this.schema.properties = {};
    }
    this.schema.properties[name] =
      value instanceof SchemaBuilder ? value.build() : value;
    return this;
  }

  required(...fields: string[]): this {
    this.schema.required = fields;
    return this;
  }

  items(
    items: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject | SchemaBuilder
  ): this {
    (this.schema as OpenAPIV3.ArraySchemaObject).items =
      items instanceof SchemaBuilder ? items.build() : items;
    return this;
  }

  enum(values: unknown[]): this {
    this.schema.enum = values;
    return this;
  }

  oneOf(
    ...schemas: (
      OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject | SchemaBuilder
    )[]
  ): this {
    this.schema.oneOf = schemas.map((s) =>
      s instanceof SchemaBuilder ? s.build() : s
    );
    return this;
  }

  anyOf(
    ...schemas: (
      OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject | SchemaBuilder
    )[]
  ): this {
    this.schema.anyOf = schemas.map((s) =>
      s instanceof SchemaBuilder ? s.build() : s
    );
    return this;
  }

  allOf(
    ...schemas: (
      OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject | SchemaBuilder
    )[]
  ): this {
    this.schema.allOf = schemas.map((s) =>
      s instanceof SchemaBuilder ? s.build() : s
    );
    return this;
  }

  additionalProperties(
    additionalProperties:
      | boolean
      | OpenAPIV3.ReferenceObject
      | OpenAPIV3.SchemaObject
      | SchemaBuilder
  ): this {
    this.schema.additionalProperties =
      additionalProperties instanceof SchemaBuilder
        ? additionalProperties.build()
        : additionalProperties;
    return this;
  }

  discriminator(propertyName: string, mapping?: Record<string, string>): this {
    this.schema.discriminator = {
      propertyName,
      ...(mapping !== undefined ? { mapping } : {})
    };
    return this;
  }

  nullable(nullable: boolean = true): this {
    this.schema.nullable = nullable;
    return this;
  }

  minimum(value: number): this {
    this.schema.minimum = value;
    return this;
  }

  maximum(value: number): this {
    this.schema.maximum = value;
    return this;
  }

  multipleOf(value: number): this {
    this.schema.multipleOf = value;
    return this;
  }

  minItems(value: number): this {
    this.schema.minItems = value;
    return this;
  }

  maxItems(value: number): this {
    this.schema.maxItems = value;
    return this;
  }

  uniqueItems(value: boolean = true): this {
    this.schema.uniqueItems = value;
    return this;
  }

  minProperties(value: number): this {
    this.schema.minProperties = value;
    return this;
  }

  maxProperties(value: number): this {
    this.schema.maxProperties = value;
    return this;
  }

  minLength(value: number): this {
    this.schema.minLength = value;
    return this;
  }

  maxLength(value: number): this {
    this.schema.maxLength = value;
    return this;
  }

  pattern(value: string): this {
    this.schema.pattern = value;
    return this;
  }

  exclusiveMinimum(value: boolean = true): this {
    this.schema.exclusiveMinimum = value;
    return this;
  }

  exclusiveMaximum(value: boolean = true): this {
    this.schema.exclusiveMaximum = value;
    return this;
  }

  const(value: unknown): this {
    // Cast to Record<string, unknown> because OpenAPI v3.0 does not formally support 'const' (introduced in 3.1).
    (this.schema as Record<string, unknown>).const = value;
    return this;
  }

  writeOnly(value: boolean = true): this {
    this.schema.writeOnly = value;
    return this;
  }

  title(value: string): this {
    this.schema.title = value;
    return this;
  }

  build(): OpenAPIV3.SchemaObject {
    return this.schema as OpenAPIV3.SchemaObject;
  }
}
