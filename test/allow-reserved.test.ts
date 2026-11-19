import '@angular/compiler';

import { HttpParams } from '@angular/common/http';
import vm from 'node:vm';
import type { Observable } from 'rxjs';
import { catchError, of } from 'rxjs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import generateAllowReservedQueryCode from '../src/generator/allow-reserved-serializer.js';
import generateMethods from '../src/generator/methods.js';

import type { SwaggerParameter, SwaggerPaths } from '../src/generator/types.js';

/**
 * HTTP request captured by the test client.
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
 * Generates and executes an HTTP GET method using
 * controlled OpenAPI parameter definitions.
 *
 * No network request is performed.
 *
 * @param parameters OpenAPI parameters to generate.
 * @param args Values passed to the generated method.
 * @returns Captured URL and Angular HttpParams.
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

describe('OpenAPI allowReserved query serialization', (): void => {
  it('preserves existing behavior when allowReserved is absent', (): void => {
    const parameter: SwaggerParameter = {
      name: 'term',
      in: 'query',
      schema: { type: 'string' },
    };

    expect(
      generateAllowReservedQueryCode(parameter, 'term', "'term'"),
    ).toBeNull();
  });

  it('preserves existing behavior when allowReserved is false', (): void => {
    const parameter: SwaggerParameter = {
      name: 'term',
      in: 'query',
      allowReserved: false,
      schema: { type: 'string' },
    };

    expect(
      generateAllowReservedQueryCode(parameter, 'term', "'term'"),
    ).toBeNull();
  });

  it('generates encoded URL segments for reserved scalar values', (): void => {
    const parameter: SwaggerParameter = {
      name: 'term',
      in: 'query',
      allowReserved: true,
      schema: { type: 'string' },
    };

    const content: string | null = generateAllowReservedQueryCode(
      parameter,
      'term',
      "'term'",
    );

    expect(content).toContain("encodeURIComponent('term')");

    expect(content).toContain('encodeURI(String(term))');

    expect(content).toContain(".replace(/&/g, '%26')");

    expect(content).toContain(".replace(/\\+/g, '%2B')");

    expect(content).toContain(".replace(/#/g, '%23')");
  });

  it('preserves safe reserved characters in the URL', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'term',
          in: 'query',
          required: true,
          allowReserved: true,
          schema: { type: 'string' },
        },
      ],
      ['https://example.com/a?b=c&d=1'],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/search?' +
        'term=https://example.com/a?b=c%26d=1',
    );

    expect(new URL(request.url).searchParams.get('term')).toBe(
      'https://example.com/a?b=c&d=1',
    );

    expect(request.params.toString()).toBe('');
  });

  it('encodes query-breaking characters and Unicode', (): void => {
    const value: string = 'a:/?b=c&d+e#f [ñ]';

    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'term',
          in: 'query',
          allowReserved: true,
          schema: { type: 'string' },
        },
      ],
      [value],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/search?' +
        'term=a:/?b=c%26d%2Be%23f%20%5B%C3%B1%5D',
    );

    expect(new URL(request.url).searchParams.get('term')).toBe(value);
  });

  it('preserves valid percent-encoded triples', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'term',
          in: 'query',
          allowReserved: true,
          schema: { type: 'string' },
        },
      ],
      ['folder%2Ffile'],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/search?term=folder%2Ffile',
    );
  });

  it('encodes invalid percent sequences', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'term',
          in: 'query',
          allowReserved: true,
          schema: { type: 'string' },
        },
      ],
      ['folder%ZZ'],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/search?term=folder%25ZZ',
    );
  });

  it('combines allowReserved with ordinary query parameters', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'term',
          in: 'query',
          required: true,
          allowReserved: true,
          schema: { type: 'string' },
        },
        {
          name: 'page',
          in: 'query',
          schema: { type: 'integer' },
        },
      ],
      ['a/b?c=d&e', 2],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/search?' + 'term=a/b?c=d%26e',
    );

    expect(request.params.get('page')).toBe('2');
  });

  it('omits optional null values', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'term',
          in: 'query',
          allowReserved: true,
          schema: {
            type: 'string',
            nullable: true,
          },
        },
      ],
      [null],
    );

    expect(request.url).toBe('https://example.com/api/v1/search');

    expect(request.params.toString()).toBe('');
  });

  it('rejects allowReserved on array schemas', (): void => {
    const parameter: SwaggerParameter = {
      name: 'tags',
      in: 'query',
      allowReserved: true,
      schema: {
        type: 'array',
        items: { type: 'string' },
      },
    };

    expect((): string | null => {
      return generateAllowReservedQueryCode(parameter, 'tags', "'tags'");
    }).toThrow(/only supported for scalar query parameters/);
  });

  it('rejects allowReserved on object schemas', (): void => {
    const parameter: SwaggerParameter = {
      name: 'filter',
      in: 'query',
      allowReserved: true,
      schema: {
        type: 'object',
        properties: {
          role: { type: 'string' },
        },
      },
    };

    expect((): string | null => {
      return generateAllowReservedQueryCode(parameter, 'filter', "'filter'");
    }).toThrow(/only supported for scalar query parameters/);
  });

  it('rejects unsupported styles', (): void => {
    const parameter: SwaggerParameter = {
      name: 'term',
      in: 'query',
      style: 'deepObject',
      allowReserved: true,
      schema: { type: 'string' },
    };

    expect((): string | null => {
      return generateAllowReservedQueryCode(parameter, 'term', "'term'");
    }).toThrow(/Unsupported allowReserved style/);
  });
});
