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
 * HTTP request captured by the simulated client.
 */
interface CapturedRequest {
  url: string;
  params: HttpParams;
}

/**
 * Shape of the dynamically generated service used in tests.
 */
interface RuntimeQueryService {
  search(...args: unknown[]): unknown;
}

/**
 * Generates and executes an Angular service method,
 * capturing the actual HttpParams passed to HttpClient.
 *
 * The HTTP client is simulated, so no network request
 * is performed. The real Angular HttpParams implementation
 * is used for serialization.
 *
 * @param parameters OpenAPI query parameter definitions.
 * @param args Values passed to the generated method.
 * @returns Captured request URL and Angular HttpParams.
 */
function executeGeneratedQuery(
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
     * Captures an HTTP GET request without sending it.
     *
     * @param url Generated request URL.
     * @param options Angular HTTP request options.
     * @returns Observable containing a simulated response.
     */
    get(url: string, options: { params?: HttpParams }): Observable<unknown> {
      state.request = {
        url,
        params: options.params ?? new HttpParams(),
      };

      return of(null);
    },
  };

  /*
   * The generated methods are placed inside a minimal
   * service class. Angular dependency injection and
   * decorators are not needed for this runtime test.
   */
  const source: string = `
class GeneratedQueryService {
  http = mockedHttp;
  basePathApi = 'https://example.com/api';

  private handleError(error: unknown): never {
    throw error;
  }

${methods}
}

GeneratedQueryService;
`;

  const compiled: string = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText;

  /*
   * Execute only code produced from the test's controlled
   * OpenAPI definitions, in a separate VM context.
   */
  const ServiceConstructor = vm.runInNewContext(compiled, {
    mockedHttp,
    HttpParams,
    catchError,
  }) as new () => RuntimeQueryService;

  const service: RuntimeQueryService = new ServiceConstructor();

  service.search(...args);

  if (state.request === undefined) {
    throw new Error('The generated method did not perform an HTTP request.');
  }

  return state.request;
}

describe('Generated query runtime serialization', (): void => {
  it('serializes scalar parameters and reserved characters', (): void => {
    const request: CapturedRequest = executeGeneratedQuery(
      [
        {
          name: 'page',
          in: 'query',
          required: true,
          schema: { type: 'integer' },
        },
        {
          name: 'term',
          in: 'query',
          schema: { type: 'string' },
        },
      ],
      [2, 'a&b + ñ'],
    );

    expect(request.url).toBe('https://example.com/api/v1/search');

    expect(request.params.get('page')).toBe('2');
    expect(request.params.get('term')).toBe('a&b + ñ');

    expect(request.params.toString()).toContain('page=2');

    expect(request.params.toString()).toContain('term=a%26b%20%2B%20%C3%B1');
  });

  it('serializes exploded arrays as repeated query keys', (): void => {
    const request: CapturedRequest = executeGeneratedQuery(
      [
        {
          name: 'colors',
          in: 'query',
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      ],
      [['red', 'green', 'blue']],
    );

    expect(request.params.getAll('colors')).toEqual(['red', 'green', 'blue']);

    expect(request.params.toString()).toBe(
      'colors=red&colors=green&colors=blue',
    );
  });

  it('serializes non-exploded arrays with commas', (): void => {
    const request: CapturedRequest = executeGeneratedQuery(
      [
        {
          name: 'ids',
          in: 'query',
          style: 'form',
          explode: false,
          schema: {
            type: 'array',
            items: { type: 'integer' },
          },
        },
      ],
      [[10, 20, 30]],
    );

    expect(request.params.get('ids')).toBe('10,20,30');
    expect(request.params.getAll('ids')).toEqual(['10,20,30']);

    expect(request.params.toString()).toBe('ids=10,20,30');
  });

  it('serializes spaceDelimited and pipeDelimited arrays', (): void => {
    const request: CapturedRequest = executeGeneratedQuery(
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
      [
        ['red', 'green'],
        ['a', 'b'],
      ],
    );

    expect(request.params.get('colors')).toBe('red green');
    expect(request.params.get('tags')).toBe('a|b');

    expect(request.params.toString()).toContain('colors=red%20green');

    expect(request.params.toString()).toContain('tags=a%7Cb');
  });

  it('serializes exploded form objects as separate keys', (): void => {
    const request: CapturedRequest = executeGeneratedQuery(
      [
        {
          name: 'filter',
          in: 'query',
          schema: {
            type: 'object',
            required: ['role'],
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

    expect(request.params.get('role')).toBe('admin');
    expect(request.params.get('active')).toBe('true');

    expect(request.params.has('filter')).toBe(false);

    expect(request.params.toString()).toBe('role=admin&active=true');
  });

  it('handles multiple non-exploded form objects', (): void => {
    const request: CapturedRequest = executeGeneratedQuery(
      [
        {
          name: 'filter',
          in: 'query',
          style: 'form',
          explode: false,
          schema: {
            type: 'object',
            properties: {
              role: { type: 'string' },
              active: { type: 'boolean' },
            },
          },
        },
        {
          name: 'sort',
          in: 'query',
          style: 'form',
          explode: false,
          schema: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              descending: { type: 'boolean' },
            },
          },
        },
      ],
      [
        {
          role: 'admin',
          active: true,
        },
        {
          field: 'name',
          descending: false,
        },
      ],
    );

    expect(request.params.get('filter')).toBe('role,admin,active,true');

    expect(request.params.get('sort')).toBe('field,name,descending,false');

    expect(request.params.toString()).toBe(
      'filter=role,admin,active,true&sort=field,name,descending,false',
    );
  });

  it('serializes deepObject keys and special characters', (): void => {
    const request: CapturedRequest = executeGeneratedQuery(
      [
        {
          name: 'filter',
          in: 'query',
          style: 'deepObject',
          explode: true,
          schema: {
            type: 'object',
            properties: {
              role: { type: 'string' },
              'first name': { type: 'string' },
            },
          },
        },
      ],
      [
        {
          role: 'a&b',
          'first name': 'López',
        },
      ],
    );

    expect(request.params.get('filter[role]')).toBe('a&b');

    expect(request.params.get('filter[first name]')).toBe('López');

    expect(request.params.toString()).toContain('filter%5Brole%5D=a%26b');

    expect(request.params.toString()).toContain(
      'filter%5Bfirst%20name%5D=L%C3%B3pez',
    );
  });

  it('omits undefined, null and empty optional values', (): void => {
    const request: CapturedRequest = executeGeneratedQuery(
      [
        {
          name: 'colors',
          in: 'query',
          schema: {
            type: 'array',
            nullable: true,
            items: { type: 'string' },
          },
        },
        {
          name: 'filter',
          in: 'query',
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

    expect(request.params.keys()).toEqual([]);
    expect(request.params.toString()).toBe('');
  });

  it('omits null and undefined properties in exploded objects', (): void => {
    const request: CapturedRequest = executeGeneratedQuery(
      [
        {
          name: 'filter',
          in: 'query',
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

    expect(request.params.get('role')).toBe('editor');
    expect(request.params.has('active')).toBe(false);

    expect(request.params.toString()).toBe('role=editor');
  });
});
