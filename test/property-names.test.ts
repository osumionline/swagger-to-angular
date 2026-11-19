import { describe, expect, it } from 'vitest';

import generateInterfaces from '../src/generator/interfaces.js';
import generateMethods from '../src/generator/methods.js';
import formatPropertyName from '../src/generator/property-name.js';
import { mapSwaggerSchemaToTs } from '../src/generator/schema-mapper.js';

import type { SwaggerPaths, SwaggerSchema } from '../src/generator/types.js';

describe('OpenAPI property names', (): void => {
  it('preserves valid simple identifiers', (): void => {
    expect(formatPropertyName('userId')).toBe('userId');
    expect(formatPropertyName('user_id')).toBe('user_id');
    expect(formatPropertyName('$value')).toBe('$value');
    expect(formatPropertyName('_private')).toBe('_private');
    expect(formatPropertyName('default')).toBe('default');
  });

  it('quotes names that are not simple identifiers', (): void => {
    expect(formatPropertyName('first-name')).toBe('"first-name"');
    expect(formatPropertyName('first name')).toBe('"first name"');
    expect(formatPropertyName('123code')).toBe('"123code"');
    expect(formatPropertyName('content.type')).toBe('"content.type"');
    expect(formatPropertyName('')).toBe('""');
    expect(formatPropertyName('nombre-área')).toBe('"nombre-área"');
  });

  it('escapes quotation marks and special characters', (): void => {
    expect(formatPropertyName('say"hello')).toBe('"say\\"hello"');

    expect(formatPropertyName('line\nbreak')).toBe('"line\\nbreak"');

    expect(formatPropertyName('a\\b')).toBe('"a\\\\b"');
  });

  it('generates valid names for interface properties', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      Headers: {
        type: 'object',
        required: ['content-type', 'first name', 'userId'],
        properties: {
          'content-type': { type: 'string' },
          'first name': { type: 'string' },
          userId: { type: 'integer' },
          '2fa-enabled': { type: 'boolean' },
        },
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain('export interface Headers {');
    expect(content).toContain('  "content-type": string;');
    expect(content).toContain('  "first name": string;');
    expect(content).toContain('  userId: number;');
    expect(content).toContain('  "2fa-enabled"?: boolean;');

    expect(content).not.toContain('  content-type: string;');
    expect(content).not.toContain('  first name: string;');
  });

  it('escapes special names in generated interfaces', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      Example: {
        type: 'object',
        properties: {
          'say"hello': { type: 'string' },
          'line\nbreak': { type: 'integer' },
        },
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain('  "say\\"hello"?: string;');
    expect(content).toContain('  "line\\nbreak"?: number;');
  });

  it('generates correct names in nested object types', (): void => {
    const schema: SwaggerSchema = {
      type: 'object',
      required: ['first-name'],
      properties: {
        'first-name': { type: 'string' },
        'space key': {
          type: 'object',
          required: ['x-id'],
          properties: {
            'x-id': { type: 'integer' },
          },
        },
      },
    };

    const content: string = mapSwaggerSchemaToTs(schema);

    expect(content).toBe(
      '{ "first-name": string; "space key"?: { "x-id": number; }; }',
    );
  });

  it('generates correct names in arrays of inline objects', (): void => {
    const schema: SwaggerSchema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          'x-id': { type: 'integer' },
        },
      },
    };

    const content: string = mapSwaggerSchemaToTs(schema);

    expect(content).toBe('{ "x-id"?: number; }[]');
  });

  it('generates correct property names in HTTP bodies and responses', (): void => {
    const paths: SwaggerPaths = {
      '/v1/example': {
        post: {
          operationId: 'sendData',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['content-type'],
                  properties: {
                    'content-type': { type: 'string' },
                    'x-request-id': { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['user-id'],
                    properties: {
                      'user-id': { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain(
      'sendData(payload: { "content-type": string; "x-request-id"?: string; }): Observable<{ "user-id": number; }>',
    );

    expect(content).toContain(
      '.post<{ "user-id": number; }>(`${this.basePathApi}/v1/example`, payload, {})',
    );
  });
});
