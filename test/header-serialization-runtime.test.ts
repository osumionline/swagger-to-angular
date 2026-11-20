import '@angular/compiler';

import { HttpParams } from '@angular/common/http';
import vm from 'node:vm';
import type { Observable } from 'rxjs';
import { catchError, of } from 'rxjs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import generateHeaderParameterCode from '../src/generator/header-serializer.js';
import generateMethods from '../src/generator/methods.js';

import type { SwaggerParameter, SwaggerPaths } from '../src/generator/types.js';

/**
 * HTTP request captured by the simulated client.
 */
interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
  params: HttpParams;
}

/**
 * Runtime representation of the generated service.
 */
interface RuntimeService {
  search(...args: unknown[]): unknown;
}

/**
 * Generates and executes an OpenAPI GET method.
 *
 * Captures the URL, headers and Angular HttpParams
 * without performing any network request.
 *
 * @param parameters OpenAPI parameter definitions.
 * @param args Arguments supplied to the generated method.
 * @returns Captured HTTP request information.
 */
function executeGeneratedRequest(
  parameters: SwaggerParameter[],
  args: unknown[],
): CapturedRequest {
  const paths: SwaggerPaths = {
    '/v1/items': {
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
     * @param options Generated HTTP options.
     * @returns Simulated HTTP response.
     */
    get(
      url: string,
      options: {
        headers?: Record<string, string>;
        params?: HttpParams;
      },
    ): Observable<unknown> {
      state.request = {
        url,
        headers: options.headers ?? {},
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

describe('OpenAPI header runtime serialization', (): void => {
  it('preserves scalar header serialization', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'X-Version',
          in: 'header',
          required: true,
          schema: { type: 'integer' },
        },
      ],
      [42],
    );

    expect(request.headers['X-Version']).toBe('42');
  });

  it('serializes arrays using simple style by default', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'X-Ids',
          in: 'header',
          schema: {
            type: 'array',
            items: { type: 'integer' },
          },
        },
      ],
      [[10, 20, 30]],
    );

    expect(request.headers['X-Ids']).toBe('10,20,30');
  });

  it('uses one header for exploded arrays', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'X-Flags',
          in: 'header',
          style: 'simple',
          explode: true,
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      ],
      [['red', 'green', 'blue']],
    );

    expect(request.headers['X-Flags']).toBe('red,green,blue');

    expect(Object.keys(request.headers)).toHaveLength(1);
  });

  it('serializes non-exploded objects', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'X-Filter',
          in: 'header',
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

    expect(request.headers['X-Filter']).toBe('role,admin,active,true');
  });

  it('serializes exploded objects', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'X-Filter',
          in: 'header',
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
          role: 'admin',
          active: false,
        },
      ],
    );

    expect(request.headers['X-Filter']).toBe('role=admin,active=false');
  });

  it('supports dictionaries containing scalar values', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'X-Scores',
          in: 'header',
          explode: true,
          schema: {
            type: 'object',
            additionalProperties: { type: 'integer' },
          },
        },
      ],
      [
        {
          red: 10,
          blue: 20,
        },
      ],
    );

    expect(request.headers['X-Scores']).toBe('red=10,blue=20');
  });

  it('preserves ordinary characters without URI encoding', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'X-Paths',
          in: 'header',
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      ],
      [['a/b', 'c?d=e']],
    );

    expect(request.headers['X-Paths']).toBe('a/b,c?d=e');

    expect(request.headers['X-Paths']).not.toContain('%2F');
  });

  it('omits null and undefined optional collections', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'X-Ids',
          in: 'header',
          schema: {
            type: 'array',
            nullable: true,
            items: { type: 'integer' },
          },
        },
        {
          name: 'X-Filter',
          in: 'header',
          schema: {
            type: 'object',
            nullable: true,
            properties: {
              role: { type: 'string' },
            },
          },
        },
      ],
      [null, undefined],
    );

    expect(request.headers).toEqual({});
  });

  it('omits null properties within a flat object', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'X-Filter',
          in: 'header',
          explode: true,
          schema: {
            type: 'object',
            properties: {
              role: { type: 'string' },
              active: {
                type: 'boolean',
                nullable: true,
              },
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

    expect(request.headers['X-Filter']).toBe('role=editor');
  });

  it('combines array headers with query parameters', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'X-Ids',
          in: 'header',
          required: true,
          schema: {
            type: 'array',
            items: { type: 'integer' },
          },
        },
        {
          name: 'page',
          in: 'query',
          schema: { type: 'integer' },
        },
      ],
      [[10, 20], 2],
    );

    expect(request.url).toBe('https://example.com/api/v1/items');

    expect(request.headers['X-Ids']).toBe('10,20');

    expect(request.params.get('page')).toBe('2');
  });

  it('rejects unsupported header styles', (): void => {
    const parameter: SwaggerParameter = {
      name: 'X-Filter',
      in: 'header',
      style: 'form',
      schema: { type: 'string' },
    };

    expect((): string => {
      return generateHeaderParameterCode(parameter, 'filter', "'X-Filter'");
    }).toThrow(/Unsupported header parameter style/);
  });

  it('rejects allowReserved on headers', (): void => {
    const parameter: SwaggerParameter = {
      name: 'X-Filter',
      in: 'header',
      allowReserved: true,
      schema: { type: 'string' },
    };

    expect((): string => {
      return generateHeaderParameterCode(parameter, 'filter', "'X-Filter'");
    }).toThrow(/allowReserved is only supported for query parameters/);
  });

  it('rejects arrays containing nested objects', (): void => {
    const parameter: SwaggerParameter = {
      name: 'X-Items',
      in: 'header',
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
      return generateHeaderParameterCode(parameter, 'items', "'X-Items'");
    }).toThrow(/Unsupported header array item schema/);
  });

  it('rejects nested object properties', (): void => {
    const parameter: SwaggerParameter = {
      name: 'X-Filter',
      in: 'header',
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
      return generateHeaderParameterCode(parameter, 'filter', "'X-Filter'");
    }).toThrow(/Unsupported nested header object parameter/);
  });
});
