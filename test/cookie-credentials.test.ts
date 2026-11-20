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
  headers: Record<string, string>;
  params: HttpParams;
  withCredentials: boolean | undefined;
}

/**
 * Runtime representation of the generated service.
 */
interface RuntimeService {
  search(...args: unknown[]): unknown;
}

/**
 * Generates an HTTP method from OpenAPI parameters.
 *
 * @param parameters Parameter definitions.
 * @returns Generated TypeScript method source.
 */
function generateTestMethod(parameters: SwaggerParameter[]): string {
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

  return generateMethods(paths, 'basePathApi');
}

/**
 * Generates and executes an OpenAPI GET method.
 *
 * Captures the options passed to HttpClient without
 * performing a network request.
 *
 * This tests withCredentials, not the browser's actual
 * cookie storage or cookie transmission policies.
 *
 * @param parameters OpenAPI parameter definitions.
 * @param args Arguments supplied to the generated method.
 * @returns Captured HTTP request information.
 */
function executeGeneratedRequest(
  parameters: SwaggerParameter[],
  args: unknown[],
): CapturedRequest {
  const methods: string = generateTestMethod(parameters);

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
        withCredentials?: boolean;
      },
    ): Observable<unknown> {
      state.request = {
        url,
        headers: options.headers ?? {},
        params: options.params ?? new HttpParams(),
        withCredentials: options.withCredentials,
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

describe('Browser-managed OpenAPI cookie parameters', (): void => {
  it('generates withCredentials without a cookie argument', (): void => {
    const content: string = generateTestMethod([
      {
        name: 'sessionId',
        in: 'cookie',
        required: true,
        schema: { type: 'string' },
      },
    ]);

    expect(content).toContain('search(): Observable<boolean>');

    expect(content).toContain(
      'const options = {\n      withCredentials: true\n    };',
    );

    expect(content).toContain('Cookie parameters are managed by the browser.');

    expect(content).not.toContain("headers['Cookie']");
    expect(content).not.toContain('sessionId: string');
  });

  it('enables credentials in an actual generated request', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'sessionId',
          in: 'cookie',
          required: true,
          schema: { type: 'string' },
        },
      ],
      [],
    );

    expect(request.url).toBe('https://example.com/api/v1/items');

    expect(request.withCredentials).toBe(true);
    expect(Object.keys(request.headers)).toHaveLength(0);
    expect(request.params.toString()).toBe('');
  });

  it('combines cookies with headers and query parameters', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'sessionId',
          in: 'cookie',
          required: true,
          schema: { type: 'string' },
        },
        {
          name: 'X-Trace',
          in: 'header',
          required: true,
          schema: { type: 'string' },
        },
        {
          name: 'page',
          in: 'query',
          schema: { type: 'integer' },
        },
      ],
      ['trace-123', 2],
    );

    expect(request.withCredentials).toBe(true);
    expect(request.headers['X-Trace']).toBe('trace-123');
    expect(request.params.get('page')).toBe('2');
    expect(request.headers.Cookie).toBeUndefined();
  });

  it('does not enable credentials for ordinary operations', (): void => {
    const request: CapturedRequest = executeGeneratedRequest(
      [
        {
          name: 'page',
          in: 'query',
          schema: { type: 'integer' },
        },
      ],
      [2],
    );

    expect(request.withCredentials).toBeUndefined();
    expect(request.params.get('page')).toBe('2');

    const content: string = generateTestMethod([]);

    expect(content).not.toContain('withCredentials: true');
    expect(content).not.toContain(
      'Cookie parameters are managed by the browser.',
    );
  });

  it('enables credentials only once for multiple cookies', (): void => {
    const content: string = generateTestMethod([
      {
        name: 'sessionId',
        in: 'cookie',
        required: true,
        schema: { type: 'string' },
      },
      {
        name: 'preferences',
        in: 'cookie',
        schema: { type: 'string' },
      },
    ]);

    const occurrences: RegExpMatchArray | null = content.match(
      /withCredentials: true/g,
    );

    expect(occurrences).toHaveLength(1);

    expect(content).toContain('search(): Observable<boolean>');
  });

  it('supports inherited cookie parameters', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        parameters: [
          {
            name: 'sessionId',
            in: 'cookie',
            required: true,
            schema: { type: 'string' },
          },
        ],
        get: {
          operationId: 'getItems',
        },
        delete: {
          operationId: 'deleteItems',
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('getItems(): Observable<any>');
    expect(content).toContain('deleteItems(): Observable<any>');

    const occurrences: RegExpMatchArray | null = content.match(
      /withCredentials: true/g,
    );

    expect(occurrences).toHaveLength(2);

    expect(content).not.toContain("headers['Cookie']");
  });

  it('preserves credentials in POST requests with a body', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        post: {
          operationId: 'createItem',
          parameters: [
            {
              name: 'sessionId',
              in: 'cookie',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'string' },
              },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('createItem(payload: string): Observable<any>');

    expect(content).toContain('withCredentials: true');

    expect(content).toContain(
      '.post<any>(`${this.basePathApi}/v1/items`, payload, options)',
    );
  });

  it('combines credentials with binary response options', (): void => {
    const paths: SwaggerPaths = {
      '/v1/reports': {
        get: {
          operationId: 'getReport',
          parameters: [
            {
              name: 'sessionId',
              in: 'cookie',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              content: {
                'application/pdf': {},
              },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('getReport(): Observable<ArrayBuffer>');

    expect(content).toContain("responseType: 'arraybuffer' as const");

    expect(content).toContain('withCredentials: true');

    expect(content).toContain(
      '.get(`${this.basePathApi}/v1/reports`, options)',
    );
  });
});
