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
 * Captures the requested URL and Angular HttpParams
 * without performing a network request.
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
     * Captures a generated GET request.
     *
     * @param url Requested URL.
     * @param options Generated HTTP options.
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

describe('OpenAPI matrix path serialization', (): void => {
  it('serializes scalar values with a semicolon prefix', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/colors/{color}',
      [
        {
          name: 'color',
          in: 'path',
          required: true,
          style: 'matrix',
          schema: { type: 'string' },
        },
      ],
      ['blue'],
    );

    expect(request.url).toBe('https://example.com/api/v1/colors/;color=blue');
  });

  it('supports explode true on scalar values', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/colors/{color}',
      [
        {
          name: 'color',
          in: 'path',
          required: true,
          style: 'matrix',
          explode: true,
          schema: { type: 'string' },
        },
      ],
      ['blue'],
    );

    expect(request.url).toBe('https://example.com/api/v1/colors/;color=blue');
  });

  it('encodes characters that could alter path structure', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/colors/{color}',
      [
        {
          name: 'color',
          in: 'path',
          required: true,
          style: 'matrix',
          schema: { type: 'string' },
        },
      ],
      ['a/b;c=d?e#ñ'],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/colors/' +
        ';color=a%2Fb%3Bc%3Dd%3Fe%23%C3%B1',
    );
  });

  it('serializes empty scalar values without an equals sign', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/colors/{color}',
      [
        {
          name: 'color',
          in: 'path',
          required: true,
          style: 'matrix',
          schema: { type: 'string' },
        },
      ],
      [''],
    );

    expect(request.url).toBe('https://example.com/api/v1/colors/;color');
  });

  it('preserves zero and false scalar values', (): void => {
    const numberRequest: CapturedRequest = executeGeneratedRequest(
      '/v1/items/{id}',
      [
        {
          name: 'id',
          in: 'path',
          required: true,
          style: 'matrix',
          schema: { type: 'integer' },
        },
      ],
      [0],
    );

    expect(numberRequest.url).toBe('https://example.com/api/v1/items/;id=0');

    const booleanRequest: CapturedRequest = executeGeneratedRequest(
      '/v1/items/{active}',
      [
        {
          name: 'active',
          in: 'path',
          required: true,
          style: 'matrix',
          schema: { type: 'boolean' },
        },
      ],
      [false],
    );

    expect(booleanRequest.url).toBe(
      'https://example.com/api/v1/items/;active=false',
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
          style: 'matrix',
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      ],
      [['blue', 'black', 'brown']],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/colors/' + ';colors=blue,black,brown',
    );
  });

  it('serializes exploded arrays with repeated names', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/colors/{colors}',
      [
        {
          name: 'colors',
          in: 'path',
          required: true,
          style: 'matrix',
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
      'https://example.com/api/v1/colors/' +
        ';colors=blue;colors=black;colors=brown',
    );
  });

  it('encodes structural delimiters inside array values', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/colors/{colors}',
      [
        {
          name: 'colors',
          in: 'path',
          required: true,
          style: 'matrix',
          explode: true,
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      ],
      [['a;b', 'c,d', 'e=f']],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/colors/' +
        ';colors=a%3Bb;colors=c%2Cd;colors=e%3Df',
    );
  });

  it('handles empty arrays with either explode setting', (): void => {
    for (const explode of [false, true]) {
      const request: CapturedRequest = executeGeneratedRequest(
        '/v1/colors/{colors}',
        [
          {
            name: 'colors',
            in: 'path',
            required: true,
            style: 'matrix',
            explode,
            schema: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        ],
        [[]],
      );

      expect(request.url).toBe('https://example.com/api/v1/colors/;colors');
    }
  });

  it('serializes non-exploded objects', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/colors/{color}',
      [
        {
          name: 'color',
          in: 'path',
          required: true,
          style: 'matrix',
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

    expect(request.url).toBe(
      'https://example.com/api/v1/colors/' + ';color=R,100,G,200',
    );
  });

  it('serializes exploded objects with property names', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/colors/{color}',
      [
        {
          name: 'color',
          in: 'path',
          required: true,
          style: 'matrix',
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

    expect(request.url).toBe(
      'https://example.com/api/v1/colors/' + ';R=100;G=200',
    );
  });

  it('encodes reserved characters in object keys and values', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/search/{filter}',
      [
        {
          name: 'filter',
          in: 'path',
          required: true,
          style: 'matrix',
          explode: true,
          schema: {
            type: 'object',
            properties: {
              'first;name': { type: 'string' },
            },
          },
        },
      ],
      [
        {
          'first;name': 'a=b/c',
        },
      ],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/search/' + ';first%3Bname=a%3Db%2Fc',
    );
  });

  it('omits null and undefined object properties', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/search/{filter}',
      [
        {
          name: 'filter',
          in: 'path',
          required: true,
          style: 'matrix',
          explode: true,
          schema: {
            type: 'object',
            properties: {
              role: { type: 'string' },
              active: { type: 'boolean', nullable: true },
            },
          },
        },
      ],
      [
        {
          role: 'editor',
          active: null,
        },
      ],
    );

    expect(request.url).toBe('https://example.com/api/v1/search/;role=editor');
  });

  it('serializes empty objects using the parameter name', (): void => {
    for (const explode of [false, true]) {
      const request: CapturedRequest = executeGeneratedRequest(
        '/v1/search/{filter}',
        [
          {
            name: 'filter',
            in: 'path',
            required: true,
            style: 'matrix',
            explode,
            schema: {
              type: 'object',
              properties: {
                role: { type: 'string' },
              },
            },
          },
        ],
        [{}],
      );

      expect(request.url).toBe('https://example.com/api/v1/search/;filter');
    }
  });

  it('encodes special path parameter names', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/items/{user;id}',
      [
        {
          name: 'user;id',
          in: 'path',
          required: true,
          style: 'matrix',
          schema: { type: 'string' },
        },
      ],
      ['a/b'],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/items/;user%3Bid=a%2Fb',
    );
  });

  it('replaces repeated matrix placeholders', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/{id}/related/{id}',
      [
        {
          name: 'id',
          in: 'path',
          required: true,
          style: 'matrix',
          schema: { type: 'integer' },
        },
      ],
      [42],
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/;id=42/related/;id=42',
    );
  });

  it('combines matrix paths with query parameters', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      '/v1/items/{id}',
      [
        {
          name: 'id',
          in: 'path',
          required: true,
          style: 'matrix',
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

    expect(request.url).toBe('https://example.com/api/v1/items/;id=a%2Fb');

    expect(request.params.get('page')).toBe('2');
  });

  it('rejects nested matrix array elements', (): void => {
    const parameter: SwaggerParameter = {
      name: 'items',
      in: 'path',
      style: 'matrix',
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

  it('rejects nested matrix object properties', (): void => {
    const parameter: SwaggerParameter = {
      name: 'filter',
      in: 'path',
      style: 'matrix',
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
});
