import { describe, expect, it } from 'vitest';
import { ValidationContext } from '../../../src/core/ValidationContext.js';
import { validateShape } from '../../../src/validators/index.js';
import { validateParameters } from '../../../src/validators/parameters.js';
import type {
  OperationRequestContract,
  ResolvedParameter
} from '../../../src/openapi/router.js';

function makeContract(
  parameters: ResolvedParameter[],
  templatePathParamNames: string[] = []
): OperationRequestContract {
  return {
    operation: { responses: {} },
    bodySchema: null,
    bodyRequired: false,
    hasRequestBody: false,
    matchedContentType: null,
    parameters,
    templatePathParamNames,
    matchedPath: '/test',
    extractedPathParams: {}
  };
}

function errorPaths(ctx: ValidationContext): string[] {
  return ctx.errors.map((e) => e.path);
}

const stringParam = (
  overrides: Partial<ResolvedParameter>
): ResolvedParameter => ({
  name: 'x',
  in: 'query',
  required: false,
  schema: { type: 'string' },
  style: 'form',
  explode: true,
  ...overrides
});

describe('validators/parameters - validateParameters', () => {
  it('reports a missing required parameter under [<loc>.<name>]', () => {
    const ctx = new ValidationContext();
    validateParameters({
      contract: makeContract([
        stringParam({ name: 'id', in: 'path', required: true })
      ]),
      input: {},
      ctx,
      validateShape
    });

    expect(errorPaths(ctx)).toContain('path.id');
  });

  it('matches headers case-insensitively but keeps the canonical name in the prefix', () => {
    const okCtx = new ValidationContext();
    validateParameters({
      contract: makeContract([
        stringParam({ name: 'X-Tenant-Id', in: 'header', required: true })
      ]),
      input: { headers: { 'x-tenant-id': 'acme' } },
      ctx: okCtx,
      validateShape
    });
    expect(okCtx.hasErrors()).toBe(false);

    const missingCtx = new ValidationContext();
    validateParameters({
      contract: makeContract([
        stringParam({ name: 'X-Tenant-Id', in: 'header', required: true })
      ]),
      input: {},
      ctx: missingCtx,
      validateShape
    });
    expect(errorPaths(missingCtx)).toContain('header.X-Tenant-Id');
  });

  it('treats query parameters as case-sensitive', () => {
    const ctx = new ValidationContext();
    validateParameters({
      contract: makeContract([
        stringParam({ name: 'Page', in: 'query', required: true })
      ]),
      input: { query: { page: '1' } },
      ctx,
      validateShape
    });

    expect(errorPaths(ctx)).toContain('query.Page');
  });

  it('is permissive about undeclared query/header params', () => {
    const ctx = new ValidationContext();
    validateParameters({
      contract: makeContract([]),
      input: {
        query: { undeclared: 'x' },
        headers: { 'x-undeclared': 'y' }
      },
      ctx,
      validateShape
    });

    expect(ctx.hasErrors()).toBe(false);
  });

  it('coerces and validates a query parameter schema', () => {
    const intParam: ResolvedParameter = stringParam({
      name: 'page',
      in: 'query',
      schema: { type: 'integer' }
    });

    const badCtx = new ValidationContext();
    validateParameters({
      contract: makeContract([intParam]),
      input: { query: { page: 'abc' } },
      ctx: badCtx,
      validateShape
    });
    expect(errorPaths(badCtx)).toContain('query.page');

    const okCtx = new ValidationContext();
    validateParameters({
      contract: makeContract([intParam]),
      input: { query: { page: '5' } },
      ctx: okCtx,
      validateShape
    });
    expect(okCtx.hasErrors()).toBe(false);
  });

  it('detects a path param declared but absent from the template', () => {
    const ctx = new ValidationContext();
    validateParameters({
      contract: makeContract(
        [stringParam({ name: 'ghost', in: 'path', required: true })],
        []
      ),
      input: { pathParams: { ghost: 'x' } },
      ctx,
      validateShape
    });

    expect(
      ctx.errors.some(
        (e) =>
          e.path === 'path.ghost' &&
          /absent from the path template/.test(e.message)
      )
    ).toBe(true);
  });

  it('detects a template token not declared as a parameter', () => {
    const ctx = new ValidationContext();
    validateParameters({
      contract: makeContract([], ['wid']),
      input: {},
      ctx,
      validateShape
    });

    expect(
      ctx.errors.some(
        (e) => e.path === 'path.wid' && /not declared/.test(e.message)
      )
    ).toBe(true);
  });

  it('deserializes an array parameter via its style before validating', () => {
    const ctx = new ValidationContext();
    validateParameters({
      contract: makeContract([
        stringParam({
          name: 'tags',
          in: 'query',
          style: 'form',
          explode: false,
          schema: { type: 'array', items: { type: 'string' } }
        })
      ]),
      input: { query: { tags: 'a,b,c' } },
      ctx,
      validateShape
    });

    expect(ctx.hasErrors()).toBe(false);
  });

  describe('strictParameters mode', () => {
    it('reports error when an undeclared query parameter is present', () => {
      const contract = makeContract([
        stringParam({ name: 'page', in: 'query' })
      ]);
      const input = {
        query: { page: '1', unknownParam: 'val' },
        strictParameters: true
      };
      const ctx = new ValidationContext();

      validateParameters({
        contract,
        input,
        ctx,
        validateShape
      });

      expect(ctx.hasErrors()).toBe(true);
      expect(ctx.errors[0]?.path).toBe('query.unknownParam');
      expect(ctx.errors[0]?.message).toBe(
        "Query parameter 'unknownParam' is not declared in OpenAPI contract"
      );
    });

    it('reports error when an undeclared custom header is present', () => {
      const contract = makeContract([]);
      const input = {
        headers: { 'X-Custom-Unknown': 'secret' },
        strictParameters: true
      };
      const ctx = new ValidationContext();

      validateParameters({
        contract,
        input,
        ctx,
        validateShape
      });

      expect(ctx.hasErrors()).toBe(true);
      expect(ctx.errors[0]?.path).toBe('header.X-Custom-Unknown');
      expect(ctx.errors[0]?.message).toBe(
        "Header 'X-Custom-Unknown' is not declared in OpenAPI contract"
      );
    });

    it.each([
      'host',
      'user-agent',
      'accept',
      'content-type',
      'content-length',
      'connection',
      'cache-control',
      'authorization',
      'cookie',
      'User-Agent',
      'Authorization'
    ])('exempts standard RFC transport or security header: %s', (headerName) => {
      const contract = makeContract([]);
      const input = {
        headers: { [headerName]: 'val' },
        strictParameters: true
      };
      const ctx = new ValidationContext();

      validateParameters({
        contract,
        input,
        ctx,
        validateShape
      });

      expect(ctx.hasErrors()).toBe(false);
    });

    it('recognizes root key of deepObject query as declared parameter', () => {
      const contract = makeContract([
        stringParam({
          name: 'filter',
          in: 'query',
          schema: { type: 'object' }
        })
      ]);
      const input = {
        query: { 'filter[page]': '1' },
        strictParameters: true
      };
      const ctx = new ValidationContext();

      validateParameters({
        contract,
        input,
        ctx,
        validateShape
      });

      expect(ctx.hasErrors()).toBe(false);
    });

    it('allows undeclared parameters when strictParameters is false or omitted', () => {
      const contract = makeContract([]);
      const input = {
        query: { undeclared: 'ok' },
        headers: { 'x-undeclared': 'ok' },
        strictParameters: false
      };
      const ctx = new ValidationContext();

      validateParameters({
        contract,
        input,
        ctx,
        validateShape
      });

      expect(ctx.hasErrors()).toBe(false);
    });
  });
});
