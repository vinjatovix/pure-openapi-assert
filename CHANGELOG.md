# Changelog

## 2.1.0

### Added

- **Request validation: `assertRequestMatchesOpenApi` (alias `assertRequest`).** Validates an outgoing request against the same OpenAPI 3.0 contract, from explicit fields (`body`, `query`, `pathParams`, `headers`, `contentType`) — no `Request`/`fetch` object — so it runs identically in the browser and in Node. Ideal for catching malformed payloads in the frontend before they reach the network.
- **Request body.** Resolved from the `requestBody` schema matched by `Content-Type` (RFC 7231 media-type normalization; `charset`/`boundary` ignored; wildcards supported). A required `requestBody` that is absent fails; an optional one that is absent passes. JSON text bodies are parsed losslessly; malformed JSON reports a clear parse error; a `Content-Type` not declared by the operation fails intelligibly.
- **Parameters.** `path`, `query` and `header` are validated for schema, required-ness and the full OpenAPI 3.0 `style`/`explode` matrix (`form`, `spaceDelimited`, `pipeDelimited`, `deepObject`, `simple`, `label`, `matrix`), with wire-string coercion before constraint checks. `header` names match case-insensitively (the canonical spec name is kept in the error prefix); `query`/`path` are case-sensitive. Undeclared `query`/`header` params are permissive.
- **Error prefixes** `[body.*]`, `[query.*]`, `[path.*]` and `[header.*]` for request diagnostics, mirroring the response format.
- **Direction-aware `readOnly`/`writeOnly` (OpenAPI 3.0.3).** Validation now carries a direction. A `writeOnly` property is rejected only in a **response** (and a `writeOnly` + `required` property is not required there); a `readOnly` property is rejected only in a **request** (and a `readOnly` + `required` property is not required there, including when it is merged in via `allOf`). This makes the common CRUD shape — a server-generated `readOnly: id` and a `writeOnly: password`, both `required` — validate correctly on each side.

### Parity

- Request and response validation share the exact same schema engine: `$ref` resolution, OpenAPI 3.0.3 `nullable` semantics, composition (`allOf`/`anyOf`/`oneOf`/`not`), string/number formats, `customFormats` and deterministic lossless parsing. A schema reused by a `requestBody` and by a `response` yields an identical verdict (same pass/fail and same error path) for the same payload — **except** where `readOnly`/`writeOnly` apply, which are directional by design (see above). OpenAPI 3.1 specs are rejected consistently on both sides.

### Unchanged

- Response validation behavior is unchanged; `assertResponseMatchesOpenApi` and its public types keep their results and signatures.

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
