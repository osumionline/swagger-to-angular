import { describe, expect, it } from 'vitest';

import generateInterfaces from '../src/generator/interfaces.js';
import generateMethods from '../src/generator/methods.js';
import { mapSwaggerSchemaToTs } from '../src/generator/schema-mapper.js';
import type { SwaggerPaths, SwaggerSchema } from '../src/generator/types.js';

describe('OpenAPI array type mapping', (): void => {
  it('preserves arrays of simple types', (): void => {
    const schema: SwaggerSchema = {
      type: 'array',
      items: { type: 'integer' },
    };

    expect(mapSwaggerSchemaToTs(schema)).toBe('number[]');
  });

  it('groups nullable array elements', (): void => {
    const schema: SwaggerSchema = {
      type: 'array',
      items: {
        type: 'string',
        nullable: true,
      },
    };

    expect(mapSwaggerSchemaToTs(schema)).toBe('(string | null)[]');
  });

  it('distinguishes nullable arrays from nullable elements', (): void => {
    const schema: SwaggerSchema = {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    };

    expect(mapSwaggerSchemaToTs(schema)).toBe('string[] | null');
  });

  it('supports nullable arrays containing nullable elements', (): void => {
    const schema: SwaggerSchema = {
      type: 'array',
      nullable: true,
      items: {
        type: 'string',
        nullable: true,
      },
    };

    expect(mapSwaggerSchemaToTs(schema)).toBe('(string | null)[] | null');
  });

  it('groups oneOf array elements', (): void => {
    const schema: SwaggerSchema = {
      type: 'array',
      items: {
        oneOf: [
          { $ref: '#/components/schemas/Cat' },
          { $ref: '#/components/schemas/Dog' },
        ],
      },
    };

    expect(mapSwaggerSchemaToTs(schema)).toBe('(Cat | Dog)[]');
  });

  it('groups anyOf array elements', (): void => {
    const schema: SwaggerSchema = {
      type: 'array',
      items: {
        anyOf: [{ type: 'string' }, { type: 'integer' }],
      },
    };

    expect(mapSwaggerSchemaToTs(schema)).toBe('(string | number)[]');
  });

  it('groups allOf array elements', (): void => {
    const schema: SwaggerSchema = {
      type: 'array',
      items: {
        allOf: [
          { $ref: '#/components/schemas/Identifiable' },
          { $ref: '#/components/schemas/Timestamped' },
        ],
      },
    };

    expect(mapSwaggerSchemaToTs(schema)).toBe('(Identifiable & Timestamped)[]');
  });

  it('groups enum array elements', (): void => {
    const schema: SwaggerSchema = {
      type: 'array',
      items: {
        type: 'string',
        enum: ['pending', 'completed'],
      },
    };

    expect(mapSwaggerSchemaToTs(schema)).toBe('("pending" | "completed")[]');
  });

  it('supports nested arrays with nullable elements', (): void => {
    const schema: SwaggerSchema = {
      type: 'array',
      items: {
        type: 'array',
        items: {
          type: 'string',
          nullable: true,
        },
      },
    };

    expect(mapSwaggerSchemaToTs(schema)).toBe('(string | null)[][]');
  });

  it('generates correct array types in interfaces', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      Result: {
        type: 'object',
        required: ['values'],
        properties: {
          values: {
            type: 'array',
            items: {
              type: 'integer',
              nullable: true,
            },
          },
          states: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['active', 'inactive'],
            },
          },
        },
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain('values: (number | null)[];');

    expect(content).toContain('states?: ("active" | "inactive")[];');
  });

  it('generates correct array response types in methods', (): void => {
    const paths: SwaggerPaths = {
      '/v1/animals': {
        get: {
          operationId: 'getAnimals',
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      oneOf: [
                        { $ref: '#/components/schemas/Cat' },
                        { $ref: '#/components/schemas/Dog' },
                      ],
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

    expect(content).toContain('getAnimals(): Observable<(Cat | Dog)[]>');

    expect(content).toContain(
      '.get<(Cat | Dog)[]>(`${this.basePathApi}/v1/animals`, {})',
    );
  });
});
