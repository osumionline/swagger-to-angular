import { describe, expect, it } from 'vitest';

import generateMethods from '../src/generator/methods.js';
import getRequestBodyInfo from '../src/generator/request-body-info.js';

import type {
  SwaggerPaths,
  SwaggerRequestBody,
  SwaggerRequestBodyOrReference,
} from '../src/generator/types.js';

/**
 * Generates one POST operation with a configurable body.
 *
 * @param requestBody Inline request body.
 * @param operationId Operation name.
 * @returns Generated Angular service method.
 */
function generatePost(
  requestBody: SwaggerRequestBody,
  operationId: string = 'sendData',
): string {
  const paths: SwaggerPaths = {
    '/v1/data': {
      post: {
        operationId,
        requestBody,
      },
    },
  };

  return generateMethods(paths, 'basePathApi');
}

describe('OpenAPI request body media types', (): void => {
  it('returns undefined when the operation has no body', (): void => {
    expect(getRequestBodyInfo(undefined, 'ping')).toBeUndefined();
  });

  it('preserves the existing single application/json output', (): void => {
    const content: string = generatePost({
      required: true,
      content: {
        'application/json': {
          schema: { type: 'integer' },
        },
      },
    });

    expect(content).toContain('sendData(payload: number): Observable<any>');

    expect(content).toContain(
      '.post<any>(`${this.basePathApi}/v1/data`, payload, {})',
    );

    expect(content).not.toContain("headers['Content-Type']");
  });

  it('supports vendor-specific JSON and sets Content-Type', (): void => {
    const content: string = generatePost({
      required: true,
      content: {
        'application/vnd.api+json': {
          schema: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
            },
          },
        },
      },
    });

    expect(content).toContain(
      'sendData(payload: { name: string; }): Observable<any>',
    );

    expect(content).toContain(
      'headers[\'Content-Type\'] = "application/vnd.api+json";',
    );

    expect(content).toMatch(/const options = \{\s*headers\s*\};/);

    expect(content).toContain(
      '.post<any>(`${this.basePathApi}/v1/data`, payload, options)',
    );
  });

  it('supports application/merge-patch+json', (): void => {
    const result = getRequestBodyInfo(
      {
        content: {
          'application/merge-patch+json': {
            schema: { type: 'boolean' },
          },
        },
      },
      'modifyData',
    );

    expect(result).toEqual({
      payloadType: 'boolean',
      contentType: 'application/merge-patch+json',
    });
  });

  it('generates text/plain POST bodies', (): void => {
    const content: string = generatePost({
      required: true,
      content: {
        'text/plain': {
          schema: { type: 'string' },
        },
      },
    });

    expect(content).toContain('sendData(payload: string): Observable<any>');

    expect(content).toContain('headers[\'Content-Type\'] = "text/plain";');

    expect(content).toContain(
      '.post<any>(`${this.basePathApi}/v1/data`, payload, options)',
    );
  });

  it('uses string for text/plain without a schema', (): void => {
    expect(
      getRequestBodyInfo({ content: { 'text/plain': {} } }, 'sendText'),
    ).toEqual({
      payloadType: 'string',
      contentType: 'text/plain',
    });
  });

  it('uses unknown for JSON without a schema', (): void => {
    const content: string = generatePost({
      required: true,
      content: {
        'application/json': {},
      },
    });

    expect(content).toContain('sendData(payload: unknown): Observable<any>');

    expect(content).toContain(
      '.post<any>(`${this.basePathApi}/v1/data`, JSON.stringify(payload), options)',
    );

    expect(content).toContain(
      'headers[\'Content-Type\'] = "application/json";',
    );
  });

  it('prefers application/json over other content types', (): void => {
    const content: string = generatePost({
      required: true,
      content: {
        'text/plain': {},
        'application/vnd.api+json': {
          schema: { type: 'integer' },
        },
        'application/json': {
          schema: { type: 'boolean' },
        },
      },
    });

    expect(content).toContain('sendData(payload: boolean): Observable<any>');

    expect(content).toContain(
      'headers[\'Content-Type\'] = "application/json";',
    );

    expect(content).not.toContain('headers[\'Content-Type\'] = "text/plain";');
  });

  it('prefers vendor JSON over text/plain', (): void => {
    const result = getRequestBodyInfo(
      {
        content: {
          'text/plain': {},
          'application/problem+json': {
            schema: { type: 'integer' },
          },
        },
      },
      'sendProblem',
    );

    expect(result).toEqual({
      payloadType: 'number',
      contentType: 'application/problem+json',
    });
  });

  it('selects text/plain when other formats are unsupported', (): void => {
    const result = getRequestBodyInfo(
      {
        content: {
          'application/xml': {},
          'text/plain': {},
        },
      },
      'sendText',
    );

    expect(result).toEqual({
      payloadType: 'string',
      contentType: 'text/plain',
    });
  });

  it('combines request Content-Type with response Accept', (): void => {
    const paths: SwaggerPaths = {
      '/v1/update': {
        patch: {
          operationId: 'updateData',
          parameters: [
            {
              name: 'X-Trace',
              in: 'header',
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/merge-patch+json': {
                schema: { type: 'boolean' },
              },
            },
          },
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

    expect(content).toContain(
      'updateData(payload: boolean, OpenApiSchema_X_2d_Trace?: string)',
    );

    expect(content).toContain("headers['X-Trace']");
    expect(content).toContain(
      'headers[\'Content-Type\'] = "application/merge-patch+json";',
    );
    expect(content).toContain('headers[\'Accept\'] = "application/json";');

    expect(content).toContain(
      '.patch<boolean>(`${this.basePathApi}/v1/update`, payload, options)',
    );
  });

  it('supports reusable request bodies with text/plain', (): void => {
    const paths: SwaggerPaths = {
      '/v1/message': {
        post: {
          operationId: 'sendMessage',
          requestBody: {
            $ref: '#/components/requestBodies/Message',
          },
        },
      },
    };

    const definitions: Record<string, SwaggerRequestBodyOrReference> = {
      Message: {
        required: true,
        content: {
          'text/plain': {
            schema: { type: 'string' },
          },
        },
      },
    };

    const content: string = generateMethods(
      paths,
      'basePathApi',
      {},
      {},
      {},
      {},
      definitions,
    );

    expect(content).toContain('sendMessage(payload: string): Observable<any>');

    expect(content).toContain('headers[\'Content-Type\'] = "text/plain";');
  });

  it('preserves DELETE bodies and request options', (): void => {
    const paths: SwaggerPaths = {
      '/v1/data': {
        delete: {
          operationId: 'removeData',
          parameters: [
            {
              name: 'force',
              in: 'query',
              schema: { type: 'boolean' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'text/plain': {
                schema: { type: 'string' },
              },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('removeData(payload: string, force?: boolean)');
    expect(content).toContain("params = params.set('force', String(force));");
    expect(content).toContain('headers[\'Content-Type\'] = "text/plain";');
    expect(content).toContain(
      '.delete<any>(`${this.basePathApi}/v1/data`, { body: payload, ...options })',
    );
  });

  it('rejects unsupported body media types', (): void => {
    expect((): void => {
      generatePost({
        content: {
          'multipart/form-data': {},
          'application/xml': {},
        },
      });
    }).toThrow('Unsupported request body media types for "sendData"');
  });

  it('rejects request bodies without content', (): void => {
    expect((): void => {
      generatePost({ required: true });
    }).toThrow('Unsupported request body media types for "sendData": (none)');
  });

  it('rejects incompatible text/plain schemas', (): void => {
    expect((): void => {
      generatePost({
        content: {
          'text/plain': {
            schema: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
              },
            },
          },
        },
      });
    }).toThrow('Unsupported text/plain request body schema');
  });

  it.each(['get', 'head', 'options'] as const)(
    'rejects a request body in HTTP %s',
    (method): void => {
      const paths: SwaggerPaths = {
        '/v1/data': {
          [method]: {
            operationId: `sendVia${method.toUpperCase()}`,
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'string' },
                },
              },
            },
          },
        },
      };

      expect((): string => {
        return generateMethods(paths, 'basePathApi');
      }).toThrow(`Unsupported request body for HTTP ${method.toUpperCase()}`);
    },
  );
});
