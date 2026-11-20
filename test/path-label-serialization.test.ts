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
 * Runtime shape of the generated service.
 */
interface RuntimeService {
  search(...args: unknown[]): unknown;
}

/**
 * Generates and executes an OpenAPI GET method.
 *
 * Captures the URL and Angular HttpParams without
 * performing a network request.
 *
 * @param rawPath OpenAPI path containing placeholders.
 * @param parameters HTTP parameter definitions.
 * @param args Arguments passed to the generated method.
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

describe('OpenAPI label path serialization', (): void => {
  it('serializes scalar values with a dot prefix', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/colors/{color}',
      [
        {
          name: 'color',
          in: 'path',
          required: true,
          style: 'label',
          schema: { type: 'string' },
        },
      ],
      ['blue'],
    );

    expect(request.url).toBe('https://example.com/api/v1/colors/.blue');
  });

  it('encodes special characters in scalar values', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/colors/{color}',
      [
        {
          name: 'color',
          in: 'path',
          required: true,
          style: 'label',
          explode: true,
          schema: { type: 'string' },
        },
      ],
      ['azul/verde?'],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/colors/.azul%2Fverde%3F',
    );
  });

  it('serializes non-exploded arrays with commas', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/colors/{colors}',
      [
        {
          name: 'colors',
          in: 'path',
          required: true,
          style: 'label',
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      ],
      [['blue', 'black', 'brown']],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/colors/.blue,black,brown',
    );
  });

  it('serializes exploded arrays with dots', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/colors/{colors}',
      [
        {
          name: 'colors',
          in: 'path',
          required: true,
          style: 'label',
          explode: true,
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      ],
      [['blue', 'black', 'brown']],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/colors/.blue.black.brown',
    );
  });

  it('encodes dots within exploded array elements', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/colors/{colors}',
      [
        {
          name: 'colors',
          in: 'path',
          required: true,
          style: 'label',
          explode: true,
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      ],
      [['dark.blue', 'light/green']],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/colors/.dark%2Eblue.light%2Fgreen',
    );
  });

  it('serializes non-exploded objects', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/colors/{color}',
      [
        {
          name: 'color',
          in: 'path',
          required: true,
          style: 'label',
          explode: false,
          schema: {
            type: 'object',
            properties: {
              R: { type: 'integer' },
              G: { type: 'integer' },
            },
          },
        },
      ],
      [
        {
          R: 100,
          G: 200,
        },
      ],
    );

    expect(request.url).toBe('https://example.com/api/v1/colors/.R,100,G,200');
  });

  it('serializes exploded objects', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/colors/{color}',
      [
        {
          name: 'color',
          in: 'path',
          required: true,
          style: 'label',
          explode: true,
          schema: {
            type: 'object',
            properties: {
              R: { type: 'integer' },
              G: { type: 'integer' },
            },
          },
        },
      ],
      [
        {
          R: 100,
          G: 200,
        },
      ],
    );

    expect(request.url).toBe('https://example.com/api/v1/colors/.R=100.G=200');
  });

  it('encodes dots inside exploded object properties', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/search/{filter}',
      [
        {
          name: 'filter',
          in: 'path',
          required: true,
          style: 'label',
          explode: true,
          schema: {
            type: 'object',
            properties: {
              'first.name': { type: 'string' },
            },
          },
        },
      ],
      [
        {
          'first.name': 'Ana.María',
        },
      ],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/search/' + '.first%2Ename=Ana%2EMar%C3%ADa',
    );
  });

  it('supports label expansion inside a partial path segment', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/items{suffix}',
      [
        {
          name: 'suffix',
          in: 'path',
          required: true,
          style: 'label',
          schema: { type: 'string' },
        },
      ],
      ['json'],
    );

    expect(request.url).toBe('https://example.com/api/v1/items.json');
  });

  it('combines label path parameters with query parameters', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/colors/{color}',
      [
        {
          name: 'color',
          in: 'path',
          required: true,
          style: 'label',
          schema: { type: 'string' },
        },
        {
          name: 'page',
          in: 'query',
          schema: { type: 'integer' },
        },
      ],
      ['blue/green', 2],
    );

    expect(request.url).toBe('https://example.com/api/v1/colors/.blue%2Fgreen');

    expect(request.params.get('page')).toBe('2');
  });

  it('rejects nested label object properties', (): void => {
    const parameter: SwaggerParameter = {
      name: 'filter',
      in: 'path',
      style: 'label',
      schema: {
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            properties: {
              code: { type: 'string' },
            },
          },
        },
      },
    };

    expect((): string => {
      return generatePathParameterExpression(parameter, 'filter');
    }).toThrow(/Unsupported nested path object parameter/);
  });

  it('rejects unresolved label references', (): void => {
    const parameter: SwaggerParameter = {
      name: 'id',
      in: 'path',
      style: 'label',
      schema: {
        $ref: '#/components/schemas/Identifier',
      },
    };

    expect((): string => {
      return generatePathParameterExpression(parameter, 'id');
    }).toThrow(/Unsupported path parameter schema/);
  });
});
