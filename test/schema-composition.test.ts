import { describe, expect, it } from 'vitest';

import generateInterfaces from '../src/generator/interfaces.js';
import generateMethods from '../src/generator/methods.js';
import { mapSwaggerSchemaToTs } from '../src/generator/schema-mapper.js';

import type { SwaggerPaths, SwaggerSchema } from '../src/generator/types.js';

/**
 * Creates an OpenAPI schema reference.
 *
 * @param name Name of the referenced schema.
 * @returns Schema containing the corresponding $ref.
 */
function schemaRef(name: string): SwaggerSchema {
  return {
    $ref: `#/components/schemas/${name}`,
  };
}

describe('OpenAPI schema composition precedence', (): void => {
  it('preserves simple oneOf unions', (): void => {
    const schema: SwaggerSchema = {
      oneOf: [schemaRef('A'), schemaRef('B')],
    };

    expect(mapSwaggerSchemaToTs(schema)).toBe('A | B');
  });

  it('preserves simple allOf intersections', (): void => {
    const schema: SwaggerSchema = {
      allOf: [schemaRef('A'), schemaRef('B')],
    };

    expect(mapSwaggerSchemaToTs(schema)).toBe('A & B');
  });

  it('groups a oneOf union inside allOf', (): void => {
    const schema: SwaggerSchema = {
      allOf: [
        {
          oneOf: [schemaRef('A'), schemaRef('B')],
        },
        schemaRef('C'),
      ],
    };

    expect(mapSwaggerSchemaToTs(schema)).toBe('(A | B) & C');
  });

  it('groups an anyOf union inside allOf', (): void => {
    const schema: SwaggerSchema = {
      allOf: [
        schemaRef('A'),
        {
          anyOf: [schemaRef('B'), schemaRef('C')],
        },
      ],
    };

    expect(mapSwaggerSchemaToTs(schema)).toBe('A & (B | C)');
  });

  it('groups an allOf intersection inside oneOf', (): void => {
    const schema: SwaggerSchema = {
      oneOf: [
        {
          allOf: [schemaRef('A'), schemaRef('B')],
        },
        schemaRef('C'),
      ],
    };

    expect(mapSwaggerSchemaToTs(schema)).toBe('(A & B) | C');
  });

  it('groups nullable types inside allOf', (): void => {
    const schema: SwaggerSchema = {
      allOf: [
        {
          type: 'string',
          nullable: true,
        },
        schemaRef('A'),
      ],
    };

    expect(mapSwaggerSchemaToTs(schema)).toBe('(string | null) & A');
  });

  it('groups enum unions inside allOf', (): void => {
    const schema: SwaggerSchema = {
      allOf: [
        {
          type: 'string',
          enum: ['active', 'inactive'],
        },
        schemaRef('Status'),
      ],
    };

    expect(mapSwaggerSchemaToTs(schema)).toBe(
      '("active" | "inactive") & Status',
    );
  });

  it('handles multiple nested compositions', (): void => {
    const schema: SwaggerSchema = {
      allOf: [
        {
          oneOf: [schemaRef('A'), schemaRef('B')],
        },
        {
          anyOf: [schemaRef('C'), schemaRef('D')],
        },
      ],
    };

    expect(mapSwaggerSchemaToTs(schema)).toBe('(A | B) & (C | D)');
  });

  it('preserves precedence in arrays and interfaces', (): void => {
    const composedSchema: SwaggerSchema = {
      allOf: [
        {
          oneOf: [schemaRef('A'), schemaRef('B')],
        },
        schemaRef('C'),
      ],
    };

    const arraySchema: SwaggerSchema = {
      type: 'array',
      items: composedSchema,
    };

    expect(mapSwaggerSchemaToTs(arraySchema)).toBe('((A | B) & C)[]');

    const schemas: Record<string, SwaggerSchema> = {
      Result: {
        type: 'object',
        required: ['value'],
        properties: {
          value: composedSchema,
          values: arraySchema,
        },
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain('value: (A | B) & C;');

    expect(content).toContain('values?: ((A | B) & C)[];');
  });

  it('generates correct response types in HTTP methods', (): void => {
    const paths: SwaggerPaths = {
      '/v1/variant': {
        get: {
          operationId: 'getVariant',
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      {
                        oneOf: [schemaRef('A'), schemaRef('B')],
                      },
                      schemaRef('C'),
                    ],
                  },
                },
              },
            },
          },
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('getVariant(): Observable<(A | B) & C>');

    expect(content).toContain(
      '.get<(A | B) & C>(`${this.basePathApi}/v1/variant`, {})',
    );
  });
});
