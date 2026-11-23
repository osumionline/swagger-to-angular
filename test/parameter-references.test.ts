import '@angular/compiler';

import { HttpParams } from '@angular/common/http';
import vm from 'node:vm';
import type { Observable } from 'rxjs';
import { catchError, of } from 'rxjs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import generateMethods from '../src/generator/methods.js';
import resolveParameterReference from '../src/generator/parameter-reference-resolver.js';

import type {
  SwaggerParameterOrReference,
  SwaggerPaths,
  SwaggerSchema,
} from '../src/generator/types.js';

/**
 * Captured HTTP GET request.
 */
interface CapturedRequest {
  url: string;
  params: HttpParams;
  headers: Record<string, string>;
  withCredentials: boolean | undefined;
}

/**
 * Runtime shape of the generated service.
 */
interface RuntimeService {
  search(...args: unknown[]): unknown;
}

/**
 * Creates an OpenAPI GET operation containing both
 * path-level and operation-level parameters.
 *
 * @param pathParameters Shared path-level parameters.
 * @param operationParameters Operation-specific parameters.
 * @param rawPath OpenAPI path template.
 * @returns OpenAPI paths definition.
 */
function createPaths(
  pathParameters: SwaggerParameterOrReference[],
  operationParameters: SwaggerParameterOrReference[],
  rawPath: string = '/v1/items',
): SwaggerPaths {
  return {
    [rawPath]: {
      parameters: pathParameters,
      get: {
        operationId: 'search',
        parameters: operationParameters,
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
}

/**
 * Generates and executes a GET operation using reusable
 * OpenAPI parameter definitions.
 *
 * Captures the URL, headers, query parameters and credential
 * options without performing a network request.
 *
 * @param paths OpenAPI paths to generate.
 * @param args Arguments supplied to the generated method.
 * @param parameterDefinitions Reusable OpenAPI parameters.
 * @param schemas Reusable OpenAPI schemas.
 * @returns Captured HTTP request.
 */
function executeGeneratedRequest(
  paths: SwaggerPaths,
  args: unknown[],
  parameterDefinitions: Record<string, SwaggerParameterOrReference>,
  schemas: Record<string, SwaggerSchema> = {},
): CapturedRequest {
  const methods: string = generateMethods(
    paths,
    'basePathApi',
    schemas,
    parameterDefinitions,
  );

  const state: {
    request?: CapturedRequest;
  } = {};

  const mockedHttp = {
    /**
     * Captures a generated HTTP GET request.
     *
     * @param url Requested URL.
     * @param options Generated request options.
     * @returns Simulated HTTP response.
     */
    get(
      url: string,
      options: {
        params?: HttpParams;
        headers?: Record<string, string>;
        withCredentials?: boolean;
      },
    ): Observable<unknown> {
      state.request = {
        url,
        params: options.params ?? new HttpParams(),
        headers: options.headers ?? {},
        withCredentials: options.withCredentials,
      };

      return of(true);
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

describe('OpenAPI components.parameters references', (): void => {
  it('resolves a referenced path parameter and its schema', (): void => {
    const paths: SwaggerPaths = createPaths(
      [{ $ref: '#/components/parameters/ItemId' }],
      [],
      '/v1/items/{id}',
    );

    const definitions: Record<string, SwaggerParameterOrReference> = {
      ItemId: {
        name: 'id',
        in: 'path',
        required: true,
        schema: {
          $ref: '#/components/schemas/Identifier',
        },
      },
    };

    const schemas: Record<string, SwaggerSchema> = {
      Identifier: { type: 'string' },
    };

    const content: string = generateMethods(
      paths,
      'basePathApi',
      schemas,
      definitions,
    );

    expect(content).toContain('search(id: Identifier): Observable<boolean>');

    const request: CapturedRequest = executeGeneratedRequest(
      paths,
      ['a/b?c'],
      definitions,
      schemas,
    );

    expect(request.url).toBe('https://example.com/api/v1/items/a%2Fb%3Fc');
  });

  it('serializes referenced query arrays', (): void => {
    const paths: SwaggerPaths = createPaths(
      [],
      [{ $ref: '#/components/parameters/Tags' }],
    );

    const definitions: Record<string, SwaggerParameterOrReference> = {
      Tags: {
        name: 'tags',
        in: 'query',
        style: 'form',
        explode: false,
        schema: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    };

    const request: CapturedRequest = executeGeneratedRequest(
      paths,
      [['a,b', 'c/d']],
      definitions,
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/items?' + 'tags=a%2Cb,c%2Fd',
    );
  });

  it('lets an inline operation parameter override a referenced one', (): void => {
    const paths: SwaggerPaths = createPaths(
      [{ $ref: '#/components/parameters/Page' }],
      [
        {
          name: 'page',
          in: 'query',
          required: true,
          schema: { type: 'integer' },
        },
      ],
    );

    const definitions: Record<string, SwaggerParameterOrReference> = {
      Page: {
        name: 'page',
        in: 'query',
        schema: { type: 'string' },
      },
    };

    const content: string = generateMethods(
      paths,
      'basePathApi',
      {},
      definitions,
    );

    expect(content).toContain('search(page: number): Observable<boolean>');

    expect(content).not.toContain('page?: string');

    const request: CapturedRequest = executeGeneratedRequest(
      paths,
      [3],
      definitions,
    );

    expect(request.params.getAll('page')).toEqual(['3']);
  });

  it('lets a referenced operation parameter override an inline one', (): void => {
    const paths: SwaggerPaths = createPaths(
      [
        {
          name: 'page',
          in: 'query',
          schema: { type: 'string' },
        },
      ],
      [{ $ref: '#/components/parameters/Page' }],
    );

    const definitions: Record<string, SwaggerParameterOrReference> = {
      Page: {
        name: 'page',
        in: 'query',
        required: true,
        schema: { type: 'integer' },
      },
    };

    const content: string = generateMethods(
      paths,
      'basePathApi',
      {},
      definitions,
    );

    expect(content).toContain('search(page: number): Observable<boolean>');

    expect(content).not.toContain('page?: string');
  });

  it('does not override parameters in different locations', (): void => {
    const paths: SwaggerPaths = createPaths(
      [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'integer' },
        },
      ],
      [{ $ref: '#/components/parameters/QueryId' }],
      '/v1/items/{id}',
    );

    const definitions: Record<string, SwaggerParameterOrReference> = {
      QueryId: {
        name: 'id',
        in: 'query',
        schema: { type: 'string' },
      },
    };

    const content: string = generateMethods(
      paths,
      'basePathApi',
      {},
      definitions,
    );

    expect(content).toContain(
      'search(id: number, id_query?: string): Observable<boolean>',
    );

    const request: CapturedRequest = executeGeneratedRequest(
      paths,
      [42, 'external'],
      definitions,
    );

    expect(request.url).toBe('https://example.com/api/v1/items/42');

    expect(request.params.get('id')).toBe('external');
  });

  it('supports referenced headers and browser-managed cookies', (): void => {
    const paths: SwaggerPaths = createPaths(
      [{ $ref: '#/components/parameters/Session' }],
      [{ $ref: '#/components/parameters/Trace' }],
    );

    const definitions: Record<string, SwaggerParameterOrReference> = {
      Session: {
        name: 'sessionId',
        in: 'cookie',
        required: true,
        schema: { type: 'string' },
      },
      Trace: {
        name: 'X-Trace',
        in: 'header',
        required: true,
        schema: { type: 'string' },
      },
    };

    const request: CapturedRequest = executeGeneratedRequest(
      paths,
      ['trace-123'],
      definitions,
    );

    expect(request.headers['X-Trace']).toBe('trace-123');
    expect(request.headers.Cookie).toBeUndefined();
    expect(request.withCredentials).toBe(true);
  });

  it('resolves chained references', (): void => {
    const definitions: Record<string, SwaggerParameterOrReference> = {
      First: {
        $ref: '#/components/parameters/Second',
      },
      Second: {
        $ref: '#/components/parameters/Actual',
      },
      Actual: {
        name: 'page',
        in: 'query',
        schema: { type: 'integer' },
      },
    };

    const resolved = resolveParameterReference(
      { $ref: '#/components/parameters/First' },
      definitions,
    );

    expect(resolved.name).toBe('page');
    expect(resolved.in).toBe('query');
    expect(resolved.schema?.type).toBe('integer');
  });

  it('supports escaped JSON Pointer parameter names', (): void => {
    const definitions: Record<string, SwaggerParameterOrReference> = {
      'Page/Size~Current': {
        name: 'page',
        in: 'query',
        schema: { type: 'integer' },
      },
    };

    const resolved = resolveParameterReference(
      {
        $ref: '#/components/parameters/Page~1Size~0Current',
      },
      definitions,
    );

    expect(resolved.name).toBe('page');
  });

  it('supports URI-encoded parameter names', (): void => {
    const definitions: Record<string, SwaggerParameterOrReference> = {
      'Page Size': {
        name: 'page',
        in: 'query',
        schema: { type: 'integer' },
      },
    };

    const resolved = resolveParameterReference(
      {
        $ref: '#/components/parameters/Page%20Size',
      },
      definitions,
    );

    expect(resolved.name).toBe('page');
  });

  it('ignores siblings of Reference Objects', (): void => {
    const definitions: Record<string, SwaggerParameterOrReference> = {
      Page: {
        name: 'page',
        in: 'query',
        schema: { type: 'integer' },
      },
    };

    const reference = {
      $ref: '#/components/parameters/Page',
      name: 'wrongName',
      in: 'header',
    } as SwaggerParameterOrReference;

    const resolved = resolveParameterReference(reference, definitions);

    expect(resolved.name).toBe('page');
    expect(resolved.in).toBe('query');
  });

  it('rejects unresolved parameter references', (): void => {
    const paths: SwaggerPaths = createPaths(
      [],
      [{ $ref: '#/components/parameters/Missing' }],
    );

    expect((): string => {
      return generateMethods(paths, 'basePathApi');
    }).toThrow(/Unresolved parameter reference/);
  });

  it('rejects circular parameter references', (): void => {
    const definitions: Record<string, SwaggerParameterOrReference> = {
      A: { $ref: '#/components/parameters/B' },
      B: { $ref: '#/components/parameters/A' },
    };

    expect((): SwaggerParameterOrReference => {
      return resolveParameterReference(
        { $ref: '#/components/parameters/A' },
        definitions,
      );
    }).toThrow(/Circular parameter reference/);
  });

  it('rejects external parameter references', (): void => {
    expect((): SwaggerParameterOrReference => {
      return resolveParameterReference(
        {
          $ref: 'https://example.com/parameters.json#/Page',
        },
        {},
      );
    }).toThrow(/Unsupported parameter reference/);
  });

  it('rejects malformed references', (): void => {
    expect((): SwaggerParameterOrReference => {
      return resolveParameterReference(
        {
          $ref: '#/components/parameters/Bad%XX',
        },
        {},
      );
    }).toThrow(/Invalid parameter reference/);
  });

  it('rejects invalid referenced parameter definitions', (): void => {
    const definitions = {
      Broken: {
        name: 'page',
        in: 'invalid',
        schema: { type: 'integer' },
      },
    } as unknown as Record<string, SwaggerParameterOrReference>;

    expect((): SwaggerParameterOrReference => {
      return resolveParameterReference(
        { $ref: '#/components/parameters/Broken' },
        definitions,
      );
    }).toThrow(/Invalid parameter definition referenced/);
  });
});
