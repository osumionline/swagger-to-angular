import { describe, expect, it } from 'vitest';

import generateMethods from '../src/generator/methods.js';
import getResponseInfo from '../src/generator/response-info.js';
import resolveResponseReference from '../src/generator/response-reference-resolver.js';
import type {
  SwaggerOperation,
  SwaggerPaths,
  SwaggerResponse,
  SwaggerResponseInfo,
  SwaggerResponseOrReference,
} from '../src/generator/types.js';

/**
 * Creates a single successful response using a component reference.
 *
 * @param ref Local response reference to use.
 * @param statusCode HTTP success status (or 2XX range).
 * @returns OpenAPI operation with a referenced response.
 */
function createReferencedOperation(
  ref: string,
  statusCode: string = '200',
): SwaggerOperation {
  return {
    responses: {
      [statusCode]: { $ref: ref },
    },
  };
}

describe('OpenAPI components.responses references', (): void => {
  it('resolves a JSON response and retains its named schema type', (): void => {
    const definitions: Record<string, SwaggerResponseOrReference> = {
      UserResponse: {
        description: 'A user',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/User' },
          },
        },
      },
    };

    const operation: SwaggerOperation = createReferencedOperation(
      '#/components/responses/UserResponse',
      '201',
    );

    const result: SwaggerResponseInfo = getResponseInfo(operation, definitions);

    expect(result).toEqual({ returnType: 'User', isBinary: false });
    expect(operation.responses?.['201']).toEqual({
      $ref: '#/components/responses/UserResponse',
    });
  });

  it('resolves chained aliases and JSON Pointer-escaped component names', (): void => {
    const response: SwaggerResponse = {
      content: {
        'application/json': {
          schema: { type: 'array', items: { type: 'integer' } },
        },
      },
    };

    const definitions: Record<string, SwaggerResponseOrReference> = {
      'Data/Success~OK': response,
      Alias: { $ref: '#/components/responses/Data~1Success~0OK' },
    };

    expect(
      getResponseInfo(
        createReferencedOperation('#/components/responses/Alias'),
        definitions,
      ),
    ).toEqual({ returnType: 'number[]', isBinary: false });

    expect(definitions['Data/Success~OK']).toBe(response);
  });

  it('decodes URI-encoded component names', (): void => {
    const definitions: Record<string, SwaggerResponseOrReference> = {
      'Created Response': {
        content: {
          'application/json': { schema: { type: 'boolean' } },
        },
      },
    };

    expect(
      getResponseInfo(
        createReferencedOperation('#/components/responses/Created%20Response'),
        definitions,
      ).returnType,
    ).toBe('boolean');
  });

  it('prefers an explicit success status over a referenced 2XX range', (): void => {
    const definitions: Record<string, SwaggerResponseOrReference> = {
      Exact: {
        content: {
          'application/json': { schema: { type: 'string' } },
        },
      },
      Range: {
        content: {
          'application/json': { schema: { type: 'boolean' } },
        },
      },
    };

    const operation: SwaggerOperation = {
      responses: {
        '2XX': { $ref: '#/components/responses/Range' },
        '201': { $ref: '#/components/responses/Exact' },
      },
    };

    expect(getResponseInfo(operation, definitions).returnType).toBe('string');
    expect(
      getResponseInfo(
        createReferencedOperation('#/components/responses/Range', '2XX'),
        definitions,
      ).returnType,
    ).toBe('boolean');
  });

  it('generates an Angular GET method with a referenced JSON response', (): void => {
    const paths: SwaggerPaths = {
      '/v1/users': {
        get: {
          operationId: 'getUsers',
          responses: {
            '200': { $ref: '#/components/responses/Users' },
          },
        },
      },
    };
    const definitions: Record<string, SwaggerResponseOrReference> = {
      Users: {
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: { $ref: '#/components/schemas/User' },
            },
          },
        },
      },
    };

    const content: string = generateMethods(
      paths,
      'basePathApi',
      {},
      {},
      {},
      definitions,
    );

    expect(content).toContain('getUsers(): Observable<User[]>');
    expect(content).toContain(
      '.get<User[]>(`${this.basePathApi}/v1/users`, {})',
    );
  });

  it.each(['application/pdf', 'application/octet-stream'])(
    'generates ArrayBuffer and arraybuffer options for %s references',
    (mediaType: string): void => {
      const paths: SwaggerPaths = {
        '/v1/report': {
          get: {
            operationId: 'downloadReport',
            responses: {
              '200': { $ref: '#/components/responses/Report' },
            },
          },
        },
      };
      const definitions: Record<string, SwaggerResponseOrReference> = {
        Report: { content: { [mediaType]: {} } },
      };

      const content: string = generateMethods(
        paths,
        'basePathApi',
        {},
        {},
        {},
        definitions,
      );

      expect(content).toContain('downloadReport(): Observable<ArrayBuffer>');
      expect(content).toContain("responseType: 'arraybuffer' as const");
      expect(content).toContain(
        '.get(`${this.basePathApi}/v1/report`, options)',
      );
    },
  );

  it.each(['204', '205'])(
    'generates void for a referenced %s response',
    (statusCode: string): void => {
      const operation: SwaggerOperation = createReferencedOperation(
        '#/components/responses/Empty',
        statusCode,
      );
      const definitions: Record<string, SwaggerResponseOrReference> = {
        Empty: { description: 'No content' },
      };

      expect(getResponseInfo(operation, definitions)).toEqual({
        returnType: 'void',
        isBinary: false,
      });
    },
  );

  it('ignores non-success error response references', (): void => {
    const operation: SwaggerOperation = {
      responses: {
        '400': { $ref: '#/components/responses/Missing' },
      },
    };

    expect(getResponseInfo(operation)).toEqual({
      returnType: 'any',
      isBinary: false,
    });
  });

  it('rejects missing references', (): void => {
    expect((): SwaggerResponseInfo => {
      return getResponseInfo(
        createReferencedOperation('#/components/responses/Missing'),
      );
    }).toThrow('Unresolved response reference');
  });

  it.each([
    'https://example.com/spec.json#/components/responses/Ok',
    '#/components/schemas/Ok',
  ])('rejects unsupported response references: %s', (ref: string): void => {
    expect((): SwaggerResponseInfo => {
      return getResponseInfo(createReferencedOperation(ref));
    }).toThrow('Unsupported response reference');
  });

  it.each([
    '#/components/responses/',
    '#/components/responses/Ok/content',
    '#/components/responses/Bad~2Pointer',
    '#/components/responses/Bad%XX',
  ])('rejects malformed response references: %s', (ref: string): void => {
    expect((): SwaggerResponseInfo => {
      return getResponseInfo(createReferencedOperation(ref));
    }).toThrow('Invalid response reference');
  });

  it('detects circular response references', (): void => {
    const definitions: Record<string, SwaggerResponseOrReference> = {
      First: { $ref: '#/components/responses/Second' },
      Second: { $ref: '#/components/responses/First' },
    };

    expect((): SwaggerResponseInfo => {
      return getResponseInfo(
        createReferencedOperation('#/components/responses/First'),
        definitions,
      );
    }).toThrow('Circular response reference');
  });

  it('rejects invalid referenced response definitions', (): void => {
    const definitions: Record<string, SwaggerResponseOrReference> = {
      Invalid: null as unknown as SwaggerResponse,
    };

    expect((): SwaggerResponse => {
      return resolveResponseReference(
        { $ref: '#/components/responses/Invalid' },
        definitions,
      );
    }).toThrow('Invalid response definition');
  });

  it('ignores siblings on a response Reference Object', (): void => {
    const definitions: Record<string, SwaggerResponseOrReference> = {
      Answer: {
        content: {
          'application/json': { schema: { type: 'integer' } },
        },
      },
    };

    const result: SwaggerResponseInfo = getResponseInfo(
      {
        responses: {
          '200': {
            $ref: '#/components/responses/Answer',
            description: 'Reference description',
          },
        },
      },
      definitions,
    );

    expect(result.returnType).toBe('number');
  });
});
