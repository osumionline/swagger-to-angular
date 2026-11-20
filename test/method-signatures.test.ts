import { describe, expect, it } from 'vitest';

import generateMethods from '../src/generator/methods.js';
import type { SwaggerPaths } from '../src/generator/types.js';

describe('generateMethods parameter signatures', (): void => {
  it('places a required payload before an optional query parameter', (): void => {
    const paths: SwaggerPaths = {
      '/v1/users': {
        post: {
          operationId: 'createUser',
          parameters: [
            {
              name: 'search',
              in: 'query',
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/User',
                },
              },
            },
          },
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

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'createUser(payload: User, search?: string): Observable<boolean>',
    );

    expect(content).not.toContain('createUser(search?: string, payload: User)');

    expect(content).toContain("params = params.set('search', String(search));");

    expect(content).toContain(
      '.post<boolean>(`${this.basePathApi}/v1/users`, payload, options)',
    );
  });

  it('respects required query parameters', (): void => {
    const paths: SwaggerPaths = {
      '/v1/users': {
        get: {
          operationId: 'listUsers',
          parameters: [
            {
              name: 'search',
              in: 'query',
              schema: { type: 'string' },
            },
            {
              name: 'page',
              in: 'query',
              required: true,
              schema: { type: 'integer' },
            },
            {
              name: 'sort',
              in: 'query',
              schema: { type: 'string' },
            },
            {
              name: 'active',
              in: 'query',
              required: true,
              schema: { type: 'boolean' },
            },
          ],
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: { type: 'string' },
                },
              },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'listUsers(page: number, active: boolean, search?: string, sort?: string): Observable<string>',
    );

    expect(content).toContain("params = params.set('page', String(page));");

    expect(content).toContain("params = params.set('active', String(active));");
  });

  it('combines required path and payload arguments with optional queries', (): void => {
    const paths: SwaggerPaths = {
      '/v1/users/{id}': {
        put: {
          operationId: 'updateUser',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
            {
              name: 'notify',
              in: 'query',
              schema: { type: 'boolean' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                  },
                },
              },
            },
          },
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

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'updateUser(id: number, payload: { name: string; }, notify?: boolean): Observable<boolean>',
    );

    expect(content).toContain(
      '.put<boolean>(`${this.basePathApi}/v1/users/${encodeURIComponent(String(id))}`, payload, options)',
    );
  });

  it('places an optional payload after required query arguments', (): void => {
    const paths: SwaggerPaths = {
      '/v1/settings': {
        patch: {
          operationId: 'updateSettings',
          parameters: [
            {
              name: 'force',
              in: 'query',
              required: true,
              schema: { type: 'boolean' },
            },
          ],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { type: 'string' },
              },
            },
          },
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

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'updateSettings(force: boolean, payload?: string): Observable<boolean>',
    );

    expect(content).toContain(
      '.patch<boolean>(`${this.basePathApi}/v1/settings`, payload, options)',
    );
  });

  it('preserves the order of optional parameters', (): void => {
    const paths: SwaggerPaths = {
      '/v1/users': {
        get: {
          operationId: 'findUsers',
          parameters: [
            {
              name: 'search',
              in: 'query',
              schema: { type: 'string' },
            },
            {
              name: 'sort',
              in: 'query',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: { type: 'string' },
                },
              },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'findUsers(search?: string, sort?: string): Observable<string>',
    );
  });

  it('handles required path, query and payload arguments together', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items/{id}': {
        post: {
          operationId: 'saveItem',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
            {
              name: 'label',
              in: 'query',
              schema: { type: 'string' },
            },
            {
              name: 'version',
              in: 'query',
              required: true,
              schema: { type: 'integer' },
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

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'saveItem(id: number, version: number, payload: string, label?: string): Observable<boolean>',
    );

    expect(content).toContain('/v1/items/${encodeURIComponent(String(id))}');

    expect(content).toContain(
      "params = params.set('version', String(version));",
    );

    expect(content).toContain("params = params.set('label', String(label));");
  });
});
