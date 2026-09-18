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
| `nullable` | **Supported** | Correctly evaluates `null` values as valid if `nullable: true` is explicitly declared. |
| `deprecated` | **Supported** | Emits a non-blocking warning console log: `[OpenAPI-Assert] ⚠️ Warning: Endpoint is deprecated` in your test suite. |

---

## ⚠️ 6. Known Boundaries and Technical Limits (Out of Scope)

Understanding the library's design boundaries will help you prevent configuration issues:

1.  **Response-Only Focus:** The library strictly checks *responses* from your server. It is not optimized or designed for general request body input validation on the client side.
2.  **Stateless In-Memory Verification:** The engine does not intercept network calls. It is a pure, in-memory validation runner; you must capture your HTTP responses and feed them to the assertion function.
3.  **No Remote Referencing:** To protect against Server-Side Request Forgery (SSRF) and avoid heavy network latencies, the loader **does not fetch dynamic HTTP remote `$ref` references at validation time**. All files must be stored locally on disk.
4.  **No Native OpenAPI 3.1 Exclusives:** The compiler strictly targets OpenAPI 3.0 schemas. Dynamic type arrays (e.g. `type: ["string", "null"]`) or complex `const` properties are not supported natively unless polyfilled or expressed using standard OpenAPI 3.0 conventions (e.g., `enum: [value]` instead of `const`).
