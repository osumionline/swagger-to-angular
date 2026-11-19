import { describe, expect, it } from 'vitest';

import generateMethods from '../src/generator/methods.js';
import createOperationName from '../src/generator/operation-name.js';
import type { SwaggerPaths } from '../src/generator/types.js';

describe('OpenAPI operation names', (): void => {
  it('preserves ordinary operation identifiers', (): void => {
    const usedNames: Set<string> = new Set<string>();

    expect(
      createOperationName('getUser', 'get', 'basePathApi', usedNames),
    ).toBe('getUser');

    expect(
      createOperationName('createUser', 'post', 'basePathApi', usedNames),
    ).toBe('createUser');

    expect(usedNames.has('getUser')).toBe(true);
    expect(usedNames.has('createUser')).toBe(true);
  });

  it('encodes operation identifiers containing special characters', (): void => {
    const usedNames: Set<string> = new Set<string>();

    expect(
      createOperationName('get-user', 'get', 'basePathApi', usedNames),
    ).toBe('OpenApiSchema_get_2d_user');

    expect(
      createOperationName('list users', 'get', 'basePathApi', usedNames),
    ).toBe('OpenApiSchema_list_20_users');

    expect(
      createOperationName('123Action', 'post', 'basePathApi', usedNames),
    ).toBe('OpenApiSchema_123Action');
  });

  it('resolves duplicate operation names with HTTP method suffixes', (): void => {
    const usedNames: Set<string> = new Set<string>();

    expect(
      createOperationName('getUser', 'get', 'basePathApi', usedNames),
    ).toBe('getUser');

    expect(
      createOperationName('getUser', 'post', 'basePathApi', usedNames),
    ).toBe('getUser_post');

    expect(
      createOperationName('getUser', 'post', 'basePathApi', usedNames),
    ).toBe('getUser_post_2');
  });

  it('avoids conflicts with generated service members', (): void => {
    const usedNames: Set<string> = new Set<string>();

    expect(createOperationName('http', 'get', 'basePathApi', usedNames)).toBe(
      'http_get',
    );

    expect(
      createOperationName('handleError', 'delete', 'basePathApi', usedNames),
    ).toBe('handleError_delete');

    expect(
      createOperationName('basePathApi', 'post', 'basePathApi', usedNames),
    ).toBe('basePathApi_post');

    expect(
      createOperationName('constructor', 'get', 'basePathApi', usedNames),
    ).toBe('OpenApiSchema_constructor');

    expect(
      createOperationName('toString', 'get', 'basePathApi', usedNames),
    ).toBe('toString_get');
  });

  it('generates distinct methods for duplicate IDs across HTTP verbs', (): void => {
    const paths: SwaggerPaths = {
      '/v1/users': {
        get: {
          operationId: 'findUsers',
        },
        post: {
          operationId: 'findUsers',
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('findUsers(): Observable<any>');

    expect(content).toContain('findUsers_post(): Observable<any>');

    expect(content).toContain('.get<any>(`${this.basePathApi}/v1/users`, {})');

    expect(content).toContain(
      '.post<any>(`${this.basePathApi}/v1/users`, null, {})',
    );
  });

  it('resolves repeated IDs across different paths', (): void => {
    const paths: SwaggerPaths = {
      '/v1/items': {
        get: {
          operationId: 'getItems',
        },
      },
      '/v1/archived-items': {
        get: {
          operationId: 'getItems',
        },
      },
      '/v1/other-items': {
        get: {
          operationId: 'getItems',
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('getItems(): Observable<any>');

    expect(content).toContain('getItems_get(): Observable<any>');

    expect(content).toContain('getItems_get_2(): Observable<any>');

    expect(content).toContain('/v1/items');
    expect(content).toContain('/v1/archived-items');
    expect(content).toContain('/v1/other-items');
  });

  it('preserves fallback operation IDs when not provided', (): void => {
    const paths: SwaggerPaths = {
      '/v1/ping': {
        get: {},
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('get__v1_ping(): Observable<any>');

    expect(content).toContain(
      'Auto-generated method for operationId: get__v1_ping',
    );
  });

  it('keeps operation comments valid with dangerous characters', (): void => {
    const paths: SwaggerPaths = {
      '/v1/test': {
        get: {
          operationId: 'get*/thing',
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'OpenApiSchema_get_2a__2f_thing(): Observable<any>',
    );

    expect(content).toContain(
      'Auto-generated method for operationId: get* /thing',
    );

    expect(content).not.toContain('operationId: get*/thing');
  });
});
