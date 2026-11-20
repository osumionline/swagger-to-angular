import '@angular/compiler';

import { HttpParams } from '@angular/common/http';
import vm from 'node:vm';
import type { Observable } from 'rxjs';
import { catchError, of } from 'rxjs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import generateMethods from '../src/generator/methods.js';
import resolveParameterSchema from '../src/generator/parameter-schema-resolver.js';

import type {
  SwaggerParameter,
  SwaggerPaths,
  SwaggerSchema,
} from '../src/generator/types.js';

/**
 * Request captured by the simulated HTTP client.
 */
interface CapturedRequest {
  url: string;
  params: HttpParams;
  headers: Record<string, string>;
}

/**
 * Runtime shape of the generated service.
 */
interface RuntimeService {
  search(...args: unknown[]): unknown;
}

/**
 * Creates an OpenAPI operation containing one parameter.
 *
 * @param parameter HTTP parameter definition.
 * @param rawPath Path containing optional placeholders.
 * @returns OpenAPI paths for the test operation.
 */
function createPaths(
  parameter: SwaggerParameter,
  rawPath: string = '/v1/items',
): SwaggerPaths {
  return {
    [rawPath]: {
      get: {
        operationId: 'search',
        parameters: [parameter],
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
 * Generates and executes an HTTP method using referenced
 * OpenAPI schemas.
 *
 * Captures the URL, query parameters and headers without
 * performing any network request.
 *
 * @param parameter HTTP parameter definition.
 * @param value Value passed to the generated method.
 * @param schemas Available component schemas.
 * @param rawPath Path containing optional placeholders.
 * @returns Captured request.
 */
function executeGeneratedRequest(
  parameter: SwaggerParameter,
  value: unknown,
  schemas: Record<string, SwaggerSchema>,
  rawPath: string = '/v1/items',
): CapturedRequest {
  const methods: string = generateMethods(
    createPaths(parameter, rawPath),
    'basePathApi',
    schemas,
  );

  const state: {
    request?: CapturedRequest;
  } = {};

  const mockedHttp = {
    /**
     * Captures an HTTP GET request.
     *
     * @param url Requested URL.
     * @param options Generated HTTP options.
     * @returns Simulated response.
     */
    get(
      url: string,
      options: {
        params?: HttpParams;
        headers?: Record<string, string>;
      },
    ): Observable<unknown> {
      state.request = {
        url,
        params: options.params ?? new HttpParams(),
        headers: options.headers ?? {},
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

  service.search(value);

  if (state.request === undefined) {
    throw new Error('The generated method did not perform an HTTP request.');
  }

  return state.request;
}

describe('OpenAPI HTTP parameter schema references', (): void => {
  it('resolves scalar path references and preserves the type alias', (): void => {
    const parameter: SwaggerParameter = {
      name: 'id',
      in: 'path',
      required: true,
      schema: {
        $ref: '#/components/schemas/Identifier',
      },
    };

    const schemas: Record<string, SwaggerSchema> = {
      Identifier: { type: 'string' },
    };

    const content: string = generateMethods(
      createPaths(parameter, '/v1/items/{id}'),
      'basePathApi',
      schemas,
    );

    expect(content).toContain('search(id: Identifier): Observable<boolean>');

    const request: CapturedRequest = executeGeneratedRequest(
      parameter,
      'a/b?c',
      schemas,
      '/v1/items/{id}',
    );

    expect(request.url).toBe('https://example.com/api/v1/items/a%2Fb%3Fc');
  });

  it('resolves referenced arrays and their item schemas', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      {
        name: 'tags',
        in: 'query',
        schema: {
          $ref: '#/components/schemas/TagList',
        },
      },
      ['red', 'blue'],
      {
        TagList: {
          type: 'array',
          items: {
            $ref: '#/components/schemas/Tag',
          },
        },
        Tag: { type: 'string' },
      },
    );

    expect(request.params.getAll('tags')).toEqual(['red', 'blue']);
  });

  it('preserves structural commas in referenced form arrays', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      {
        name: 'tags',
        in: 'query',
        style: 'form',
        explode: false,
        schema: {
          $ref: '#/components/schemas/TagList',
        },
      },
      ['Bilbao, Bizkaia', 'a/b'],
      {
        TagList: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/items?' + 'tags=Bilbao%2C%20Bizkaia,a%2Fb',
    );

    expect(request.params.toString()).toBe('');
  });

  it('resolves flat object references with scalar properties', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      {
        name: 'filter',
        in: 'query',
        style: 'form',
        explode: false,
        schema: {
          $ref: '#/components/schemas/Filter',
        },
      },
      {
        role: 'a,b',
        active: true,
      },
      {
        Filter: {
          type: 'object',
          properties: {
            role: {
              $ref: '#/components/schemas/Role',
            },
            active: { type: 'boolean' },
          },
        },
        Role: { type: 'string' },
      },
    );

    expect(request.url).toBe(
      'https://example.com/api/v1/items?' + 'filter=role,a%2Cb,active,true',
    );
  });

  it('resolves referenced header arrays', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      {
        name: 'X-Ids',
        in: 'header',
        required: true,
        schema: {
          $ref: '#/components/schemas/Identifiers',
        },
      },
      [10, 20],
      {
        Identifiers: {
          type: 'array',
          items: { type: 'integer' },
        },
      },
    );

    expect(request.headers['X-Ids']).toBe('10,20');
  });

  it('resolves chains of schema references', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      {
        name: 'term',
        in: 'query',
        schema: {
          $ref: '#/components/schemas/SearchAlias',
        },
      },
      'Málaga',
      {
        SearchAlias: {
          $ref: '#/components/schemas/SearchTerm',
        },
        SearchTerm: {
          type: 'string',
        },
      },
    );

    expect(request.params.get('term')).toBe('Málaga');
  });

  it('supports JSON Pointer escaped component names', (): void => {
    const parameter: SwaggerParameter = {
      name: 'id',
      in: 'path',
      required: true,
      schema: {
        $ref: '#/components/schemas/User~1Identifier',
      },
    };

    const schemas: Record<string, SwaggerSchema> = {
      'User/Identifier': { type: 'string' },
    };

    const resolved: SwaggerParameter = resolveParameterSchema(
      parameter,
      schemas,
    );

    expect(resolved.schema?.type).toBe('string');

    const content: string = generateMethods(
      createPaths(parameter, '/v1/items/{id}'),
      'basePathApi',
      schemas,
    );

    expect(content).toContain('id: OpenApiSchema_User_2f_Identifier');
  });

  it('allows reuse of one component in different properties', (): void => {
    const parameter: SwaggerParameter = {
      name: 'filter',
      in: 'query',
      schema: {
        type: 'object',
        properties: {
          first: {
            $ref: '#/components/schemas/Code',
          },
          second: {
            $ref: '#/components/schemas/Code',
          },
        },
      },
    };

    const resolved: SwaggerParameter = resolveParameterSchema(parameter, {
      Code: { type: 'string' },
    });

    expect(resolved.schema?.properties?.first.type).toBe('string');
    expect(resolved.schema?.properties?.second.type).toBe('string');
  });

  it('rejects referenced nested query objects', (): void => {
    const paths: SwaggerPaths = createPaths({
      name: 'filter',
      in: 'query',
      style: 'form',
      explode: false,
      schema: {
        $ref: '#/components/schemas/Filter',
      },
    });

    expect((): string => {
      return generateMethods(paths, 'basePathApi', {
        Filter: {
          type: 'object',
          properties: {
            details: {
              $ref: '#/components/schemas/Details',
            },
          },
        },
        Details: {
          type: 'object',
          properties: {
            code: { type: 'integer' },
          },
        },
      });
    }).toThrow(/Unsupported nested query object parameter: filter/);
  });

  it('rejects missing schema references', (): void => {
    const paths: SwaggerPaths = createPaths({
      name: 'term',
      in: 'query',
      schema: {
        $ref: '#/components/schemas/Missing',
      },
    });

    expect((): string => {
      return generateMethods(paths, 'basePathApi', {});
    }).toThrow(/Unresolved parameter schema reference/);
  });

  it('detects circular schema references', (): void => {
    const paths: SwaggerPaths = createPaths({
      name: 'term',
      in: 'query',
      schema: {
        $ref: '#/components/schemas/A',
      },
    });

    expect((): string => {
      return generateMethods(paths, 'basePathApi', {
        A: { $ref: '#/components/schemas/B' },
        B: { $ref: '#/components/schemas/A' },
      });
    }).toThrow(/Circular parameter schema reference/);
  });

  it('rejects external references', (): void => {
    const paths: SwaggerPaths = createPaths({
      name: 'term',
      in: 'query',
      schema: {
        $ref: 'https://example.com/schemas.json#/Search',
      },
    });

    expect((): string => {
      return generateMethods(paths, 'basePathApi', {});
    }).toThrow(/Unsupported parameter schema reference/);
  });

  it('rejects invalid URI encoding in references', (): void => {
    const paths: SwaggerPaths = createPaths({
      name: 'term',
      in: 'query',
      schema: {
        $ref: '#/components/schemas/Bad%XX',
      },
    });

    expect((): string => {
      return generateMethods(paths, 'basePathApi', {});
    }).toThrow(/Invalid parameter schema reference/);
  });
});
