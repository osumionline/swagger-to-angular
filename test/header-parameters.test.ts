import { describe, expect, it } from 'vitest';

import generateMethods from '../src/generator/methods.js';
import createParameterName from '../src/generator/parameter-name.js';
import type { SwaggerParameter, SwaggerPaths } from '../src/generator/types.js';

describe('OpenAPI header parameters', (): void => {
  it('generates a required header argument and HTTP option', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        get: {
          operationId: 'getItems',
          parameters: [
            {
              name: 'X-Request-Id',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
          ],
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'getItems(OpenApiSchema_X_2d_Request_2d_Id: string)',
    );

    expect(content).toContain('const headers: Record<string, string> = {};');

    expect(content).toContain(
      "headers['X-Request-Id'] = String(OpenApiSchema_X_2d_Request_2d_Id);",
    );

    expect(content).toContain('const options = {\n      headers\n    };');

    expect(content).toContain(
      '.get<any>(`${this.basePathApi}/v1/items`, options)',
    );
  });

  it('generates optional headers without sending undefined', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        get: {
          operationId: 'getItems',
          parameters: [
            {
              name: 'X-Client-Version',
              in: 'header',
              schema: { type: 'integer' },
            },
          ],
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'getItems(OpenApiSchema_X_2d_Client_2d_Version?: number)',
    );

    expect(content).toContain(
      'if (OpenApiSchema_X_2d_Client_2d_Version !== undefined) {',
    );

    expect(content).toContain(
      "headers['X-Client-Version'] = String(OpenApiSchema_X_2d_Client_2d_Version);",
    );
  });

  it('avoids collisions between path, query and header names', (): void => {
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
            {
              name: 'id',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
          ],
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'getItem(id: number, id_header: string, id_query?: string)',
    );

    expect(content).toContain('/v1/items/${id}');

    expect(content).toContain("params = params.set('id', String(id_query));");

    expect(content).toContain("headers['id'] = String(id_header);");
  });

  it('reserves headers as an internal variable name', (): void => {
    const usedNames: Set<string> = new Set<string>();

    const parameter: SwaggerParameter = {
      name: 'headers',
      in: 'header',
      schema: { type: 'string' },
    };

    expect(createParameterName(parameter, usedNames)).toBe('headers_header');

    const paths: SwaggerPaths = {
      '/v1/items': {
        get: {
          operationId: 'getItems',
          parameters: [parameter],
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('getItems(headers_header?: string)');

    expect(content).toContain("headers['headers'] = String(headers_header);");
  });

  it('ignores special header parameters defined by OpenAPI', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        get: {
          operationId: 'getItems',
          parameters: [
            {
              name: 'Accept',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'content-type',
              in: 'header',
              schema: { type: 'string' },
            },
            {
              name: 'AUTHORIZATION',
              in: 'header',
              schema: { type: 'string' },
            },
            {
              name: 'X-Locale',
              in: 'header',
              schema: { type: 'string' },
            },
          ],
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('getItems(OpenApiSchema_X_2d_Locale?: string)');

    expect(content).toContain(
      "headers['X-Locale'] = String(OpenApiSchema_X_2d_Locale);",
    );

    expect(content).not.toContain("headers['Accept']");
    expect(content).not.toContain("headers['content-type']");
    expect(content).not.toContain("headers['AUTHORIZATION']");
  });

  it('inherits headers and allows operation overrides', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        parameters: [
          {
            name: 'X-Version',
            in: 'header',
            schema: { type: 'string' },
          },
        ],
        get: {
          operationId: 'getItems',
          parameters: [
            {
              name: 'X-Version',
              in: 'header',
              required: true,
              schema: { type: 'integer' },
            },
          ],
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('getItems(OpenApiSchema_X_2d_Version: number)');

    expect(content).not.toContain('OpenApiSchema_X_2d_Version?: string');

    const assignments: RegExpMatchArray | null = content.match(
      /headers\['X-Version'\] =/g,
    );

    expect(assignments).toHaveLength(1);
  });

  it('escapes special characters in header names', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        get: {
          operationId: 'getItems',
          parameters: [
            {
              name: "X'Key",
              in: 'header',
              schema: { type: 'string' },
            },
          ],
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('getItems(OpenApiSchema_X_27_Key?: string)');

    expect(content).toContain(
      'headers["X\'Key"] = String(OpenApiSchema_X_27_Key);',
    );
  });

  it('combines headers, query parameters and a required body', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        post: {
          operationId: 'createItem',
          parameters: [
            {
              name: 'notify',
              in: 'query',
              schema: { type: 'boolean' },
            },
            {
              name: 'X-Request-Id',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'string' },
              },
            },
          },
          responses: {
            '201': {
              content: {
                'application/json': {
                  schema: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'createItem(OpenApiSchema_X_2d_Request_2d_Id: string, payload: string, notify?: boolean): Observable<boolean>',
    );

    expect(content).toContain("params = params.set('notify', String(notify));");

    expect(content).toContain(
      "headers['X-Request-Id'] = String(OpenApiSchema_X_2d_Request_2d_Id);",
    );

    expect(content).toContain(
      'const options = {\n      params,\n      headers\n    };',
    );

    expect(content).toContain(
      '.post<boolean>(`${this.basePathApi}/v1/items`, payload, options)',
    );
  });

  it('combines header options with binary responses', (): void => {
    const paths: SwaggerPaths = {
      '/v1/reports': {
        get: {
          operationId: 'getReport',
          parameters: [
            {
              name: 'X-Report-Version',
              in: 'header',
              schema: { type: 'integer' },
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
      'getReport(OpenApiSchema_X_2d_Report_2d_Version?: number): Observable<ArrayBuffer>',
    );

    expect(content).toContain("responseType: 'arraybuffer' as const");

    expect(content).toContain(
      '.get(`${this.basePathApi}/v1/reports`, options)',
    );
  });

  it('does not add headers to operations without header parameters', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        get: {
          operationId: 'getItems',
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('.get<any>(`${this.basePathApi}/v1/items`, {})');

    expect(content).not.toContain('const headers: Record<string, string>');
  });
});
