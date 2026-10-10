# Changelog

## 2.0.0

### ⚠️ Breaking changes

- **`nullable: true` only takes effect alongside `type`** (OpenAPI 3.0.3). A schema without `type` and with `nullable: true` no longer admits `null` by itself: `allOf`, `anyOf`, `oneOf`, `not` or `$ref` decide.
- **Compositions and `$ref` evaluate `null`.** A `null` is validated against `allOf`, `anyOf`, `oneOf`, `not` and `$ref`. If a subschema does not admit `null`, the response fails even if the container has `nullable: true`.
- **`oneOf` with two branches that admit `null`** fails with `expected exactly 1`.
- **Sibling keywords of a `$ref` are ignored**, as OpenAPI 3.0.3 specifies. A `nullable: true` next to `$ref` no longer makes the referenced schema admit `null`, whether the `$ref` points inside the document or to an external file. Previously `SwaggerParser.dereference` merged that sibling into the resolved schema. Path Items, under `paths` and inside `callbacks`, are the exception: OpenAPI 3.0.3 allows fields next to their `$ref`, so operations declared there are kept. Any other object with a string `$ref`, including values inside `example`, `default`, `enum` or `x-*` extensions, is reduced to that `$ref`.

These rules follow the OpenAPI 3.0.3 clarification and apply to every `openapi: 3.0.x` document, including 3.0.0–3.0.2, which left this behavior ambiguous.

Specs that depend on the lax `null` handling may start failing. For example, `allOf: [$ref Image]` with `nullable: true` no longer accepts `image: null`. See the "Migration to 2.0.0 (nullable)" section of the [README](./README.md).

### Migration

**1. `nullable` + `allOf` without `type` (or an `allOf` that does not admit `null`)**

```yaml
# Before (rejected in 2.0.0): the container is nullable, but Image does not admit null
image:
  nullable: true
  allOf:
    - $ref: '#/components/schemas/Image'

# After (recommended), keeping the $ref: add a branch that only admits null
image:
  anyOf:
    - $ref: '#/components/schemas/Image'
    - type: object
      nullable: true
      enum: [null]

# After (alternative), inlining the schema: declare type and nullable on it
image:
  type: object
  nullable: true
  required: [url]
  properties:
    url:
      type: string
```

The `anyOf` form keeps `Image` reusable. Its second branch admits only `null` (a non-null object fails `enum: [null]`), and it stays valid once `enum` is evaluated against `null` (see "Known limitations").

**2. `oneOf` with two branches that admit `null`**

```yaml
# Before: accepted null (the container's nullable short-circuited validation)
image:
  nullable: true
  oneOf:
    - type: object
      nullable: true
      properties: { url: { type: string } }
    - type: object
      nullable: true
      properties: { id: { type: string } }

# After: 2.0.0 rejects null because both branches admit it ("expected exactly 1").
# To accept null, leave exactly one branch nullable:
image:
  nullable: true
  oneOf:
    - type: object
      nullable: true
      properties: { url: { type: string } }
    - type: object
      properties: { id: { type: string } }
```

**3. `$ref` with a sibling `nullable`**

```yaml
# Before: accepted null
image:
  $ref: '#/components/schemas/Image'
  nullable: true

# After: 2.0.0 ignores the sibling nullable, as OpenAPI 3.0.3 specifies, and rejects null.
# If image must accept null, use the anyOf form from case 1:
image:
  anyOf:
    - $ref: '#/components/schemas/Image'
    - type: object
      nullable: true
      enum: [null]
```

### Known limitations

- **`enum` does not require an explicit `null` when `nullable: true` admits `null`.** OpenAPI 3.0.3 and the Swagger enum guide require `null` to be listed in `enum`; in 2.0.0, `enum` and `const` are not evaluated against that `null`. A schema such as `type: string`, `nullable: true`, `enum: [a, b]` accepts `null`. This keeps 2.0.0 scoped to compositions and `$ref`: requiring `null` in `enum` would also break specs that only rely on `type` + `nullable`, so it is deferred to a later change.
- **Without `type`, `nullable` has no effect, and other keywords decide on `null`** (OpenAPI 3.0.3). This can be surprising:

  | Schema | `null` |
  | --- | --- |
  | `nullable: true`, `properties`/`required`, no `type` | accepted: `properties` and `required` only apply to objects |
  | `properties`/`required`, no `type`, no `nullable` | accepted, for the same reason |
  | `nullable: true`, `enum: [a]`, no `type` | rejected: `null` is not in `enum` |
  | `type: string`, `nullable: true`, `enum: [a]` | accepted: `enum` is not evaluated against this `null` (see above) |

  Declare `type` on schemas that must reject `null`.

### Dependencies

- `@apidevtools/swagger-parser` is pinned to `13.0.0` and `@apidevtools/json-schema-ref-parser` is added, pinned to `15.3.6`, the version `swagger-parser` depends on. Both must stay in sync so the default parsers come from the same copy; upgrade them together.

### Unchanged

- Non-null values keep their existing results.
- `enum` and `const` are still not evaluated against a `null` admitted by `type` and `nullable` (see "Known limitations").
- The `Field is not nullable but received null` message and the field path are preserved.
