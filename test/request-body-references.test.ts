import { describe, expect, it } from 'vitest';

import generateMethods from '../src/generator/methods.js';
import resolveRequestBodyReference from '../src/generator/request-body-reference-resolver.js';

import type {
  SwaggerPaths,
  SwaggerRequestBody,
  SwaggerRequestBodyOrReference,
} from '../src/generator/types.js';

/**
 * Generates service methods using reusable request bodies.
 *
 * @param paths OpenAPI paths to generate.
 * @param definitions Reusable request body definitions.
 * @returns Generated TypeScript service methods.
 */
function generateWithRequestBodies(
  paths: SwaggerPaths,
  definitions: Record<string, SwaggerRequestBodyOrReference>,
): string {
  return generateMethods(paths, 'basePathApi', {}, {}, {}, {}, definitions);
}

describe('OpenAPI components.requestBodies references', (): void => {
  it('returns inline request bodies unchanged', (): void => {
    const requestBody: SwaggerRequestBody = {
      required: true,
      content: {
        'application/json': {
          schema: { type: 'string' },
        },
      },
    };

    const result: SwaggerRequestBody = resolveRequestBodyReference(
      requestBody,
      {},
    );

    expect(result).toBe(requestBody);
  });

  it('generates a required POST payload from a reference', (): void => {
    const paths: SwaggerPaths = {
      '/v1/users': {
        post: {
          operationId: 'createUser',
          requestBody: {
            $ref: '#/components/requestBodies/CreateUser',
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

    const definitions: Record<string, SwaggerRequestBodyOrReference> = {
      CreateUser: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/UserInput',
            },
          },
        },
      },
    };

    const content: string = generateWithRequestBodies(paths, definitions);

    expect(content).toContain(
      'createUser(payload: UserInput): Observable<boolean>',
    );

    expect(content).toContain(
      '.post<boolean>(`${this.basePathApi}/v1/users`, JSON.stringify(payload), options)',
    );
  });

  it('generates an optional POST payload', (): void => {
    const paths: SwaggerPaths = {
      '/v1/search': {
        post: {
          operationId: 'searchUsers',
          requestBody: {
            $ref: '#/components/requestBodies/Search',
          },
        },
      },
    };

    const definitions: Record<string, SwaggerRequestBodyOrReference> = {
      Search: {
        required: false,
        content: {
          'application/json': {
            schema: { type: 'string' },
          },
        },
      },
    };

    const content: string = generateWithRequestBodies(paths, definitions);

    expect(content).toContain('searchUsers(payload?: string): Observable<any>');

    expect(content).toContain(
      '.post<any>(`${this.basePathApi}/v1/search`, JSON.stringify(payload), options)',
    );
  });

  it('resolves chained references with JSON Pointer escapes', (): void => {
    const definitions: Record<string, SwaggerRequestBodyOrReference> = {
      'Create/User~Body': {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'integer' },
          },
        },
      },
      Alias: {
        $ref: '#/components/requestBodies/Create~1User~0Body',
      },
      SecondAlias: {
        $ref: '#/components/requestBodies/Alias',
      },
    };

    const result: SwaggerRequestBody = resolveRequestBodyReference(
      { $ref: '#/components/requestBodies/SecondAlias' },
      definitions,
    );

    expect(result.required).toBe(true);
    expect(result.content?.['application/json']?.schema).toEqual({
      type: 'integer',
    });
  });

  it('decodes URI-encoded component names', (): void => {
    const definitions: Record<string, SwaggerRequestBodyOrReference> = {
      'Update User': {
        content: {
          'application/json': {
            schema: { type: 'boolean' },
          },
        },
      },
    };

    const result: SwaggerRequestBody = resolveRequestBodyReference(
      { $ref: '#/components/requestBodies/Update%20User' },
      definitions,
    );

    expect(result.content?.['application/json']?.schema).toEqual({
      type: 'boolean',
    });
  });

  it('generates PUT and PATCH payloads from references', (): void => {
    const paths: SwaggerPaths = {
      '/v1/settings': {
        put: {
          operationId: 'replaceSettings',
          requestBody: {
            $ref: '#/components/requestBodies/Settings',
          },
        },
        patch: {
          operationId: 'modifySettings',
          requestBody: {
            $ref: '#/components/requestBodies/Settings',
          },
        },
      },
    };

    const definitions: Record<string, SwaggerRequestBodyOrReference> = {
      Settings: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'boolean' },
          },
        },
      },
    };

    const content: string = generateWithRequestBodies(paths, definitions);

    expect(content).toContain(
      'replaceSettings(payload: boolean): Observable<any>',
    );

    expect(content).toContain(
      '.put<any>(`${this.basePathApi}/v1/settings`, payload, {})',
    );

    expect(content).toContain(
      'modifySettings(payload: boolean): Observable<any>',
    );

    expect(content).toContain(
      '.patch<any>(`${this.basePathApi}/v1/settings`, payload, {})',
    );
  });

  it('preserves DELETE payloads and query options', (): void => {
    const paths: SwaggerPaths = {
      '/v1/users/{id}': {
        delete: {
          operationId: 'cancelUser',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
            {
              name: 'force',
              in: 'query',
              schema: { type: 'boolean' },
            },
          ],
          requestBody: {
            $ref: '#/components/requestBodies/Cancel',
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

    const definitions: Record<string, SwaggerRequestBodyOrReference> = {
      Cancel: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'string' },
          },
        },
      },
    };

    const content: string = generateWithRequestBodies(paths, definitions);

    expect(content).toContain(
      'cancelUser(id: number, payload: string, force?: boolean)',
    );

    expect(content).toContain("params = params.set('force', String(force));");

    expect(content).toContain(
      '.delete<boolean>(`${this.basePathApi}/v1/users/${encodeURIComponent(String(id))}`, { body: JSON.stringify(payload), ...options })',
    );
  });

  it('preserves operations without a request body', (): void => {
    const paths: SwaggerPaths = {
      '/v1/ping': {
        post: {
          operationId: 'ping',
        },
      },
    };

    const content: string = generateWithRequestBodies(paths, {});

    expect(content).toContain('ping(): Observable<any>');
    expect(content).toContain(
      '.post<any>(`${this.basePathApi}/v1/ping`, null, {})',
    );
  });

  it('does not mutate referenced definitions', (): void => {
    const definition: SwaggerRequestBody = {
      required: true,
      content: {
        'application/json': {
          schema: { type: 'string' },
        },
      },
    };

    const definitions: Record<string, SwaggerRequestBodyOrReference> = {
      Shared: definition,
    };

    const reference: SwaggerRequestBodyOrReference = {
      $ref: '#/components/requestBodies/Shared',
    };

    const result: SwaggerRequestBody = resolveRequestBodyReference(
      reference,
      definitions,
    );

    expect(result).toBe(definition);
    expect(reference).toEqual({
      $ref: '#/components/requestBodies/Shared',
    });
  });

  it('rejects unresolved references', (): void => {
    expect((): SwaggerRequestBody => {
      return resolveRequestBodyReference(
        { $ref: '#/components/requestBodies/Missing' },
        {},
      );
    }).toThrow('Unresolved request body reference');
  });

  it.each([
    'https://example.com/api.json#/components/requestBodies/Create',
    '#/components/schemas/Create',
  ])('rejects unsupported references: %s', (ref: string): void => {
    expect((): SwaggerRequestBody => {
      return resolveRequestBodyReference({ $ref: ref }, {});
    }).toThrow('Unsupported request body reference');
  });

  it.each([
    '#/components/requestBodies/',
    '#/components/requestBodies/Create/content',
    '#/components/requestBodies/Bad~2Pointer',
    '#/components/requestBodies/Bad%XX',
  ])('rejects invalid references: %s', (ref: string): void => {
    expect((): SwaggerRequestBody => {
      return resolveRequestBodyReference({ $ref: ref }, {});
    }).toThrow('Invalid request body reference');
  });

  it('detects circular reference chains', (): void => {
    const definitions: Record<string, SwaggerRequestBodyOrReference> = {
      First: {
        $ref: '#/components/requestBodies/Second',
      },
      Second: {
        $ref: '#/components/requestBodies/First',
      },
    };

    expect((): SwaggerRequestBody => {
      return resolveRequestBodyReference(
        { $ref: '#/components/requestBodies/First' },
        definitions,
      );
    }).toThrow('Circular request body reference');
  });

  it('rejects invalid referenced definitions', (): void => {
    const definitions: Record<string, SwaggerRequestBodyOrReference> = {
      Invalid: null as unknown as SwaggerRequestBody,
    };

    expect((): SwaggerRequestBody => {
      return resolveRequestBodyReference(
        { $ref: '#/components/requestBodies/Invalid' },
        definitions,
      );
    }).toThrow('Invalid request body definition');
  });

  it('ignores siblings on a Reference Object', (): void => {
    const definitions: Record<string, SwaggerRequestBodyOrReference> = {
      Original: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'string' },
          },
        },
      },
    };

    const result: SwaggerRequestBody = resolveRequestBodyReference(
      {
        $ref: '#/components/requestBodies/Original',
        description: 'A local description',
      },
      definitions,
    );

    expect(result.required).toBe(true);
    expect(result.content?.['application/json']?.schema).toEqual({
      type: 'string',
    });
  });
});
