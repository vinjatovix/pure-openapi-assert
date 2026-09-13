# pure-openapi-assert

State-of-the-art, ultra-lightweight, and high-performance OpenAPI 3.0 response contract assertion library for modern testing.

[![NPM Version](https://img.shields.io/npm/v/pure-openapi-assert.svg)](https://www.npmjs.com/package/pure-openapi-assert)
[![CI Status](https://github.com/vinjatovix/pure-openapi-assert/actions/workflows/ci.yml/badge.svg)](https://github.com/vinjatovix/pure-openapi-assert/actions)
[![Test Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/vinjatovix/feac8a8435ec9adc322d155a51ac5079/raw/coverage.json)](https://github.com/vinjatovix/pure-openapi-assert)
[![License](https://img.shields.io/npm/l/pure-openapi-assert.svg)](https://github.com/vinjatovix/pure-openapi-assert/blob/main/LICENSE)

---

## 🚀 Why `pure-openapi-assert`? (The AJV Problem)

Most traditional testing setups rely on AJV or other JSON Schema engines to validate API responses. However, **JSON Schema is not OpenAPI**. OpenAPI 3.0 introduced critical structural divergences (such as polymorphic `discriminator` mapping, strict `nullable` behaviors, and specialized numeric constraints like `int32`, `int64`, `float`, and `double`) that are either unsupported or incorrectly evaluated by standard draft-based JSON Schema validators.

`pure-openapi-assert` was built from the ground up to solve this mismatch, delivering:

-   **Zero AJV Runtime-Heavy Overhead:** An independent, custom-built OpenAPI-first validation engine with **zero heavy dependencies**.
-   **Guaranteed Performance SLOs:** Blazing-fast hot runs (**<3ms** with in-memory caching) and ultra-responsive initial cold runs (**<100ms**).
-   **Hyper-Strict TypeScript Typings:** Native type safety that helps prevent mismatches in options, formats, and configurations.
-   **Polymorphism Support:** Built-in high-performance evaluation of polymorphic compositions (`oneOf`, `anyOf`, `allOf`) with explicit support for `discriminator` routing to avoid evaluating irrelevant schema branches.
-   **Comprehensive Developer Experience (DX):** Validation failures are compiled into structured, highly readable nested property paths (e.g. `[body.profile.address.zipCode]`) for immediate root-cause diagnosis.

---

## 📦 Installation

Install `pure-openapi-assert` via your preferred package manager:

```bash
# Using pnpm
pnpm add -D pure-openapi-assert

# Using npm
npm install --save-dev pure-openapi-assert

# Using yarn
yarn add -D pure-openapi-assert
```

---

## ⚡ Quickstart

Validate HTTP responses directly against your OpenAPI 3.0 contract:

```typescript
import { assertResponseMatchesOpenAPI } from 'pure-openapi-assert';

async function testMyAPI() {
  const actualResponse = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    name: "Jane Doe",
    email: "jane.doe@example.com"
  };

  await assertResponseMatchesOpenAPI({
    specPath: 'docs/openapi.yaml', // Path to your local OpenAPI spec file
    path: '/users/{id}',          // The route pattern as defined in the spec
    method: 'GET',
    status: 200,
    body: actualResponse
  });
}
```

---

## 🛠️ Advanced Integrations

### 1. Native Integration with Vitest (`expect.extend`)

To make your test assertions more idiomatic, you can extend Vitest's `expect` matchers:

```typescript
// vitest.setup.ts
import { expect } from 'vitest';
import { assertResponseMatchesOpenAPI, type OpenAPIValidatorInput } from 'pure-openapi-assert';

expect.extend({
  async toMatchOpenAPI(received: Omit<OpenAPIValidatorInput, 'specPath'>, specPath: string) {
    try {
      await assertResponseMatchesOpenAPI({
        ...received,
        specPath
      });
      return {
        pass: true,
        message: () => 'Expected response not to match OpenAPI contract'
      };
    } catch (error: any) {
      return {
        pass: false,
        message: () => error.message
      };
    }
  }
});
```

Declare types for the custom matcher in a `d.ts` file:

```typescript
// types/vitest.d.ts
import 'vitest';

interface CustomMatchers<R = unknown> {
  toMatchOpenAPI(specPath: string): Promise<R>;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
```

Use the custom matcher in your tests:

```typescript
import { describe, it, expect } from 'vitest';

describe('Users API', () => {
  it('should match the OpenAPI specification', async () => {
    const apiResponse = {
      status: 200,
      contentType: 'application/json',
      body: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'user@domain.com'
      }
    };

    await expect({
      path: '/users/{id}',
      method: 'GET',
      status: apiResponse.status,
      body: apiResponse.body,
      contentType: apiResponse.contentType
    }).toMatchOpenAPI('docs/openapi.yaml');
  });
});
```

---

### 2. Integration with Supertest & Jest

Integrate seamlessly into End-to-End API test suites utilizing Jest and `supertest`:

```typescript
import request from 'supertest';
import app from '../src/app'; // Your Express application
import { assertResponseMatchesOpenAPI } from 'pure-openapi-assert';

describe('GET /items', () => {
  it('should return valid JSON list of items', async () => {
    const response = await request(app)
      .get('/items')
      .expect(200);

    // Validate the actual network response against the OpenAPI document
    await expect(
      assertResponseMatchesOpenAPI({
        specPath: 'openapi.yaml',
        path: '/items',
        method: 'GET',
        status: response.status,
        body: response.body,
        contentType: response.headers['content-type']
      })
    ).resolves.toBeUndefined();
  });
});
```

---

## 🎨 Custom Format Injection

`pure-openapi-assert` validates standard OpenAPI 3.0 formats (such as `uuid`, `email`, `date`, `date-time`, `ipv4`, `ipv6`, `hostname`, `uri`, `byte`, `int32`, `int64`, `float`, and `double`) out of the box. 

If your spec defines custom formats, you can inject validation predicates programmatically:

```typescript
await assertResponseMatchesOpenAPI({
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
    'fiscal-code': (val: string) => /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(val)
  }
});
```

---

## ⚠️ Non-JSON Content Types & XML Limitations

### Opaque Content-Type Fail-Safe
`pure-openapi-assert` enforces robust API validation for both JSON and non-JSON media types:
-   **JSON Media Types (`application/json`, `application/*+json`):** Evaluated deeply down to the individual keys, formats, and structural restrictions.
-   **Text-based Media Types (`text/html`, `text/plain`, `text/xml`, etc.):** Validated opaquely to ensure that the response payload is a native JavaScript `string`.
-   **Binary / File Media Types (`application/pdf`, `image/png`, etc.):** Validated opaquely to ensure the payload is a valid Node.js `Buffer`.

### XML Schema Deep Validation Workaround
Due to the stateless and zero-dependency nature of the library, the core engine does not bundle a heavy XML parser. If your API endpoint serves deep XML structures and you want to validate them structurally against your OpenAPI contracts:

1.  Use a fast, lightweight library (like `fast-xml-parser`) to deserialize the XML response into a plain JavaScript Object.
2.  Pass the parsed object into the assertion function.
3.  **Ensure your OpenAPI specification also declares `application/json` (with the identical schema) for that endpoint.** Since the router strictly matches requested media types against the specification, forcing `contentType: 'application/json'` on an endpoint that *only* declares XML in the contract will trigger a schema routing error.
4.  Override the `contentType` parameter to `'application/json'` in the assertion call to trigger deep structural schema validation.

```typescript
import { XMLParser } from 'fast-xml-parser';
import { assertResponseMatchesOpenAPI } from 'pure-openapi-assert';

// 1. Receive XML from your server
const xmlResponse = `<user><id>123</id><email>xml@domain.com</email></user>`;

// 2. Parse into a JS Object
const parser = new XMLParser();
const jsObject = parser.parse(xmlResponse);

// 3. Assert deep schemas with application/json override
// (Requires both application/xml and application/json to be declared for this route in openapi.yaml)
await assertResponseMatchesOpenAPI({
  specPath: 'openapi.yaml',
  path: '/user',
  method: 'GET',
  status: 200,
  body: jsObject,
  contentType: 'application/json' // Forces deep validation on the parsed structure
});
```

---

## 🔍 Error Diagnostics Output Example

When a contract violation is detected, `pure-openapi-assert` generates comprehensive diagnostics pinpointing exactly what failed:

```text
Error: OpenAPI contract violation for GET /test/formats 200.
Validation errors:
- [body.uuid] Expected string format 'uuid', received 'invalid-uuid'
- [body.email] Expected string format 'email', received 'not-an-email'
- [body.profiles[0].age] Expected integer, received string 'twenty-five'
```

---

## 📜 License

Licensed under the **ISC License**. Free for personal, commercial, and enterprise usage. See the [LICENSE](./LICENSE) file for details.