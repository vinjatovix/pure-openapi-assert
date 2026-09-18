# pure-openapi-assert

State-of-the-art, ultra-lightweight, and high-performance OpenAPI 3.0 response contract assertion library for modern testing.

[![NPM Version](https://img.shields.io/npm/v/pure-openapi-assert.svg)](https://www.npmjs.com/package/pure-openapi-assert)
[![CI Status](https://github.com/vinjatovix/pure-openapi-assert/actions/workflows/ci.yml/badge.svg)](https://github.com/vinjatovix/pure-openapi-assert/actions)
[![Test Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/vinjatovix/feac8a8435ec9adc322d155a51ac5079/raw/coverage.json)](https://github.com/vinjatovix/pure-openapi-assert)
[![DeepScan grade](https://deepscan.io/api/teams/30684/projects/32433/branches/1073555/badge/grade.svg)](https://deepscan.io/dashboard#view=project&tid=30684&pid=32433&bid=1073555)
[![License](https://img.shields.io/github/license/vinjatovix/pure-openapi-assert.svg)](https://github.com/vinjatovix/pure-openapi-assert/blob/main/LICENSE)

---

## 🚀 Why `pure-openapi-assert`? (The AJV Problem)

Most traditional testing setups rely on AJV or other JSON Schema engines to validate API responses. However, **JSON Schema is not OpenAPI**. OpenAPI 3.0 introduced critical structural divergences (such as polymorphic `discriminator` mapping, strict `nullable` behaviors, and specialized numeric constraints like `int32`, `int64`, `float`, and `double`) that are either unsupported or incorrectly evaluated by standard draft-based JSON Schema validators.

`pure-openapi-assert` was built from the ground up to solve this mismatch, delivering:

- **Zero AJV Runtime-Heavy Overhead:** An independent, custom-built OpenAPI-first validation engine with **zero heavy dependencies**.
- **Guaranteed Performance SLOs:** Blazing-fast hot runs (**<3ms** with in-memory caching) and ultra-responsive initial cold runs (**<100ms**).
- **Hyper-Strict TypeScript Typings:** Native type safety that helps prevent mismatches in options, formats, and configurations.
- **Polymorphism Support:** Built-in high-performance evaluation of polymorphic compositions (`oneOf`, `anyOf`, `allOf`) with explicit support for `discriminator` routing to avoid evaluating irrelevant schema branches.
- **Negation Support (`not` Keyword):** Full compliance with the OpenAPI 3.0 `not` directive. Payloads matching schemas specified under a `not` block are strictly rejected, while non-matching payloads are accepted cleanly with zero error leakages or context pollution.
- **Comprehensive Developer Experience (DX):** Validation failures are compiled into structured, highly readable nested property paths (e.g. `[body.profile.address.zipCode]`) for immediate root-cause diagnosis.

### Feature Comparison

| Feature / Pain Point | AJV + Custom JSON-Schema Wrappers | express-openapi-validator | `pure-openapi-assert` (Our Library) |
|:---|:---|:---|:---|
| **Dependencies** | Heavy (AJV, ajv-formats, etc.) | Bound to Express, pulls heavy HTTP middleware | **Ultra-lightweight** (minimal dependencies, in-memory AST router) |
| **Performance** | High, but heavy compilation/init times | Slowed by middleware layers & express stacks | **Hot runs <3ms** (via `WeakMap` and bounded `FIFOCache`) |
| **Coupling** | Decoupled, but requires complex glue code | Highly coupled to Express.js (unusable in Koa, Fastify, Edge) | **100% decoupling** (pure in-memory AST match over raw objects) |
| **HTTP Coercion** | Bypassed or manual (often fails on headers/query) | Express-specific body-parsing coercion | **Built-in strict coercion boundaries** for headers/query |
| **Floating-Point Precision**| Suffers from standard V8 precision loss on large integers | Suffers from standard precision loss on large integers | **Deterministic custom Lossless BigInt Parsing** |
| **Polymorphism** | Complex schema configuration | Hard to trace dynamic discriminator paths | **Explicit delegation with dispatch tables** |

---

## 🛡️ Design Philosophy: Zero-Bypass Type Safety

The structural integrity of `pure-openapi-assert` is governed by our **Zero-Bypass** engineering standard:

1.  **No Compilation Bypasses (`as any` / `as unknown`):** We ban loose type assertions. TypeScript soundness guarantees that validation contracts map cleanly at compile-time and runtime.
2.  **No Non-Null Assertions (`!`):** Every value that can be optional, `null`, or `undefined` is checked explicitly using type-guards or fallback defaults.
3.  **Strict Coercion Boundaries:** Wire transport values (like query parameters and headers) always arrive as strings. The library coerces them according to the OpenAPI schema into real primitive types (like `integer`, `boolean`, `number`) before checking constraints, preventing silent bypasses.

---

## ⏱️ Intelligent Cache Invalidation & Watch Mode (Perfect DX)

API testing relies heavily on active **Watch Mode** loops (`vitest --watch` or `jest --watch`) to provide developers with instant feedback during TDD cycles. Traditionally, libraries cache OpenAPI specifications statically in memory, forcing developers to manually kill and restart their test runners every time they modify their OpenAPI specification file to see schema changes.

`pure-openapi-assert` natively solves this bottleneck by incorporating a **Centralized State Manager** with **Smart Cache Invalidation** based on the file modification time (`mtime`):

- **Automatic Schema Re-parsing:** Every time you run an assertion in Watch Mode, the library checks the spec file's `mtimeMs` on disk. If you edited and saved the spec file, `pure-openapi-assert` instantly invalidates the old cache, purges all associated JSON pointer resolutions, and parses the fresh OpenAPI document on-the-fly. **No test runner restarts required!**
- **Same-Tick I/O Throttling:** To satisfy our **<3ms hot run SLO** and prevent hammering the filesystem when executing hundreds of parallel assertions, the state manager features a microtask-buffered cache. It limits disk `stat` reads to **exactly once per event-loop tick** (`queueMicrotask`), ensuring supreme performance and zero disk bottlenecks.

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

Validate HTTP responses directly against your OpenAPI 3.0 contract in a single line. Pass your `fetch`, `axios`, or `supertest` response directly to the `response` property—the library safely auto-extracts the status, headers, and body for you.

```typescript
import { assertResponseMatchesOpenApi } from 'pure-openapi-assert';

async function testMyAPI() {
  // 1. Execute your request using Fetch, Axios, or Supertest
  const response = await fetch('https://api.example.com/users/123');

  // 2. Assert against your OpenAPI contract instantly
  await assertResponseMatchesOpenApi({
    specPath: 'docs/openapi.yaml', // Path to your local OpenAPI spec file
    path: '/users/{id}',           // The route pattern as defined in the spec
    method: 'GET',
    response                       // Auto-extracts status, headers, and body!
  });

  // 3. Do your business assertions! 
  // (We automatically clone Fetch streams, so response.json() is still fully available to you)
  const data = await response.json();
  expect(data.name).toBe('Jane Doe');
}
```

> ⚠️ **Fetch Stream Consumption (Crucial Edge Case)**: Native Fetch response bodies can only be consumed once.
> 
> - **Path A: Assert First (Recommended)**: Pass the `response` object directly. We automatically clone it internally, keeping the original stream untouched so you can still safely call `await response.json()` in your test afterwards.
> - **Path B: Read Body First**: If you already consumed the stream (e.g. `const data = await response.json()`) *before* passing the response to the validator, the stream is spent. In this case, simply use the **Explicit Mode** to pass the pre-parsed body directly. You can optionally also pass the `headers` (which we will automatically normalize) and `contentType`:
> 
> ```typescript
> const response = await fetch('https://api.example.com/users/123');
> const data = await response.json(); // <-- Stream is now consumed
> 
> await assertResponseMatchesOpenApi({
>   specPath: 'docs/openapi.yaml',
>   path: '/users/{id}',
>   method: 'GET',
>   status: response.status,
>   body: data,                    // <-- Explicitly pass the pre-parsed body!
>   headers: response.headers,     // <-- Optional: Pass fetch headers directly (we normalize them)
>   contentType: 'application/json' // <-- Optional: Explicit content type override
> });
> ```

---

## 📖 Complete Documentation & BDD Adoption Manual

To unlock the full potential of `pure-openapi-assert`, explore our comprehensive **Adoption Manual**. It serves as the single source of truth (SSOT) for all technical integrations and advanced configurations:

👉 **[pure-openapi-assert Adoption Manual & BDD Guide](./docs/adoption-manual.md)**

### What is covered in the Adoption Manual:
*   **The AAA (Arrange-Act-Assert) Testing Pattern** — Industry standard practices for contract and BDD testing.
*   **Vitest Matcher Integration (`expect.extend`)** — Full tutorial to extend expectation runners with 100% strict type autocomplete.
*   **Supertest & Jest Integration** — Complete end-to-end setups.
*   **XML Response Workaround** — Deep structural schema validation guidelines for XML APIs.
*   **Custom Format Predicates Injection** — Extend and register bespoke data constraints dynamically.
*   **Complete OpenAPI 3.0 Keyword Compatibility Matrix** — Full spec evaluation boundaries.
*   **Error Diagnostic Formats and Structured Remediation Guides**.

---

## 📜 License

Licensed under the **ISC License**. Free for personal, commercial, and enterprise usage. See the [LICENSE](./LICENSE) file for details.
