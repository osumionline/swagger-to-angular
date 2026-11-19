import { describe, expect, it } from 'vitest';

import generateMethods from '../src/generator/methods.js';
import generateQueryParameterCode from '../src/generator/query-serializer.js';

import type { SwaggerParameter, SwaggerPaths } from '../src/generator/types.js';

describe('OpenAPI query parameter serialization', (): void => {
  it('preserves scalar query serialization', (): void => {
    const parameter: SwaggerParameter = {
      name: 'page',
      in: 'query',
      schema: { type: 'integer' },
    };

    const content: string = generateQueryParameterCode(
      parameter,
      'page',
      "'page'",
    );

    expect(content).toBe(
      '    if (page !== undefined) {\n' +
        "      params = params.set('page', String(page));\n" +
        '    }',
    );
  });

  it('uses repeated keys for arrays by default', (): void => {
    const parameter: SwaggerParameter = {
      name: 'colors',
      in: 'query',
      schema: {
        type: 'array',
        items: { type: 'string' },
      },
    };

    const content: string = generateQueryParameterCode(
      parameter,
      'colors',
      "'colors'",
    );

    expect(content).toContain('for (const value of colors) {');

    expect(content).toContain(
      "params = params.append('colors', String(value));",
    );

    expect(content).not.toContain("params = params.set('colors'");
  });

  it('supports explicit form style with explode true', (): void => {
    const parameter: SwaggerParameter = {
      name: 'ids',
      in: 'query',
      style: 'form',
      explode: true,
      schema: {
        type: 'array',
        items: { type: 'integer' },
      },
    };

    const content: string = generateQueryParameterCode(
      parameter,
      'ids',
      "'ids'",
    );

    expect(content).toContain("params = params.append('ids', String(value));");
  });

  it('joins form arrays with commas when explode is false', (): void => {
    const parameter: SwaggerParameter = {
      name: 'ids',
      in: 'query',
      style: 'form',
      explode: false,
      schema: {
        type: 'array',
        items: { type: 'integer' },
      },
    };

    const content: string = generateQueryParameterCode(
      parameter,
      'ids',
      "'ids'",
    );

    expect(content).toContain(
      `params = params.set('ids', ids.map((value): string => String(value)).join(","));`,
    );

    expect(content).not.toContain('params.append');
  });

  it('supports spaceDelimited arrays', (): void => {
    const parameter: SwaggerParameter = {
      name: 'colors',
      in: 'query',
      style: 'spaceDelimited',
      schema: {
        type: 'array',
        items: { type: 'string' },
      },
    };

    const content: string = generateQueryParameterCode(
      parameter,
      'colors',
      "'colors'",
    );

    expect(content).toContain(
      `colors.map((value): string => String(value)).join(" ")`,
    );
  });

  it('supports pipeDelimited arrays', (): void => {
    const parameter: SwaggerParameter = {
      name: 'colors',
      in: 'query',
      style: 'pipeDelimited',
      schema: {
        type: 'array',
        items: { type: 'string' },
      },
    };

    const content: string = generateQueryParameterCode(
      parameter,
      'colors',
      "'colors'",
    );

    expect(content).toContain(
      `colors.map((value): string => String(value)).join("|")`,
    );
  });

  it('guards nullable array parameters', (): void => {
    const parameter: SwaggerParameter = {
      name: 'values',
      in: 'query',
      schema: {
        type: 'array',
        nullable: true,
        items: { type: 'string' },
      },
    };

    const content: string = generateQueryParameterCode(
      parameter,
      'values',
      "'values'",
    );

    expect(content).toContain('if (values !== undefined && values !== null) {');
  });

  it('preserves escaped query keys for arrays', (): void => {
    const parameter: SwaggerParameter = {
      name: 'filter colors',
      in: 'query',
      schema: {
        type: 'array',
        items: { type: 'string' },
      },
    };

    const content: string = generateQueryParameterCode(
      parameter,
      'filterColors',
      '"filter colors"',
    );

    expect(content).toContain(
      'params = params.append("filter colors", String(value));',
    );
  });

  it('keeps existing fallback for unsupported query styles', (): void => {
    const parameter: SwaggerParameter = {
      name: 'filters',
      in: 'query',
      style: 'deepObject',
      schema: {
        type: 'object',
        properties: {
          category: { type: 'string' },
        },
      },
    };

    const content: string = generateQueryParameterCode(
      parameter,
      'filters',
      "'filters'",
    );

    expect(content).toContain(
      "params = params.set('filters', String(filters));",
    );
  });

  it('generates correctly typed array query arguments', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        get: {
          operationId: 'searchItems',
          parameters: [
            {
              name: 'colors',
              in: 'query',
              schema: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            {
              name: 'ids',
              in: 'query',
              required: true,
              explode: false,
              schema: {
                type: 'array',
                items: { type: 'integer' },
              },
            },
            {
              name: 'active',
              in: 'query',
              schema: { type: 'boolean' },
            },
          ],
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'searchItems(ids: number[], colors?: string[], active?: boolean): Observable<any>',
    );

    expect(content).toContain(
      "params = params.append('colors', String(value));",
    );

    expect(content).toContain(
      `params = params.set('ids', ids.map((value): string => String(value)).join(","));`,
    );

    expect(content).toContain("params = params.set('active', String(active));");
  });

  it('combines array queries with headers and binary responses', (): void => {
    const paths: SwaggerPaths = {
      '/v1/reports': {
        get: {
          operationId: 'getReports',
          parameters: [
            {
              name: 'ids',
              in: 'query',
              style: 'pipeDelimited',
              schema: {
                type: 'array',
                items: { type: 'integer' },
              },
            },
            {
              name: 'X-Request-Id',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              content: {
                'application/pdf': {},
              },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'getReports(OpenApiSchema_X_2d_Request_2d_Id: string, ids?: number[]): Observable<ArrayBuffer>',
    );

    expect(content).toContain(
      `ids.map((value): string => String(value)).join("|")`,
    );

    expect(content).toContain(
      "headers['X-Request-Id'] = String(OpenApiSchema_X_2d_Request_2d_Id);",
    );

    expect(content).toContain("responseType: 'arraybuffer' as const");

    expect(content).toContain(
      '.get(`${this.basePathApi}/v1/reports`, options)',
    );
  });
});
