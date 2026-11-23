import '@angular/compiler';

import { HttpParams } from '@angular/common/http';
import vm from 'node:vm';
import type { Observable } from 'rxjs';
import { catchError, of } from 'rxjs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import generateMethods from '../src/generator/methods.js';
import resolvePathItem from '../src/generator/path-item-resolver.js';

import type {
  SwaggerParameterOrReference,
  SwaggerPathItem,
  SwaggerPaths,
  SwaggerSchema,
} from '../src/generator/types.js';

/**
 * Captured HTTP request.
 */
interface CapturedRequest {
  url: string;
  params: HttpParams;
}

/**
 * Runtime representation of the generated service.
 */
interface RuntimeService {
  getItem(...args: unknown[]): unknown;
}

/**
 * Generates and executes a GET operation from a Path Item.
 *
 * Captures the URL and query parameters without
 * performing a network request.
 *
 * @param paths Root OpenAPI paths.
 * @param pathItems Reusable Path Item components.
 * @param args Arguments supplied to the generated method.
 * @param schemas Reusable OpenAPI schemas.
 * @param parameters Reusable OpenAPI parameters.
 * @returns Captured HTTP request.
 */
function executeGeneratedRequest(
  paths: SwaggerPaths,
  pathItems: Record<string, SwaggerPathItem>,
  args: unknown[],
  schemas: Record<string, SwaggerSchema> = {},
  parameters: Record<string, SwaggerParameterOrReference> = {},
): CapturedRequest {
  const methods: string = generateMethods(
    paths,
    'basePathApi',
    schemas,
    parameters,
    pathItems,
  );

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

  service.getItem(...args);

  if (state.request === undefined) {
    throw new Error('The generated method did not perform an HTTP request.');
  }

  return state.request;
}

describe('OpenAPI Path Item references', (): void => {
  it('resolves a reusable Path Item from components', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items/{id}': {
        $ref: '#/components/pathItems/GetItem',
      },
    };

    const pathItems: Record<string, SwaggerPathItem> = {
      GetItem: {
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        get: {
          operationId: 'getItem',
          parameters: [
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer' },
            },
          ],
        },
      },
    };

    const content: string = generateMethods(
      paths,
      'basePathApi',
      {},
      {},
      pathItems,
    );

    expect(content).toContain(
      'getItem(id: string, page?: number): Observable<any>',
    );

    expect(content).toContain('/v1/items/${encodeURIComponent(String(id))}');

    const request: CapturedRequest = executeGeneratedRequest(paths, pathItems, [
      'a/b',
      2,
    ]);

    expect(request.url).toBe('https://example.com/api/v1/items/a%2Fb');

    expect(request.params.get('page')).toBe('2');
  });

  it('resolves references to another root path', (): void => {
    const paths: SwaggerPaths = {
      '/v1/original/{id}': {
        get: {
          operationId: 'getItem',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
        },
      },
      '/v1/copied/{id}': {
        $ref: '#/paths/~1v1~1original~1{id}',
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('getItem(id: number): Observable<any>');

    expect(content).toContain('getItem_get(id: number): Observable<any>');

    expect(content).toContain('/v1/original/${encodeURIComponent(String(id))}');

    expect(content).toContain('/v1/copied/${encodeURIComponent(String(id))}');
  });

  it('resolves chained Path Item references', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        $ref: '#/components/pathItems/First',
      },
    };

    const pathItems: Record<string, SwaggerPathItem> = {
      First: {
        $ref: '#/components/pathItems/Second',
      },
      Second: {
        $ref: '#/components/pathItems/Actual',
      },
      Actual: {
        get: {
          operationId: 'getItem',
        },
      },
    };

    const content: string = generateMethods(
      paths,
      'basePathApi',
      {},
      {},
      pathItems,
    );

    expect(content).toContain('getItem(): Observable<any>');

    expect(content).toContain('.get<any>(`${this.basePathApi}/v1/items`, {})');
  });

  it('supports URI-encoded component names', (): void => {
    const pathItems: Record<string, SwaggerPathItem> = {
      'Get.Item': {
        get: {
          operationId: 'getItem',
        },
      },
    };

    const resolved: SwaggerPathItem = resolvePathItem(
      {
        $ref: '#/components/pathItems/Get%2EItem',
      },
      {},
      pathItems,
    );

    expect(resolved.get?.operationId).toBe('getItem');
  });

  it('resolves references to root paths with escaped names', (): void => {
    const paths: SwaggerPaths = {
      '/v1/café': {
        get: {
          operationId: 'getItem',
        },
      },
    };

    const resolved: SwaggerPathItem = resolvePathItem(
      {
        $ref: '#/paths/~1v1~1caf%C3%A9',
      },
      paths,
    );

    expect(resolved.get?.operationId).toBe('getItem');
  });

  it('preserves parameter overrides inside referenced Path Items', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items/{id}': {
        $ref: '#/components/pathItems/GetItem',
      },
    };

    const pathItems: Record<string, SwaggerPathItem> = {
      GetItem: {
        parameters: [
          {
            $ref: '#/components/parameters/ItemId',
          },
        ],
        get: {
          operationId: 'getItem',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
        },
      },
    };

    const parameterDefinitions: Record<string, SwaggerParameterOrReference> = {
      ItemId: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'integer' },
      },
    };

    const content: string = generateMethods(
      paths,
      'basePathApi',
      {},
      parameterDefinitions,
      pathItems,
    );

    expect(content).toContain('getItem(id: string): Observable<any>');

    expect(content).not.toContain('id: number');
  });

  it('supports referenced schemas inside reusable Path Items', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items/{id}': {
        $ref: '#/components/pathItems/GetItem',
      },
    };

    const pathItems: Record<string, SwaggerPathItem> = {
      GetItem: {
        get: {
          operationId: 'getItem',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: {
                $ref: '#/components/schemas/ItemId',
              },
            },
          ],
        },
      },
    };

    const schemas: Record<string, SwaggerSchema> = {
      ItemId: {
        type: 'string',
      },
    };

    const request: CapturedRequest = executeGeneratedRequest(
      paths,
      pathItems,
      ['a/b'],
      schemas,
    );

    expect(request.url).toBe('https://example.com/api/v1/items/a%2Fb');
  });

  it('allows descriptive metadata alongside a Path Item reference', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        $ref: '#/components/pathItems/GetItem',
        summary: 'Retrieve items',
        description: 'Uses a reusable operation',
        'x-reference-note': 'shared',
      },
    };

    const pathItems: Record<string, SwaggerPathItem> = {
      GetItem: {
        get: {
          operationId: 'getItem',
        },
      },
    };

    const content: string = generateMethods(
      paths,
      'basePathApi',
      {},
      {},
      pathItems,
    );

    expect(content).toContain('getItem(): Observable<any>');
  });

  it('rejects operations alongside a Path Item reference', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        $ref: '#/components/pathItems/GetItem',
        post: {
          operationId: 'createItem',
        },
      },
    };

    expect((): string => {
      return generateMethods(
        paths,
        'basePathApi',
        {},
        {},
        {
          GetItem: {
            get: {
              operationId: 'getItem',
            },
          },
        },
      );
    }).toThrow(/Unsupported Path Item siblings/);
  });

  it('rejects parameters alongside a Path Item reference', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        $ref: '#/components/pathItems/GetItem',
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer' },
          },
        ],
      },
    };

    expect((): string => {
      return generateMethods(
        paths,
        'basePathApi',
        {},
        {},
        {
          GetItem: {
            get: {
              operationId: 'getItem',
            },
          },
        },
      );
    }).toThrow(/Unsupported Path Item siblings/);
  });

  it('rejects unresolved Path Item references', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        $ref: '#/components/pathItems/Missing',
      },
    };

    expect((): string => {
      return generateMethods(paths, 'basePathApi');
    }).toThrow(/Unresolved Path Item reference/);
  });

  it('rejects external Path Item references', (): void => {
    expect((): SwaggerPathItem => {
      return resolvePathItem(
        {
          $ref: 'https://example.com/paths.json#/GetItem',
        },
        {},
      );
    }).toThrow(/Unsupported Path Item reference/);
  });

  it('rejects malformed references', (): void => {
    expect((): SwaggerPathItem => {
      return resolvePathItem(
        {
          $ref: '#/components/pathItems/Bad%XX',
        },
        {},
      );
    }).toThrow(/Invalid Path Item reference/);
  });

  it('detects circular component references', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        $ref: '#/components/pathItems/A',
      },
    };

    const pathItems: Record<string, SwaggerPathItem> = {
      A: {
        $ref: '#/components/pathItems/B',
      },
      B: {
        $ref: '#/components/pathItems/A',
      },
    };

    expect((): string => {
      return generateMethods(paths, 'basePathApi', {}, {}, pathItems);
    }).toThrow(/Circular Path Item reference/);
  });

  it('detects circular references between root paths', (): void => {
    const paths: SwaggerPaths = {
      '/v1/a': {
        $ref: '#/paths/~1v1~1b',
      },
      '/v1/b': {
        $ref: '#/paths/~1v1~1a',
      },
    };

    expect((): string => {
      return generateMethods(paths, 'basePathApi');
    }).toThrow(/Circular Path Item reference/);
  });

  it('preserves inline Path Items without references', (): void => {
    const pathItem: SwaggerPathItem = {
      get: {
        operationId: 'getItem',
      },
    };

    const resolved: SwaggerPathItem = resolvePathItem(pathItem, {});

    expect(resolved).toBe(pathItem);
  });
});
