import { describe, expect, it } from 'vitest';

import generateMethods from '../src/generator/methods.js';
import mergeParameters from '../src/generator/parameters.js';
import type { SwaggerParameter, SwaggerPaths } from '../src/generator/types.js';

describe('OpenAPI path-level parameters', (): void => {
  it('inherits path parameters in multiple operations', (): void => {
    const paths: SwaggerPaths = {
      '/v1/users/{id}': {
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        get: {
          operationId: 'getUser',
        },
        delete: {
          operationId: 'deleteUser',
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('getUser(id: number): Observable<any>');

    expect(content).toContain('deleteUser(id: number): Observable<any>');

    expect(content).toContain(
      '.get<any>(`${this.basePathApi}/v1/users/${encodeURIComponent(String(id))}`, {})',
    );

    expect(content).toContain(
      '.delete<any>(`${this.basePathApi}/v1/users/${encodeURIComponent(String(id))}`, {})',
    );

    expect(content).not.toContain('parameters(');
  });

  it('inherits shared query parameters', (): void => {
    const paths: SwaggerPaths = {
      '/v1/users': {
        parameters: [
          {
            name: 'locale',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
        ],
        get: {
          operationId: 'listUsers',
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

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'listUsers(locale: string, page?: number): Observable<any>',
    );

    expect(content).toContain("params = params.set('locale', String(locale));");

    expect(content).toContain("params = params.set('page', String(page));");
  });

  it('allows operation parameters to override inherited parameters', (): void => {
    const paths: SwaggerPaths = {
      '/v1/users/{id}': {
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        get: {
          operationId: 'getUser',
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

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('getUser(id: string): Observable<any>');

    expect(content).not.toContain('id: number');

    expect(content).toContain('/v1/users/${encodeURIComponent(String(id))}');
  });

  it('does not duplicate overridden query parameters', (): void => {
    const paths: SwaggerPaths = {
      '/v1/users': {
        parameters: [
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'string' },
          },
        ],
        get: {
          operationId: 'listUsers',
          parameters: [
            {
              name: 'limit',
              in: 'query',
              required: true,
              schema: { type: 'integer' },
            },
          ],
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('listUsers(limit: number): Observable<any>');

    expect(content).not.toContain('limit?: string');

    const occurrences: RegExpMatchArray | null = content.match(
      /params = params\.set\('limit'/g,
    );

    expect(occurrences).toHaveLength(1);
  });

  it('overrides only matching name and location', (): void => {
    const inherited: SwaggerParameter[] = [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'integer' },
      },
      {
        name: 'locale',
        in: 'query',
        schema: { type: 'string' },
      },
    ];

    const operation: SwaggerParameter[] = [
      {
        name: 'id',
        in: 'query',
        schema: { type: 'string' },
      },
      {
        name: 'locale',
        in: 'query',
        required: true,
        schema: { type: 'string' },
      },
    ];

    const result: SwaggerParameter[] = mergeParameters(inherited, operation);

    expect(result).toHaveLength(3);

    expect(result[0]).toEqual(inherited[0]);
    expect(result[1]).toEqual(operation[1]);
    expect(result[2]).toEqual(operation[0]);
  });

  it('ignores metadata and supports HEAD and OPTIONS', (): void => {
    const paths: SwaggerPaths = {
      '/v1/status': {
        summary: 'Status endpoint',
        description: 'Operations for checking status',
        servers: [{ url: 'https://example.com/api' }],
        'x-operation-note': 'Not an HTTP method',
        head: {
          operationId: 'headStatus',
        },
        options: {
          operationId: 'optionsStatus',
        },
        trace: {
          operationId: 'traceStatus',
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('headStatus(): Observable<any>');

    expect(content).toContain(
      '.head<any>(`${this.basePathApi}/v1/status`, {})',
    );

    expect(content).toContain('optionsStatus(): Observable<any>');

    expect(content).toContain(
      '.options<any>(`${this.basePathApi}/v1/status`, {})',
    );

    expect(content).not.toContain('traceStatus(');
    expect(content).not.toContain('summary(');
    expect(content).not.toContain('description(');
    expect(content).not.toContain('servers(');
    expect(content).not.toContain('x-operation-note(');
  });

  it('generates no methods for paths containing only metadata', (): void => {
    const paths: SwaggerPaths = {
      '/v1/users/{id}': {
        summary: 'User operations',
        description: 'User path metadata',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toBe('');
  });
});
