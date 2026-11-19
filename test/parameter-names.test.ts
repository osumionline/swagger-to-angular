import { describe, expect, it } from 'vitest';

import generateMethods from '../src/generator/methods.js';
import createParameterName from '../src/generator/parameter-name.js';

import type { SwaggerParameter, SwaggerPaths } from '../src/generator/types.js';

describe('OpenAPI HTTP parameter names', (): void => {
  it('preserves valid parameter identifiers', (): void => {
    const usedNames: Set<string> = new Set<string>();

    const id: SwaggerParameter = {
      name: 'id',
      in: 'path',
    };

    const search: SwaggerParameter = {
      name: 'search',
      in: 'query',
    };

    expect(createParameterName(id, usedNames)).toBe('id');
    expect(createParameterName(search, usedNames)).toBe('search');

    expect(usedNames.has('id')).toBe(true);
    expect(usedNames.has('search')).toBe(true);
  });

  it('generates unique identifiers for repeated names', (): void => {
    const usedNames: Set<string> = new Set<string>();

    const pathParameter: SwaggerParameter = {
      name: 'id',
      in: 'path',
    };

    const queryParameter: SwaggerParameter = {
      name: 'id',
      in: 'query',
    };

    expect(createParameterName(pathParameter, usedNames)).toBe('id');

    expect(createParameterName(queryParameter, usedNames)).toBe('id_query');

    expect(createParameterName(queryParameter, usedNames)).toBe('id_query_2');
  });

  it('avoids names reserved for generated method internals', (): void => {
    const usedNames: Set<string> = new Set<string>();

    const names: string[] = [
      'params',
      'options',
      'payload',
      'arguments',
      'eval',
    ];

    const generatedNames: string[] = names.map((name: string): string => {
      const parameter: SwaggerParameter = {
        name,
        in: 'query',
      };

      return createParameterName(parameter, usedNames);
    });

    expect(generatedNames).toEqual([
      'params_query',
      'options_query',
      'payload_query',
      'arguments_query',
      'eval_query',
    ]);
  });

  it('generates valid identifiers for special path names', (): void => {
    const paths: SwaggerPaths = {
      '/v1/users/{user-id}': {
        get: {
          operationId: 'getUser',
          parameters: [
            {
              name: 'user-id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: { type: 'string' },
                },
              },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'getUser(OpenApiSchema_user_2d_id: number): Observable<string>',
    );

    expect(content).toContain(
      '.get<string>(`${this.basePathApi}/v1/users/${OpenApiSchema_user_2d_id}`, {})',
    );

    expect(content).not.toContain('getUser(user-id:');
  });

  it('keeps original query keys when names need encoding', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        get: {
          operationId: 'searchItems',
          parameters: [
            {
              name: 'sort-by',
              in: 'query',
              schema: { type: 'string' },
            },
            {
              name: 'first name',
              in: 'query',
              schema: { type: 'string' },
            },
            {
              name: '123code',
              in: 'query',
              schema: { type: 'integer' },
            },
          ],
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'searchItems(OpenApiSchema_sort_2d_by?: string, OpenApiSchema_first_20_name?: string, OpenApiSchema_123code?: number)',
    );

    expect(content).toContain(
      "params = params.set('sort-by', String(OpenApiSchema_sort_2d_by));",
    );

    expect(content).toContain(
      'params = params.set("first name", String(OpenApiSchema_first_20_name));',
    );

    expect(content).toContain(
      "params = params.set('123code', String(OpenApiSchema_123code));",
    );
  });

  it('distinguishes path and query parameters with the same name', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items/{id}': {
        get: {
          operationId: 'getItem',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
            {
              name: 'id',
              in: 'query',
              schema: { type: 'string' },
            },
          ],
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'getItem(id: number, id_query?: string): Observable<any>',
    );

    expect(content).toContain('/v1/items/${id}');

    expect(content).toContain("params = params.set('id', String(id_query));");
  });

  it('avoids conflicts with params, options and payload', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        post: {
          operationId: 'saveItem',
          parameters: [
            {
              name: 'params',
              in: 'query',
              schema: { type: 'string' },
            },
            {
              name: 'options',
              in: 'query',
              schema: { type: 'string' },
            },
            {
              name: 'payload',
              in: 'query',
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'integer' },
              },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'saveItem(payload: number, params_query?: string, options_query?: string, payload_query?: string)',
    );

    expect(content).toContain('let params = new HttpParams();');

    expect(content).toContain('const options = {');

    expect(content).toContain(
      "params = params.set('params', String(params_query));",
    );

    expect(content).toContain(
      "params = params.set('options', String(options_query));",
    );

    expect(content).toContain(
      "params = params.set('payload', String(payload_query));",
    );

    expect(content).toContain(
      '.post<any>(`${this.basePathApi}/v1/items`, payload, options)',
    );
  });

  it('escapes special characters in query parameter keys', (): void => {
    const paths: SwaggerPaths = {
      '/v1/search': {
        get: {
          operationId: 'search',
          parameters: [
            {
              name: "x'key",
              in: 'query',
              schema: { type: 'string' },
            },
            {
              name: 'line\nbreak',
              in: 'query',
              schema: { type: 'integer' },
            },
          ],
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('OpenApiSchema_x_27_key?: string');

    expect(content).toContain('OpenApiSchema_line_a_break?: number');

    expect(content).toContain(
      'params = params.set("x\'key", String(OpenApiSchema_x_27_key));',
    );

    expect(content).toContain(
      'params = params.set("line\\nbreak", String(OpenApiSchema_line_a_break));',
    );
  });

  it('avoids collisions between encoded and existing names', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        get: {
          operationId: 'listItems',
          parameters: [
            {
              name: 'user-id',
              in: 'query',
              schema: { type: 'integer' },
            },
            {
              name: 'OpenApiSchema_user_2d_id',
              in: 'query',
              schema: { type: 'integer' },
            },
          ],
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('OpenApiSchema_user_2d_id?: number');

    expect(content).toContain(
      'OpenApiSchema_OpenApiSchema_5f_user_5f_2d_5f_id?: number',
    );

    expect(content).toContain(
      "params = params.set('user-id', String(OpenApiSchema_user_2d_id));",
    );

    expect(content).toContain(
      "params = params.set('OpenApiSchema_user_2d_id', String(OpenApiSchema_OpenApiSchema_5f_user_5f_2d_5f_id));",
    );
  });
});
