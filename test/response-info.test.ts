import { describe, expect, it } from 'vitest';

import generateMethods from '../src/generator/methods.js';
import getResponseInfo from '../src/generator/response-info.js';
import type {
  SwaggerOperation,
  SwaggerPaths,
  SwaggerResponseInfo,
} from '../src/generator/types.js';

describe('getResponseInfo', (): void => {
  it('uses a 200 JSON response when available', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '201': {
          content: {
            'application/json': {
              schema: { type: 'boolean' },
            },
          },
        },
        '200': {
          content: {
            'application/json': {
              schema: { type: 'string' },
            },
          },
        },
      },
    };

    const result: SwaggerResponseInfo = getResponseInfo(operation);

    expect(result).toEqual({
      returnType: 'string',
      isBinary: false,
    });
  });

  it('supports a 201 Created response', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '201': {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/User' },
            },
          },
        },
      },
    };

    const result: SwaggerResponseInfo = getResponseInfo(operation);

    expect(result).toEqual({
      returnType: 'User',
      isBinary: false,
    });
  });

  it('supports a 202 Accepted response', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '202': {
          content: {
            'application/json': {
              schema: { type: 'boolean' },
            },
          },
        },
      },
    };

    expect(getResponseInfo(operation).returnType).toBe('boolean');
  });

  it('returns void for 204 No Content', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '204': {
          description: 'No content',
        },
      },
    };

    const result: SwaggerResponseInfo = getResponseInfo(operation);

    expect(result).toEqual({
      returnType: 'void',
      isBinary: false,
    });
  });

  it('returns void for 205 Reset Content', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '205': {
          description: 'Reset content',
        },
      },
    };

    expect(getResponseInfo(operation).returnType).toBe('void');
  });

  it('returns void for a success response without content', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '200': {
          description: 'Successful request without a body',
        },
      },
    };

    expect(getResponseInfo(operation).returnType).toBe('void');
  });

  it('supports binary responses outside status 200', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '201': {
          content: {
            'application/pdf': {},
          },
        },
      },
    };

    const result: SwaggerResponseInfo = getResponseInfo(operation);

    expect(result).toEqual({
      returnType: 'ArrayBuffer',
      isBinary: true,
    });
  });

  it('supports the OpenAPI 2XX response range', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '2XX': {
          content: {
            'application/json': {
              schema: { type: 'integer' },
            },
          },
        },
      },
    };

    expect(getResponseInfo(operation).returnType).toBe('number');
  });

  it('prefers an explicit success status over 2XX', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '2XX': {
          content: {
            'application/json': {
              schema: { type: 'string' },
            },
          },
        },
        '201': {
          content: {
            'application/json': {
              schema: { type: 'boolean' },
            },
          },
        },
      },
    };

    expect(getResponseInfo(operation).returnType).toBe('boolean');
  });

  it('does not use error responses as success types', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '400': {
          content: {
            'application/json': {
              schema: { type: 'string' },
            },
          },
        },
        default: {
          content: {
            'application/json': {
              schema: { type: 'boolean' },
            },
          },
        },
      },
    };

    const result: SwaggerResponseInfo = getResponseInfo(operation);

    expect(result).toEqual({
      returnType: 'any',
      isBinary: false,
    });
  });

  it('preserves any when responses are missing', (): void => {
    const operation: SwaggerOperation = {};

    expect(getResponseInfo(operation)).toEqual({
      returnType: 'any',
      isBinary: false,
    });
  });

  it('generates an Angular method with a 201 response', (): void => {
    const paths: SwaggerPaths = {
      '/v1/users': {
        post: {
          operationId: 'createUser',
          responses: {
            '201': {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/User' },
                },
              },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('createUser(): Observable<User>');

    expect(content).toContain(
      '.post<User>(`${this.basePathApi}/v1/users`, null, {})',
    );
  });

  it('generates an Angular method with a 204 response', (): void => {
    const paths: SwaggerPaths = {
      '/v1/users/{id}': {
        delete: {
          operationId: 'deleteUser',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            '204': {
              description: 'No content',
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('deleteUser(id: number): Observable<void>');

    expect(content).toContain(
      '.delete<void>(`${this.basePathApi}/v1/users/${id}`, {})',
    );
  });

  it('generates binary options for a 201 PDF response', (): void => {
    const paths: SwaggerPaths = {
      '/v1/report': {
        get: {
          operationId: 'getReport',
          responses: {
            '201': {
              content: {
                'application/pdf': {},
              },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('getReport(): Observable<ArrayBuffer>');

    expect(content).toContain("responseType: 'arraybuffer' as const");

    expect(content).toContain('.get(`${this.basePathApi}/v1/report`, options)');
  });
});
