import { describe, expect, it } from 'vitest';

import generateMethods from '../src/generator/methods.js';
import getRequestBodyInfo from '../src/generator/request-body-info.js';

import type {
  SwaggerPaths,
  SwaggerRequestBody,
} from '../src/generator/types.js';

/**
 * Generates a POST method with the specified request body.
 *
 * @param requestBody Request body definition.
 * @returns Generated Angular method source.
 */
function generatePost(requestBody: SwaggerRequestBody): string {
  const paths: SwaggerPaths = {
    '/v1/data': {
      post: {
        operationId: 'sendData',
        requestBody,
      },
    },
  };

  return generateMethods(paths, 'basePathApi');
}

describe('JSON primitive request body serialization', (): void => {
  it('selects explicit serialization for JSON strings', (): void => {
    const result = getRequestBodyInfo(
      {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'string' },
          },
        },
      },
      'sendData',
    );

    expect(result).toEqual({
      payloadType: 'string',
      contentType: 'application/json',
      serializeAsJson: true,
    });
  });

  it('generates JSON.stringify for a required string body', (): void => {
    const content: string = generatePost({
      required: true,
      content: {
        'application/json': {
          schema: { type: 'string' },
        },
      },
    });

    expect(content).toContain('sendData(payload: string): Observable<any>');

    expect(content).toContain(
      'headers[\'Content-Type\'] = "application/json";',
    );

    expect(content).toContain(
      '.post<any>(`${this.basePathApi}/v1/data`, JSON.stringify(payload), options)',
    );
  });

  it('preserves optional JSON string arguments', (): void => {
    const content: string = generatePost({
      content: {
        'application/json': {
          schema: { type: 'string' },
        },
      },
    });

    expect(content).toContain('sendData(payload?: string): Observable<any>');

    expect(content).toContain('JSON.stringify(payload)');

    expect(JSON.stringify(undefined)).toBeUndefined();
  });

  it('serializes nullable JSON strings', (): void => {
    const result = getRequestBodyInfo(
      {
        content: {
          'application/json': {
            schema: {
              type: 'string',
              nullable: true,
            },
          },
        },
      },
      'sendNullable',
    );

    expect(result).toEqual({
      payloadType: 'string | null',
      contentType: 'application/json',
      serializeAsJson: true,
    });

    expect(JSON.stringify(null)).toBe('null');
  });

  it('serializes JSON string enums', (): void => {
    const content: string = generatePost({
      required: true,
      content: {
        'application/json': {
          schema: {
            enum: ['draft', 'published'],
          },
        },
      },
    });

    expect(content).toContain(
      'sendData(payload: "draft" | "published"): Observable<any>',
    );

    expect(content).toContain('JSON.stringify(payload)');
  });

  it('serializes vendor-specific JSON strings', (): void => {
    const content: string = generatePost({
      required: true,
      content: {
        'application/vnd.api+json': {
          schema: { type: 'string' },
        },
      },
    });

    expect(content).toContain(
      'headers[\'Content-Type\'] = "application/vnd.api+json";',
    );

    expect(content).toContain(
      '.post<any>(`${this.basePathApi}/v1/data`, JSON.stringify(payload), options)',
    );
  });

  it('serializes an untyped JSON body', (): void => {
    const content: string = generatePost({
      required: true,
      content: {
        'application/json': {},
      },
    });

    expect(content).toContain('sendData(payload: unknown): Observable<any>');

    expect(content).toContain(
      'headers[\'Content-Type\'] = "application/json";',
    );

    expect(content).toContain(
      '.post<any>(`${this.basePathApi}/v1/data`, JSON.stringify(payload), options)',
    );
  });

  it('serializes a referenced JSON schema', (): void => {
    const paths: SwaggerPaths = {
      '/v1/message': {
        post: {
          operationId: 'sendMessage',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Message',
                },
              },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi', {
      Message: { type: 'string' },
    });

    expect(content).toContain('sendMessage(payload: Message): Observable<any>');

    expect(content).toContain(
      'headers[\'Content-Type\'] = "application/json";',
    );

    expect(content).toContain(
      '.post<any>(`${this.basePathApi}/v1/message`, JSON.stringify(payload), options)',
    );
  });

  it('does not manually serialize a typed JSON object', (): void => {
    const content: string = generatePost({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
            },
          },
        },
      },
    });

    expect(content).toContain(
      '.post<any>(`${this.basePathApi}/v1/data`, payload, {})',
    );

    expect(content).not.toContain('JSON.stringify(payload)');
    expect(content).not.toContain("headers['Content-Type']");
  });

  it('does not manually serialize a typed JSON number', (): void => {
    const content: string = generatePost({
      required: true,
      content: {
        'application/json': {
          schema: { type: 'integer' },
        },
      },
    });

    expect(content).toContain(
      '.post<any>(`${this.basePathApi}/v1/data`, payload, {})',
    );
  });

  it('preserves text/plain request bodies', (): void => {
    const content: string = generatePost({
      required: true,
      content: {
        'text/plain': {
          schema: { type: 'string' },
        },
      },
    });

    expect(content).toContain('headers[\'Content-Type\'] = "text/plain";');

    expect(content).toContain(
      '.post<any>(`${this.basePathApi}/v1/data`, payload, options)',
    );

    expect(content).not.toContain('JSON.stringify(payload)');
  });

  it('preserves binary request bodies', (): void => {
    const content: string = generatePost({
      required: true,
      content: {
        'application/octet-stream': {
          schema: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    });

    expect(content).toContain('sendData(payload: Blob): Observable<any>');

    expect(content).toContain(
      '.post<any>(`${this.basePathApi}/v1/data`, payload, options)',
    );

    expect(content).not.toContain('JSON.stringify(payload)');
  });

  it('serializes JSON strings in DELETE request options', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        delete: {
          operationId: 'deleteItem',
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
              'application/json': {
                schema: { type: 'string' },
              },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('deleteItem(payload: string, force?: boolean)');

    expect(content).toContain(
      'headers[\'Content-Type\'] = "application/json";',
    );

    expect(content).toContain(
      '.delete<any>(`${this.basePathApi}/v1/items`, { body: JSON.stringify(payload), ...options })',
    );
  });
});
