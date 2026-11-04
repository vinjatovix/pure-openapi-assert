# pure-openapi-assert Adoption Manual

This manual serves as a comprehensive, state-of-the-art technical guide for software architects, backend engineers, and QA leads adopting `pure-openapi-assert` for automated API contract testing.

---

## 🎭 1. Contract Testing in BDD (Behavior-Driven Development) Environments

Behavior-Driven Development (BDD) focuses on validating system interactions through expressive, human-readable user journeys. In backend testing setups, your **OpenAPI specification acts as the single source of truth (SSOT)**.

### The AAA (Arrange-Act-Assert) Pattern

It is highly recommended that tests utilizing `pure-openapi-assert` follow the clean **Arrange-Act-Assert (AAA)** pattern to ensure test isolation, high maintainability, and clean error separation:

1.  **Arrange:** Set up the initial system state, prepare input parameters, database records, and construct the expected network parameters.
2.  **Act:** Execute the actual operation—typically a network call to your backend or a direct invocation of your controller/handler.
3.  **Assert:** Invoke the `assertResponseMatchesOpenApi` assertion to verify that the HTTP response conforms to the active OpenAPI contract.

Each test block (`it` or `test`) should ideally target **exactly one** behavior. Avoid mixing positive and negative assertions, or validating multiple unrelated endpoints within a single test block.

---

## ⚡ 2. Quick-Start Integration Guide with Vitest

**Vitest** is the modern test runner of choice for modern TypeScript and Node.js applications because of its blazing-fast execution speeds, native ES Module (ESM) support, and robust watch mode.

### Step 1: Extend Vitest's Expect Matchers

Create a setup file to extend Vitest's assertions with a custom helper matcher:

```typescript
// tests/helpers/vitest.setup.ts
import { expect } from 'vitest';
import {
  assertResponseMatchesOpenApi,
  type OpenAPIValidatorInput
} from 'pure-openapi-assert';

// Extend Vitest expect with our custom matcher
expect.extend({
  async toMatchOpenAPI(
    received: Omit<OpenAPIValidatorInput, 'specPath'>,
    specPath: string
  ) {
    try {
      await assertResponseMatchesOpenApi({
        ...received,
        specPath
      } as OpenAPIValidatorInput); // Cast is needed due to TypeScript union spread limitations
      return {
        pass: true,
        message: () => 'Expected response NOT to match OpenAPI contract'
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        pass: false,
        message: () => message
      };
    }
  }
});
```

### Step 2: Declare Global TypeScript Types

To ensure full autocomplete and compile-time type-safety, create a global `.d.ts` declaration file in your project:

```typescript
// types/vitest.d.ts
import 'vitest';

declare module 'vitest' {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>> {
    toMatchOpenAPI(specPath: string): Promise<R>;
  }
}
```

### Step 3: Write a BDD Spec Test with Strict AAA

This complete, runnable example shows how to write a contract test utilizing the custom Vitest matcher:

```typescript
import { describe, it, expect } from 'vitest';

describe('Users API Contract Validation', () => {
  it('should successfully create a new user and conform to the contract', async () => {
    // 1. ARRANGE
    const specPath = 'docs/openapi.yaml'; // Path to your local OpenAPI schema
    
    // Simulate our backend API's response structure
    const actualResponse = {
      status: 201,
      contentType: 'application/json',
      headers: {
        'x-request-id': 'req-12345',
        'content-type': 'application/json'
      },
      body: {
        id: '9007199254740993', // Large BigInt represented cleanly as string
        username: 'john_doe',
        email: 'john.doe@example.com',
        createdAt: '2026-09-18T14:30:00Z'
      }
    };

    // 2. ACT
    const result = actualResponse;

    // 3. ASSERT
    await expect({
      path: '/users',
      method: 'POST',
      response: result // <-- Auto-extracts status, headers, and body!
    }).toMatchOpenAPI(specPath);
  });
});
```

---

## 🛠️ 3. Advanced Integrations & Extensibility

### Integration with Supertest & Jest

Integrate seamlessly into End-to-End API test suites utilizing Jest and `supertest`:

```typescript
import request from 'supertest';
import app from '../src/app'; // Your Express application
import { assertResponseMatchesOpenApi } from 'pure-openapi-assert';

describe('GET /items', () => {
  it('should return valid JSON list of items', async () => {
    const response = await request(app).get('/items').expect(200);

    // Validate the actual network response against the OpenAPI document
    await expect(
      assertResponseMatchesOpenApi({
        specPath: 'openapi.yaml',
        path: '/items',
        method: 'GET',
        response // <-- Simply pass the Supertest response object!
      })
    ).resolves.toBeUndefined();
  });
});
```

---

### Custom Format Injection

`pure-openapi-assert` validates standard OpenAPI 3.0 formats (such as `uuid`, `email`, `date`, `date-time`, `ipv4`, `ipv6`, `hostname`, `uri`, `byte`, `int32`, `int64`, `float`, and `double`) out of the box.

If your spec defines custom formats, you can inject validation predicates programmatically:

```typescript
await assertResponseMatchesOpenApi({
  specPath: 'openapi.yaml',
  path: '/users',
  method: 'POST',
  status: 201,
  body: {
    username: 'john_doe',
    fiscalCode: 'ABCDEF12G34H567I' // Custom Italian fiscal code format
  },
  customFormats: {
    // Key matches the format name in the YAML/JSON spec
    'fiscal-code': (val: string) =>
      /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(val)
  }
});
```

---

### Non-JSON Content Types & XML Limitations

#### Opaque Content-Type Fail-Safe

`pure-openapi-assert` enforces robust API validation for both JSON and non-JSON media types:

- **JSON Media Types (`application/json`, `application/*+json`):** Evaluated deeply down to the individual keys, formats, and structural restrictions.
- **Text-based Media Types (`text/html`, `text/plain`, `text/xml`, etc.):** Validated opaquely to ensure that the response payload is a native JavaScript `string`.
- **Binary / File Media Types (`application/pdf`, `image/png`, etc.):** Validated opaquely to ensure the payload is a valid Node.js `Buffer`.

#### XML Schema Deep Validation Workaround

Due to the stateless and lightweight nature of the library, the core engine does not bundle a heavy XML parser. If your API endpoint serves deep XML structures and you want to validate them structurally against your OpenAPI contracts:

1.  Use a fast, lightweight library (like `fast-xml-parser`) to deserialize the XML response into a plain JavaScript Object.
2.  Pass the parsed object into the assertion function.
3.  **Ensure your OpenAPI specification also declares `application/json` (with the identical schema) for that endpoint.** Since the router strictly matches requested media types against the specification, forcing `contentType: 'application/json'` on an endpoint that _only_ declares XML in the contract will trigger a schema routing error.
4.  Override the `contentType` parameter to `'application/json'` in the assertion call to trigger deep structural schema validation.

```typescript
import { XMLParser } from 'fast-xml-parser';
import { assertResponseMatchesOpenApi } from 'pure-openapi-assert';

// 1. Receive XML from your server
const xmlResponse = `<user><id>123</id><email>xml@domain.com</email></user>`;

// 2. Parse into a JS Object
const parser = new XMLParser();
const jsObject = parser.parse(xmlResponse);

// 3. Assert deep schemas with application/json override
// (Requires both application/xml and application/json to be declared for this route in openapi.yaml)
await assertResponseMatchesOpenApi({
  specPath: 'openapi.yaml',
  path: '/user',
  method: 'GET',
  status: 200,
  body: jsObject,
  contentType: 'application/json' // Forces deep validation on the parsed structure
});
```

---

## 🔍 4. Diagnostics and Error Troubleshooting

When a backend response deviates from the OpenAPI spec, `pure-openapi-assert` compiles all contract violations into a single, cohesive error message with **JSON Pointer (RFC 6901)** paths to pinpoint the exact failure location.

### Diagnostic Output Format

```text
Error: OpenAPI contract violation for POST /users 201.
Validation errors:
- [body.username] Expected string, received number
- [body.email] Expected string format 'email', received 'invalid-email'
- [body.createdAt] Expected string format 'date-time', received '2026-09-18'
- [root] Missing required header: x-request-id
```

### Root Cause Remediation

-   **`[body.*]` Errors:** The returned JSON body has structural discrepancies. Check if fields are missing, if types are incorrect, or if the server response is missing expected serialization.
-   **Header Errors:** Missing required headers appear as `[root]` errors, while rate limit or type coercion constraints on present headers appear under `[headers.*]` paths.

💡 **Recommended Testing Practice (Avoiding Fragile String Assertions):**
When writing unit or integration tests for validation error flows, it is highly recommended to avoid asserting on generic, common words in the error message (such as `"invalid"` or `"required"`), since real data payloads from your API could contain those terms and cause false positives/negatives.

Instead, assert on the deterministic structural path generated by the library. For example:
- **For response body fields:** use `[body.username]` or `[body.profile.address.zipCode]`.
- **For missing required headers:** use the global path `[root]` (e.g., `[root] Missing required header: x-request-id`).
- **For present headers with invalid values:** use the specific header path `[headers.x-request-id]` (e.g., `[headers.x-request-id] Expected integer...`).

---

## 📊 5. OpenAPI 3.0 Compatibility & Support Matrix

To design reliable specifications, consult the comprehensive keyword support table below:

| OpenAPI 3.0 Keyword | Support Status | Detailed Evaluation and Integrity Behavior |
|:---|:---|:---|
| `type` | **Supported** | Deeply evaluates all primitive types: `string`, `number`, `integer`, `boolean`, `object`, `array`, and `null` (via `nullable`). |
| `properties` | **Supported** | Validates nested objects and checks keys recursively down the tree. |
| `required` | **Supported** | Strictly asserts the presence of mandated properties. |
| `allOf` | **Supported** | Resolves logical schema intersections, merging schemas cumulatively while handling cyclic structures. |
| `oneOf` | **Supported** | Strictly ensures the payload matches **exactly one** of the sub-schemas. |
| `anyOf` | **Supported** | Ensures the payload matches at least one of the listed sub-schemas. |
| `not` | **Supported** | Semantic negation. Validates the sub-schema and strictly rejects the payload if it matches. |
| `discriminator`| **Supported** | Polymorphism routing. Instantly dispatches validation to the correct branch without evaluating unnecessary schemas. |
| `$ref` | **Supported** | Loaded and resolved once via swagger-parser dereferencing to prevent performance bottlenecks. |
| `format` | **Supported** | Validates: `uuid`, `email`, `date`, `date-time`, `ipv4`, `ipv6`, `hostname`, `uri`, `byte`, `int32`, `int64`, `float`, and `double`. |
| `minimum` / `maximum` | **Supported** | Standard range constraints (supports `exclusiveMinimum`/`exclusiveMaximum`). |
| `minLength` / `maxLength` | **Supported** | Character length boundary validation for strings. |
| `pattern` | **Supported** | Performs dynamic regular expression validation. RegExes are compiled and cached in our `FIFOCache`. |
| `additionalProperties` | **Supported** | Enforces strict property gates. Rejects unknown properties if `additionalProperties: false`. |
| `multipleOf` | **Supported** | Validates numeric divisibility (integers and numbers). |
| `minItems` / `maxItems` | **Supported** | Array length boundaries. |
| `uniqueItems` | **Supported** | Rejects duplicate array items when `uniqueItems: true`. |
| `minProperties` / `maxProperties` | **Supported** | Object property-count boundaries. |
| `readOnly` / `writeOnly` | **Supported** | Direction-aware (OpenAPI 3.0.3): `writeOnly` is request-only, `readOnly` is response-only. Presence in the wrong direction is rejected, and the `required` interaction takes effect only in the owning direction. See §7. |
| `nullable` | **Supported** | Admits `null` only when `nullable: true` sits alongside a `type` on the same schema (OpenAPI 3.0.3). Without a `type`, `nullable` has no effect and `null` is decided by `allOf`/`anyOf`/`oneOf`/`not`/`$ref`. See the "Migration to 2.0.0 (nullable)" section of the README and the CHANGELOG. |
| `deprecated` | **Supported** | Emits a non-blocking warning console log: `[OpenAPI-Assert] ⚠️ Warning: Endpoint is deprecated` in your test suite. |

---

## ⚠️ 6. Known Boundaries and Technical Limits (Out of Scope)

Understanding the library's design boundaries will help you prevent configuration issues:

1.  **In-Memory Validation, No Network Interception:** The engine does not intercept live network calls. It validates both *responses* (via `assertResponseMatchesOpenApi`) and *requests* (via `assertRequestMatchesOpenApi` / `assertRequest`, supporting native Fetch `Request`, Node-like `req`, or explicit fields, see §7). In all modes it operates as a pure in-memory engine: you provide the captured response or request object directly to the assertion function.
2.  **Stateless In-Memory Verification:** No persistent state is held between assertions beyond the smart `mtime`-based spec cache; every assertion is an isolated, deterministic evaluation.
3.  **No Remote Referencing:** To protect against Server-Side Request Forgery (SSRF) and avoid heavy network latencies, the loader **does not fetch dynamic HTTP remote `$ref` references at validation time**. All files must be stored locally on disk.
4.  **No Native OpenAPI 3.1 Exclusives:** The compiler strictly targets OpenAPI 3.0 schemas. Dynamic type arrays (e.g. `type: ["string", "null"]`) or complex `const` properties are not supported natively unless polyfilled or expressed using standard OpenAPI 3.0 conventions (e.g., `enum: [value]` instead of `const`).

---

## 📤 7. Validating Requests (Frontend & Backend Use)

Besides responses, `pure-openapi-assert` validates **outgoing or incoming requests** against the same OpenAPI 3.0 contract through `assertRequestMatchesOpenApi` (or alias `assertRequest`). It supports both **direct Request / Fetch objects** (or Node `req` objects) with automatic stream preservation and **explicit fields**, making it ideal for catching malformed payloads in the frontend *before* network dispatch, as well as validating incoming requests in backend middleware (Node/Express/Fastify) or integration tests.

### 1. Direct Fetch / Node Request Objects

Pass native Fetch `Request` or Node-like request objects directly via `request` (or `req`). The library automatically extracts the URL, method, headers, and body. For native Fetch requests, the internal body stream is automatically cloned so that `request.bodyUsed` remains `false`:

```typescript
import { assertRequest } from 'pure-openapi-assert';

const request = new Request('https://api.example.com/users/42', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Ada Lovelace' })
});

// Auto-extracts path (/users/42 -> { id: '42' }), headers, and body!
await assertRequest({
  specPath: 'docs/openapi.yaml',
  request
});

// Original request stream remains unconsumed:
expect(request.bodyUsed).toBe(false);
```

### 2. Concrete URLs & Automatic Path Parameter Extraction

You can pass concrete paths (e.g., `/users/42`) or full URLs (`https://api.example.com/users/42?page=1`) without manually parsing `{ id: '42' }` into `pathParams`. The router executes two-stage matching (exact static priority, then regex token capture with URL decoding) to map concrete paths to OpenAPI route templates like `/users/{id}`:

```typescript
await assertRequest({
  specPath: 'docs/openapi.yaml',
  url: 'https://api.example.com/users/42?page=1',
  method: 'GET'
});
```

### 3. OpenAPI 3.0 `deepObject` Query Deserialization

Query parameters with bracket notation (e.g., `filter[category][eq]=organic&filter[limit]=10`) are deserialized into nested object structures and validated against the operation's parameter schema with integer/boolean coercion:

```typescript
await assertRequest({
  specPath: 'docs/openapi.yaml',
  path: '/plants',
  method: 'GET',
  query: 'filter[category][eq]=organic&filter[limit]=10'
});
```

The `query` property accepts plain objects, `URLSearchParams` instances, or raw query strings (with or without leading `?`).

### 4. Strict Parameter Mode (`strictParameters: true`)

Catch undeclared query parameters or headers before deployment. Standard RFC transport and security headers (`host`, `user-agent`, `authorization`, `content-type`, `content-length`, `connection`, `cache-control`, `cookie`, `accept`) are automatically exempted:

```typescript
await assertRequest({
  specPath: 'docs/openapi.yaml',
  path: '/users/42',
  method: 'GET',
  query: { unexpectedParam: 'bad' },
  strictParameters: true // Throws: [query.unexpectedParam] Query parameter 'unexpectedParam' is not declared in OpenAPI contract
});
```

### 5. Explicit Mode

If you prefer building the request manually, you can provide explicit fields:

```typescript
import { assertRequestMatchesOpenApi } from 'pure-openapi-assert';

await assertRequestMatchesOpenApi({
  specPath: 'docs/openapi.yaml',
  path: '/users/{id}',                 // route pattern or a concrete path like /users/42
  method: 'PUT',
  pathParams: { id: '42' },            // case-sensitive (optional if using concrete path)
  query: { page: '2' },                // case-sensitive; arrays honor style/explode
  headers: { 'x-tenant-id': 'acme' },  // case-insensitive (HTTP semantics)
  body: { name: 'Ada', age: 30 },      // object or JSON text (parsed losslessly)
  contentType: 'application/json'       // optional, defaults to application/json
});
```

### What is Validated

| Aspect | Behavior |
|--------|----------|
| **Input** | Direct `Request` / `fetch` object (`request` or `req`), full `url`, or explicit fields (`body`, `query`, `pathParams`, `headers`). |
| **Path extraction** | Automatically extracts path variables from concrete paths (`/users/42` -> `{ id: '42' }`) with static route precedence. |
| **Query styles** | Full OpenAPI 3.0 `deepObject` bracket deserialization, arrays (`items[]=a`), and repeated keys (`?tags=red&tags=blue`). Accepts string, `URLSearchParams`, or object. |
| **Strict parameters** | Optional `strictParameters: true` rejects undeclared query/headers while exempting standard RFC transport and security headers. |
| **Body source** | Resolved from the `requestBody` schema matched by `Content-Type` (RFC 7231; `charset`/`boundary` ignored; wildcards supported). JSON text bodies are parsed losslessly; malformed JSON raises a clear parse error. |
| **Required body** | A required `requestBody` that is absent fails; an optional one that is absent passes. A `Content-Type` not declared by the operation fails intelligibly. |
| **Parameters** | `path`, `query` and `header` validated for schema, required-ness, and the full OpenAPI 3.0 `style`/`explode` matrix (`form`, `spaceDelimited`, `pipeDelimited`, `deepObject`, `simple`, `label`, `matrix`), with wire-string coercion before constraint checks. |
| **Name matching** | `header` is case-insensitive (the canonical spec name is kept in the error prefix); `query`/`path` are case-sensitive. |
| **`readOnly`/`writeOnly`** | A `writeOnly` body property is accepted and may be `required`; a `readOnly` body property is rejected if present and is **not** required (even when merged via `allOf`). Opposite of the response direction. |

### Error Prefixes

Request diagnostics mirror the response format but scope the prefix to the request location:

```text
OpenAPI contract violation for PUT /users/{id}.
Validation errors:
- [body.age] Expected integer, received string
- [query.page] Expected integer, received string
- [header.X-Tenant-Id] Missing required header parameter: X-Tenant-Id
- [path.id] Missing required path parameter: id
```

Assert on these deterministic prefixes (`[body.*]`, `[query.*]`, `[path.*]`, `[header.*]`) rather than on generic words, exactly as recommended for responses in §4.

> **Note — request header prefix.** Request header errors use the singular `[header.<Canonical-Name>]` prefix (the spec's canonical casing is preserved even when the supplied header matched case-insensitively). This differs from the response side, where a *missing* required header surfaces under `[root]` and a *present but invalid* one under `[headers.<name>]` (§4).

### Parity With Response Validation

Request and response validation share the **exact same schema engine**: `$ref` resolution, OpenAPI 3.0.3 `nullable` semantics, composition (`allOf`/`anyOf`/`oneOf`/`not`), string/number formats, `customFormats`, and deterministic lossless parsing. A schema reused by a `requestBody` and by a `response` yields an **identical verdict** (same pass/fail and same error path) for the same payload. OpenAPI 3.1 specs are rejected consistently on both sides.

The **one deliberate exception** is `readOnly`/`writeOnly`, which OpenAPI 3.0.3 defines as directional: a `writeOnly` property (e.g. `password`) belongs in a request and is rejected in a response; a `readOnly` property (e.g. a server-generated `id`) belongs in a response and is rejected in a request. Likewise, a `readOnly` + `required` property is required on the response only, and a `writeOnly` + `required` property on the request only (the `required` interaction is resolved even when the property is merged in via `allOf`). So for a schema shared by both sides, the same payload may legitimately pass one direction and fail the other.
