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
 * Request captured from a generated HTTP method.
 */
interface CapturedRequest {
  url: string;
  params: HttpParams;
}

/**
 * Runtime representation of the generated test service.
 */
interface RuntimeService {
  search(...args: unknown[]): unknown;
}

/**
 * Generates and executes an HTTP GET method using
 * controlled OpenAPI parameter definitions.
 *
 * Captures the URL and real Angular HttpParams without
 * performing any network request.
 *
 * @param parameters OpenAPI parameters to generate.
 * @param args Argument values passed to the generated method.
 * @returns Captured request information.
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
     * Captures a generated HTTP GET request.
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

describe('Delimited query runtime serialization', (): void => {
  it('encodes literal pipes inside pipeDelimited values', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'tags',
          in: 'query',
          style: 'pipeDelimited',
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      ],
      [['a|b', 'c,d', 'x y']],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/search?' + 'tags=a%7Cb|c%2Cd|x%20y',
    );

    expect(request.params.toString()).toBe('');
  });

  it('encodes reserved characters in spaceDelimited values', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'colors',
          in: 'query',
          style: 'spaceDelimited',
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      ],
      [['red|blue', 'green&black', 'blå']],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/search?' +
        'colors=red%7Cblue%20green%26black%20bl%C3%A5',
    );

    expect(request.params.toString()).toBe('');
  });

  it('combines form and pipeDelimited arrays with scalar queries', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'cities',
          in: 'query',
          style: 'form',
          explode: false,
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        {
          name: 'tags',
          in: 'query',
          style: 'pipeDelimited',
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
      [['Bilbao, Bizkaia', 'Madrid'], ['a|b', 'c'], 2],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/search?' +
        'cities=Bilbao%2C%20Bizkaia,Madrid&' +
        'tags=a%7Cb|c',
    );

    expect(request.params.get('page')).toBe('2');

    /*
     * HttpClient appends these ordinary HttpParams
     * to the already constructed request URL.
     */
    expect(request.url + '&' + request.params.toString()).toBe(
      'https://example.com/api/v1/search?' +
        'cities=Bilbao%2C%20Bizkaia,Madrid&' +
        'tags=a%7Cb|c&page=2',
    );
  });

  it('omits null optional delimited arrays', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'tags',
          in: 'query',
          style: 'pipeDelimited',
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

  it('rejects explode true for pipeDelimited arrays', (): void => {
    const paths: SwaggerPaths = {
      '/v1/search': {
        get: {
          operationId: 'search',
          parameters: [
            {
              name: 'tags',
              in: 'query',
              style: 'pipeDelimited',
              explode: true,
              schema: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          ],
        },
      },
    };

    expect((): string => {
      return generateMethods(paths, 'basePathApi');
    }).toThrow(/pipeDelimited.*explode=true/);
  });

  it('rejects explode true for spaceDelimited arrays', (): void => {
    const paths: SwaggerPaths = {
      '/v1/search': {
        get: {
          operationId: 'search',
          parameters: [
            {
              name: 'colors',
              in: 'query',
              style: 'spaceDelimited',
              explode: true,
              schema: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          ],
        },
      },
    };

    expect((): string => {
      return generateMethods(paths, 'basePathApi');
    }).toThrow(/spaceDelimited.*explode=true/);
  });
});
