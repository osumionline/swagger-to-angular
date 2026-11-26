import { describe, expect, it } from 'vitest';

import generateMethods from '../src/generator/methods.js';
import getResponseInfo from '../src/generator/response-info.js';

import type {
  SwaggerOperation,
  SwaggerPaths,
  SwaggerResponseOrReference,
} from '../src/generator/types.js';

describe('OpenAPI response media types', (): void => {
  it('supports application/vnd.api+json', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '200': {
          content: {
            'application/vnd.api+json': {
              schema: {
                type: 'array',
                items: { type: 'integer' },
              },
            },
          },
        },
      },
    };

    expect(getResponseInfo(operation)).toEqual({
      returnType: 'number[]',
      isBinary: false,
    });
  });

  it('supports application/problem+json', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '400': { description: 'Error' },
        '200': {
          content: {
            'application/problem+json': {
              schema: { type: 'boolean' },
            },
          },
        },
      },
    };

    expect(getResponseInfo(operation).returnType).toBe('boolean');
  });

  it('uses text response metadata for text/plain', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '200': {
          content: {
            'text/plain': {
              schema: { type: 'string' },
            },
          },
        },
      },
    };

    expect(getResponseInfo(operation)).toEqual({
      returnType: 'string',
      isBinary: false,
      isText: true,
    });
  });

  it('prefers JSON over PDF regardless of declaration order', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '200': {
          content: {
            'application/pdf': {},
            'application/json': {
              schema: { type: 'boolean' },
            },
          },
        },
      },
    };

    expect(getResponseInfo(operation)).toEqual({
      returnType: 'boolean',
      isBinary: false,
      accept: 'application/json',
    });
  });

  it('prefers application/json over vendor JSON', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '200': {
          content: {
            'application/vnd.api+json': {
              schema: { type: 'integer' },
            },
            'application/json': {
              schema: { type: 'string' },
            },
          },
        },
      },
    };

    expect(getResponseInfo(operation)).toEqual({
      returnType: 'string',
      isBinary: false,
      accept: 'application/json',
    });
  });

  it('prefers vendor JSON over text/plain', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '200': {
          content: {
            'text/plain': {},
            'application/vnd.api+json': {
              schema: { type: 'boolean' },
            },
          },
        },
      },
    };

    expect(getResponseInfo(operation)).toEqual({
      returnType: 'boolean',
      isBinary: false,
      accept: 'application/vnd.api+json',
    });
  });

  it('selects a supported format when others are unsupported', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '200': {
          content: {
            'application/xml': {},
            'text/plain': {},
          },
        },
      },
    };

    expect(getResponseInfo(operation)).toEqual({
      returnType: 'string',
      isBinary: false,
      isText: true,
      accept: 'text/plain',
    });
  });

  it('rejects responses with only unsupported media types', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '200': {
          content: {
            'application/xml': {},
          },
        },
      },
    };

    expect((): void => {
      getResponseInfo(operation);
    }).toThrow('Unsupported response media types: application/xml');
  });

  it('preserves void responses without content', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '200': {
          description: 'No response body',
        },
      },
    };

    expect(getResponseInfo(operation)).toEqual({
      returnType: 'void',
      isBinary: false,
    });
  });

  it('generates text response options for GET', (): void => {
    const paths: SwaggerPaths = {
      '/v1/message': {
        get: {
          operationId: 'getMessage',
          responses: {
            '200': {
              content: { 'text/plain': {} },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('getMessage(): Observable<string>');
    expect(content).toContain("responseType: 'text' as const");

    expect(content).toContain(
      '.get(`${this.basePathApi}/v1/message`, options)',
    );

    expect(content).not.toContain('.get<string>(');
  });

  it('generates text response options for POST with a body', (): void => {
    const paths: SwaggerPaths = {
      '/v1/message': {
        post: {
          operationId: 'postMessage',
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
              content: { 'text/plain': {} },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'postMessage(payload: string): Observable<string>',
    );

    expect(content).toContain("responseType: 'text' as const");

    expect(content).toContain(
      '.post(`${this.basePathApi}/v1/message`, JSON.stringify(payload), options)',
    );
  });

  it('preserves DELETE bodies with text responses', (): void => {
    const paths: SwaggerPaths = {
      '/v1/message': {
        delete: {
          operationId: 'removeMessage',
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
              content: { 'text/plain': {} },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'removeMessage(payload: string): Observable<string>',
    );

    expect(content).toContain("responseType: 'text' as const");

    expect(content).toContain(
      '.delete(`${this.basePathApi}/v1/message`, { body: JSON.stringify(payload), ...options })',
    );
  });

  it('combines Accept with existing HTTP header parameters', (): void => {
    const paths: SwaggerPaths = {
      '/v1/report': {
        get: {
          operationId: 'getReport',
          parameters: [
            {
              name: 'X-Trace',
              in: 'header',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              content: {
                'application/pdf': {},
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

    expect(content).toContain('Observable<boolean>');
    expect(content).toContain("headers['X-Trace']");
    expect(content).toContain('headers[\'Accept\'] = "application/json";');
    expect(content).toMatch(/const options = \{\s*headers\s*\};/);
    expect(content).toContain('.get<boolean>(');
    expect(content).not.toContain("responseType: 'arraybuffer'");
  });

  it('handles referenced responses with text media types', (): void => {
    const paths: SwaggerPaths = {
      '/v1/status': {
        get: {
          operationId: 'getStatus',
          responses: {
            '200': {
              $ref: '#/components/responses/Status',
            },
          },
        },
      },
    };

    const responseDefinitions: Record<string, SwaggerResponseOrReference> = {
      Status: {
        content: {
          'text/plain': {},
        },
      },
    };

    const content: string = generateMethods(
      paths,
      'basePathApi',
      {},
      {},
      {},
      responseDefinitions,
    );

    expect(content).toContain('getStatus(): Observable<string>');
    expect(content).toContain("responseType: 'text' as const");
  });

  it('preserves binary responses with a single media type', (): void => {
    const paths: SwaggerPaths = {
      '/v1/export': {
        get: {
          operationId: 'exportFile',
          responses: {
            '200': {
              content: {
                'application/octet-stream': {},
              },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('exportFile(): Observable<ArrayBuffer>');
    expect(content).toContain("responseType: 'arraybuffer' as const");
    expect(content).not.toContain("headers['Accept']");
  });
});
