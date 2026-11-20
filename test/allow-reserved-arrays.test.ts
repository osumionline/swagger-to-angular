import '@angular/compiler';

import { HttpParams } from '@angular/common/http';
import vm from 'node:vm';
import type { Observable } from 'rxjs';
import { catchError, of } from 'rxjs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import generateMethods from '../src/generator/methods.js';

import type { SwaggerParameter, SwaggerPaths } from '../src/generator/types.js';

/**
 * Request captured by the simulated HTTP client.
 */
interface CapturedRequest {
  url: string;
  params: HttpParams;
}

/**
 * Runtime representation of the generated service.
 */
interface RuntimeService {
  search(...args: unknown[]): unknown;
}

/**
 * Generates and executes an HTTP GET method with the
 * supplied OpenAPI query parameters.
 *
 * Uses Angular HttpParams without performing a network
 * request.
 *
 * @param parameters OpenAPI query parameter definitions.
 * @param args Values supplied to the generated method.
 * @returns Captured URL and HTTP parameters.
 */
function executeGeneratedRequest(
  parameters: SwaggerParameter[],
  args: unknown[],
): CapturedRequest {
  const paths: SwaggerPaths = {
    '/v1/search': {
      get: {
        operationId: 'search',
        parameters,
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

  const methods: string = generateMethods(paths, 'basePathApi');

  const state: {
    request?: CapturedRequest;
  } = {};

  const mockedHttp = {
    /**
     * Captures a generated GET request.
     *
     * @param url Requested URL.
     * @param options Generated HTTP options.
     * @returns Simulated HTTP response.
     */
    get(url: string, options: { params?: HttpParams }): Observable<unknown> {
      state.request = {
        url,
        params: options.params ?? new HttpParams(),
      };

      return of(null);
    },
  };

  const source: string = `
class GeneratedService {
  http = mockedHttp;
  basePathApi = 'https://example.com/api';

  private handleError(error: unknown): never {
    throw error;
  }

${methods}
}

GeneratedService;
`;

  const compiled: string = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText;

  const ServiceConstructor = vm.runInNewContext(compiled, {
    mockedHttp,
    HttpParams,
    catchError,
  }) as new () => RuntimeService;

  const service: RuntimeService = new ServiceConstructor();

  service.search(...args);

  if (state.request === undefined) {
    throw new Error('The generated method did not perform an HTTP request.');
  }

  return state.request;
}

describe('OpenAPI allowReserved array serialization', (): void => {
  it('uses repeated query keys by default', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'tags',
          in: 'query',
          allowReserved: true,
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      ],
      [['a/b?c=d', 'x&y+z#q']],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/search?' + 'tags=a/b?c=d&tags=x%26y%2Bz%23q',
    );

    expect(new URL(request.url).searchParams.getAll('tags')).toEqual([
      'a/b?c=d',
      'x&y+z#q',
    ]);

    expect(request.params.toString()).toBe('');
  });

  it('supports explicit explode true', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'ids',
          in: 'query',
          style: 'form',
          explode: true,
          allowReserved: true,
          schema: {
            type: 'array',
            items: { type: 'integer' },
          },
        },
      ],
      [[10, 20, 30]],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/search?' + 'ids=10&ids=20&ids=30',
    );
  });

  it('separates non-exploded values with structural commas', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'tags',
          in: 'query',
          style: 'form',
          explode: false,
          allowReserved: true,
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      ],
      [['Bilbao, Bizkaia', 'Madrid']],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/search?' + 'tags=Bilbao%2C%20Bizkaia,Madrid',
    );

    expect(request.params.toString()).toBe('');
  });

  it('encodes delimiters inside non-exploded elements', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'tags',
          in: 'query',
          explode: false,
          allowReserved: true,
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      ],
      [['a,b&c', 'd+e#f']],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/search?' + 'tags=a%2Cb%26c,d%2Be%23f',
    );
  });

  it('preserves valid percent triples in array elements', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'tags',
          in: 'query',
          allowReserved: true,
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      ],
      [['folder%2Ffile', 'invalid%ZZ']],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/search?' +
        'tags=folder%2Ffile&tags=invalid%25ZZ',
    );
  });

  it('combines reserved arrays with ordinary query parameters', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'tags',
          in: 'query',
          explode: false,
          allowReserved: true,
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        {
          name: 'page',
          in: 'query',
          schema: { type: 'integer' },
        },
      ],
      [['x,y', 'z&k'], 2],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/search?' + 'tags=x%2Cy,z%26k',
    );

    expect(request.params.get('page')).toBe('2');
    expect(request.params.toString()).toBe('page=2');
  });

  it('omits null optional arrays', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'tags',
          in: 'query',
          allowReserved: true,
          schema: {
            type: 'array',
            nullable: true,
            items: { type: 'string' },
          },
        },
      ],
      [null],
    );

    expect(request.url).toBe('https://example.com/api/v1/search');

    expect(request.params.toString()).toBe('');
  });

  it('omits empty exploded arrays', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'tags',
          in: 'query',
          allowReserved: true,
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      ],
      [[]],
    );

    expect(request.url).toBe('https://example.com/api/v1/search');
  });

  it('encodes special query parameter names', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'filter tags',
          in: 'query',
          allowReserved: true,
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      ],
      [['a/b']],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/search?' + 'filter%20tags=a/b',
    );
  });

  it('rejects arrays containing objects', (): void => {
    const paths: SwaggerPaths = {
      '/v1/search': {
        get: {
          operationId: 'search',
          parameters: [
            {
              name: 'tags',
              in: 'query',
              allowReserved: true,
              schema: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'integer' },
                  },
                },
              },
            },
          ],
        },
      },
    };

    expect((): string => {
      return generateMethods(paths, 'basePathApi');
    }).toThrow(/allowReserved arrays require scalar item schemas/);
  });

  it('rejects arrays containing unresolved references', (): void => {
    const paths: SwaggerPaths = {
      '/v1/search': {
        get: {
          operationId: 'search',
          parameters: [
            {
              name: 'tags',
              in: 'query',
              allowReserved: true,
              schema: {
                type: 'array',
                items: {
                  $ref: '#/components/schemas/Tag',
                },
              },
            },
          ],
        },
      },
    };

    expect((): string => {
      return generateMethods(paths, 'basePathApi');
    }).toThrow(/allowReserved arrays require scalar item schemas/);
  });
});
