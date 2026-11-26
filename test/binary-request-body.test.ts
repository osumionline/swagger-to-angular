import { describe, expect, it } from 'vitest';

import generateMethods from '../src/generator/methods.js';
import getRequestBodyInfo from '../src/generator/request-body-info.js';

import type {
  SwaggerPaths,
  SwaggerRequestBodyOrReference,
} from '../src/generator/types.js';

describe('Binary request bodies', (): void => {
  it('supports an octet-stream body with binary format', (): void => {
    const result = getRequestBodyInfo(
      {
        required: true,
        content: {
          'application/octet-stream': {
            schema: {
              type: 'string',
              format: 'binary',
            },
          },
        },
      },
      'uploadFile',
    );

    expect(result).toEqual({
      payloadType: 'Blob',
      contentType: 'application/octet-stream',
    });
  });

  it('supports an octet-stream body without a schema', (): void => {
    expect(
      getRequestBodyInfo(
        {
          content: {
            'application/octet-stream': {},
          },
        },
        'uploadFile',
      ),
    ).toEqual({
      payloadType: 'Blob',
      contentType: 'application/octet-stream',
    });
  });

  it('generates the Petstore upload operation', (): void => {
    const paths: SwaggerPaths = {
      '/pet/{petId}/uploadImage': {
        post: {
          operationId: 'uploadFile',
          parameters: [
            {
              name: 'petId',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
            {
              name: 'additionalMetadata',
              in: 'query',
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            content: {
              'application/octet-stream': {
                schema: {
                  type: 'string',
                  format: 'binary',
                },
              },
            },
          },
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ApiResponse',
                  },
                },
              },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'uploadFile(petId: number, additionalMetadata?: string, payload?: Blob): Observable<ApiResponse>',
    );

    expect(content).toContain(
      "params = params.set('additionalMetadata', String(additionalMetadata));",
    );

    expect(content).toContain(
      'headers[\'Content-Type\'] = "application/octet-stream";',
    );

    expect(content).toContain(
      '.post<ApiResponse>(`${this.basePathApi}/pet/${encodeURIComponent(String(petId))}/uploadImage`, payload, options)',
    );
  });

  it('supports referenced binary request bodies', (): void => {
    const paths: SwaggerPaths = {
      '/files': {
        put: {
          operationId: 'replaceFile',
          requestBody: {
            $ref: '#/components/requestBodies/BinaryFile',
          },
        },
      },
    };

    const definitions: Record<string, SwaggerRequestBodyOrReference> = {
      BinaryFile: {
        required: true,
        content: {
          'application/octet-stream': {
            schema: { type: 'string', format: 'binary' },
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

    expect(content).toContain('replaceFile(payload: Blob): Observable<any>');

    expect(content).toContain(
      '.put<any>(`${this.basePathApi}/files`, payload, options)',
    );
  });

  it('prefers JSON to an octet-stream alternative', (): void => {
    expect(
      getRequestBodyInfo(
        {
          content: {
            'application/octet-stream': {
              schema: { type: 'string', format: 'binary' },
            },
            'application/json': {
              schema: { type: 'boolean' },
            },
          },
        },
        'sendData',
      ),
    ).toEqual({
      payloadType: 'boolean',
      contentType: 'application/json',
    });
  });

  it.each([
    { type: 'object' },
    { type: 'string', format: 'byte' },
    { $ref: '#/components/schemas/File' },
  ])('rejects incompatible octet-stream schemas', (schema): void => {
    expect((): void => {
      getRequestBodyInfo(
        {
          content: {
            'application/octet-stream': { schema },
          },
        },
        'uploadFile',
      );
    }).toThrow('Unsupported application/octet-stream request body schema');
  });
});
