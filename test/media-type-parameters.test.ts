import { describe, expect, it } from 'vitest';

import selectMediaType from '../src/generator/media-type.js';
import generateMethods from '../src/generator/methods.js';
import getRequestBodyInfo from '../src/generator/request-body-info.js';
import getResponseInfo from '../src/generator/response-info.js';

import type { SwaggerOperation, SwaggerPaths } from '../src/generator/types.js';

describe('OpenAPI media types with parameters', (): void => {
  it('recognizes application/json with a version parameter', (): void => {
    expect(selectMediaType(['application/json; v=1.0'], 'response')).toEqual({
      name: 'application/json; v=1.0',
      kind: 'json',
    });
  });

  it('recognizes application/json with charset', (): void => {
    expect(
      selectMediaType(['application/json; charset=utf-8'], 'request'),
    ).toEqual({
      name: 'application/json; charset=utf-8',
      kind: 'json',
    });
  });

  it('recognizes vendor JSON with media type parameters', (): void => {
    expect(
      selectMediaType(
        ['application/merge-patch+json; charset=utf-8'],
        'request',
      ),
    ).toEqual({
      name: 'application/merge-patch+json; charset=utf-8',
      kind: 'json',
    });
  });

  it('recognizes text/json as JSON', (): void => {
    expect(selectMediaType(['text/json; v=1.0'], 'response')).toEqual({
      name: 'text/json; v=1.0',
      kind: 'json',
    });
  });

  it('recognizes parameterized text/plain', (): void => {
    expect(selectMediaType(['text/plain; charset=utf-8'], 'response')).toEqual({
      name: 'text/plain; charset=utf-8',
      kind: 'text',
    });
  });

  it('recognizes parameterized binary types', (): void => {
    expect(
      selectMediaType(['application/octet-stream; v=1.0'], 'request'),
    ).toEqual({
      name: 'application/octet-stream; v=1.0',
      kind: 'binary',
    });

    expect(selectMediaType(['application/pdf; v=1.0'], 'response')).toEqual({
      name: 'application/pdf; v=1.0',
      kind: 'binary',
    });
  });

  it('does not allow application/pdf as a request body', (): void => {
    expect(selectMediaType(['application/pdf'], 'request')).toBeUndefined();
  });

  it('does not select wildcard JSON subtypes', (): void => {
    expect(
      selectMediaType(['application/*+json; v=1.0'], 'request'),
    ).toBeUndefined();
  });

  it('prefers versioned application/json over other formats', (): void => {
    expect(
      selectMediaType(
        ['text/plain; v=1.0', 'text/json; v=1.0', 'application/json; v=1.0'],
        'response',
      ),
    ).toEqual({
      name: 'application/json; v=1.0',
      kind: 'json',
    });
  });

  it('resolves the response type from versioned JSON', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '200': {
          content: {
            'text/plain; v=1.0': {
              schema: { type: 'string' },
            },
            'application/json; v=1.0': {
              schema: {
                type: 'array',
                items: {
                  $ref: '#/components/schemas/Activity',
                },
              },
            },
            'text/json; v=1.0': {
              schema: { type: 'string' },
            },
          },
        },
      },
    };

    expect(getResponseInfo(operation)).toEqual({
      returnType: 'Activity[]',
      isBinary: false,
      accept: 'application/json; v=1.0',
    });
  });

  it('uses text responseType for parameterized text/plain', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '200': {
          content: {
            'text/plain; charset=utf-8': {},
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

  it('preserves the request Content-Type parameters', (): void => {
    const result = getRequestBodyInfo(
      {
        required: true,
        content: {
          'application/json; v=1.0': {
            schema: {
              $ref: '#/components/schemas/Activity',
            },
          },
          'text/json; v=1.0': {
            schema: {
              $ref: '#/components/schemas/Activity',
            },
          },
          'application/*+json; v=1.0': {
            schema: {
              $ref: '#/components/schemas/Activity',
            },
          },
        },
      },
      'createActivity',
    );

    expect(result).toEqual({
      payloadType: 'Activity',
      contentType: 'application/json; v=1.0',
      serializeAsJson: true,
    });
  });

  it('supports a binary request body with parameters', (): void => {
    const result = getRequestBodyInfo(
      {
        content: {
          'application/octet-stream; v=1.0': {
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
      contentType: 'application/octet-stream; v=1.0',
    });
  });

  it('generates complete ASP.NET-style requests', (): void => {
    const paths: SwaggerPaths = {
      '/api/v1/Activities': {
        get: {
          operationId: 'listActivities',
          responses: {
            '200': {
              content: {
                'text/plain; v=1.0': {
                  schema: { type: 'string' },
                },
                'application/json; v=1.0': {
                  schema: {
                    type: 'array',
                    items: {
                      $ref: '#/components/schemas/Activity',
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          operationId: 'createActivity',
          requestBody: {
            required: true,
            content: {
              'application/json; v=1.0': {
                schema: {
                  $ref: '#/components/schemas/Activity',
                },
              },
              'application/*+json; v=1.0': {
                schema: {
                  $ref: '#/components/schemas/Activity',
                },
              },
            },
          },
          responses: {
            '200': {
              content: {
                'application/json; v=1.0': {
                  schema: {
                    $ref: '#/components/schemas/Activity',
                  },
                },
              },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('listActivities(): Observable<Activity[]>');

    expect(content).toContain(
      '.get<Activity[]>(`${this.basePathApi}/api/v1/Activities`, options)',
    );

    expect(content).toContain(
      'createActivity(payload: Activity): Observable<Activity>',
    );

    expect(content).toContain(
      'headers[\'Content-Type\'] = "application/json; v=1.0";',
    );

    expect(content).toContain(
      'headers[\'Accept\'] = "application/json; v=1.0";',
    );

    expect(content).toContain(
      '.post<Activity>(`${this.basePathApi}/api/v1/Activities`, JSON.stringify(payload), options)',
    );
  });
});
