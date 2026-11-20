import '@angular/compiler';

import { HttpParams } from '@angular/common/http';
import vm from 'node:vm';
import type { Observable } from 'rxjs';
import { catchError, of } from 'rxjs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import generateMethods from '../src/generator/methods.js';
import generatePathParameterExpression from '../src/generator/path-serializer.js';

import type { SwaggerParameter, SwaggerPaths } from '../src/generator/types.js';

/**
 * HTTP request captured by the simulated client.
 */
interface CapturedRequest {
  url: string;
  params: HttpParams;
}

/**
 * Runtime shape of the generated test service.
 */
interface RuntimeService {
  search(...args: unknown[]): unknown;
}

/**
 * Generates and executes an OpenAPI GET operation.
 *
 * Captures the requested URL and Angular HttpParams
 * without performing a network request.
 *
 * @param rawPath OpenAPI path containing parameter markers.
 * @param parameters Operation parameter definitions.
 * @param args Values passed to the generated method.
 * @returns Captured HTTP request information.
 */
function executeGeneratedRequest(
  rawPath: string,
  parameters: SwaggerParameter[],
  args: unknown[],
): CapturedRequest {
  const paths: SwaggerPaths = {
    [rawPath]: {
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
     * Captures an HTTP GET request.
     *
     * @param url Requested URL.
     * @param options Generated HTTP request options.
     * @returns Simulated observable response.
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

describe('OpenAPI path parameter serialization', (): void => {
  it('encodes characters that could alter the URL structure', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/items/{id}',
      [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
      ],
      ['a/b?c=d#fragment'],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/items/' + 'a%2Fb%3Fc%3Dd%23fragment',
    );
  });

  it('encodes spaces and Unicode characters', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/cities/{name}',
      [
        {
          name: 'name',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
      ],
      ['Málaga & Bilbao'],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/cities/' + 'M%C3%A1laga%20%26%20Bilbao',
    );
  });

  it('preserves simple integer path values', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/items/{id}',
      [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'integer' },
        },
      ],
      [42],
    );

    expect(request.url).toBe('https://example.com/api/v1/items/42');
  });

  it('serializes arrays with structural commas', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/tags/{tags}',
      [
        {
          name: 'tags',
          in: 'path',
          required: true,
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      ],
      [['a,b', 'c/d']],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/tags/' + 'a%2Cb,c%2Fd',
    );
  });

  it('serializes non-exploded simple objects', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/search/{filter}',
      [
        {
          name: 'filter',
          in: 'path',
          required: true,
          style: 'simple',
          explode: false,
          schema: {
            type: 'object',
            properties: {
              role: { type: 'string' },
              active: { type: 'boolean' },
            },
          },
        },
      ],
      [
        {
          role: 'admin',
          active: true,
        },
      ],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/search/' + 'role,admin,active,true',
    );
  });

  it('serializes exploded simple objects', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/search/{filter}',
      [
        {
          name: 'filter',
          in: 'path',
          required: true,
          style: 'simple',
          explode: true,
          schema: {
            type: 'object',
            properties: {
              role: { type: 'string' },
              active: { type: 'boolean' },
            },
          },
        },
      ],
      [
        {
          role: 'admin/editor',
          active: true,
        },
      ],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/search/' + 'role=admin%2Feditor,active=true',
    );
  });

  it('replaces repeated path markers', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/{id}/related/{id}',
      [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
      ],
      ['a/b'],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/' + 'a%2Fb/related/a%2Fb',
    );
  });

  it('combines encoded paths with ordinary query parameters', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/items/{id}',
      [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
        {
          name: 'page',
          in: 'query',
          schema: { type: 'integer' },
        },
      ],
      ['a/b', 2],
    );

    expect(request.url).toBe('https://example.com/api/v1/items/a%2Fb');

    expect(request.params.get('page')).toBe('2');
  });

  it('rejects query-only form style on path parameters', (): void => {
    const parameter: SwaggerParameter = {
      name: 'id',
      in: 'path',
      style: 'form',
      schema: { type: 'string' },
    };

    expect((): string => {
      return generatePathParameterExpression(parameter, 'id');
    }).toThrow(/Unsupported path parameter style/);
  });

  it('rejects arrays containing objects', (): void => {
    const parameter: SwaggerParameter = {
      name: 'items',
      in: 'path',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
          },
        },
      },
    };

    expect((): string => {
      return generatePathParameterExpression(parameter, 'items');
    }).toThrow(/Unsupported path array item schema/);
  });

  it('rejects nested object properties', (): void => {
    const parameter: SwaggerParameter = {
      name: 'filter',
      in: 'path',
      schema: {
        type: 'object',
        properties: {
          status: {
            type: 'object',
            properties: {
              code: { type: 'integer' },
            },
          },
        },
      },
    };

    expect((): string => {
      return generatePathParameterExpression(parameter, 'filter');
    }).toThrow(/Unsupported nested path object parameter/);
  });

  it('rejects unresolved path schema references', (): void => {
    const parameter: SwaggerParameter = {
      name: 'id',
      in: 'path',
      schema: {
        $ref: '#/components/schemas/Identifier',
      },
    };

    expect((): string => {
      return generatePathParameterExpression(parameter, 'id');
    }).toThrow(/Unsupported path parameter schema/);
  });
});
