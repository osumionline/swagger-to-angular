import { describe, expect, it } from 'vitest';

import generateMethods from '../src/generator/methods.js';
import type { SwaggerPaths } from '../src/generator/types.js';

describe('generateMethods HTTP requests', (): void => {
  it('generates POST without body using null', (): void => {
    const paths: SwaggerPaths = {
      '/v1/ping': {
        post: {
          operationId: 'postPing',
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

    expect(content).toContain('postPing(): Observable<string>');

    expect(content).toContain(
      '.post<string>(`${this.basePathApi}/v1/ping`, null, {})',
    );
  });

  it('generates PUT without body and preserves query options', (): void => {
    const paths: SwaggerPaths = {
      '/v1/settings': {
        put: {
          operationId: 'updateSettings',
          parameters: [
            {
              name: 'force',
              in: 'query',
              schema: { type: 'boolean' },
            },
          ],
          responses: {
            '200': {
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
      'updateSettings(force?: boolean): Observable<boolean>',
    );

    expect(content).toContain("params = params.set('force', String(force));");

    expect(content).toContain('const options = {');

    expect(content).toContain(
      '.put<boolean>(`${this.basePathApi}/v1/settings`, null, options)',
    );
  });

  it('generates PATCH without body and preserves binary options', (): void => {
    const paths: SwaggerPaths = {
      '/v1/export': {
        patch: {
          operationId: 'exportData',
          parameters: [
            {
              name: 'format',
              in: 'query',
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
      'exportData(format?: string): Observable<ArrayBuffer>',
    );

    expect(content).toContain("params = params.set('format', String(format));");

    expect(content).toContain("responseType: 'arraybuffer' as const");

    expect(content).toContain(
      '.patch(`${this.basePathApi}/v1/export`, null, options)',
    );
  });

  it('preserves POST requests with a required payload', (): void => {
    const paths: SwaggerPaths = {
      '/v1/users': {
        post: {
          operationId: 'createUser',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email'],
                  properties: {
                    email: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
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

    expect(content).toContain('createUser(payload: { email: string; })');

    expect(content).toContain(
      '.post<boolean>(`${this.basePathApi}/v1/users`, payload, {})',
    );

    expect(content).not.toContain(
      '.post<boolean>(`${this.basePathApi}/v1/users`, null, {})',
    );
  });

  it('preserves PUT and PATCH requests with payloads', (): void => {
    const paths: SwaggerPaths = {
      '/v1/profile': {
        put: {
          operationId: 'replaceProfile',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'string' },
              },
            },
          },
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: { type: 'boolean' },
                },
              },
            },
          },
        },
        patch: {
          operationId: 'modifyProfile',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'string' },
              },
            },
          },
          responses: {
            '200': {
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
      '.put<boolean>(`${this.basePathApi}/v1/profile`, JSON.stringify(payload), options)',
    );

    expect(content).toContain(
      '.patch<boolean>(`${this.basePathApi}/v1/profile`, JSON.stringify(payload), options)',
    );
  });

  it('preserves GET and DELETE without body arguments', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        get: {
          operationId: 'getItems',
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: { type: 'integer' },
                },
              },
            },
          },
        },
        delete: {
          operationId: 'deleteItems',
          responses: {
            '200': {
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
      '.get<number>(`${this.basePathApi}/v1/items`, {})',
    );

    expect(content).toContain(
      '.delete<boolean>(`${this.basePathApi}/v1/items`, {})',
    );
  });

  it('preserves DELETE requests with a body', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        delete: {
          operationId: 'deleteItemWithReason',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'string' },
              },
            },
          },
          responses: {
            '200': {
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
      '.delete<boolean>(`${this.basePathApi}/v1/items`, { body: JSON.stringify(payload), ...options })',
    );
  });
});
