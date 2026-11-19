import { describe, expect, it } from 'vitest';

import generateEncodedFormQueryCode from '../src/generator/form-query-serializer.js';
import generateMethods from '../src/generator/methods.js';
import generateQueryParameterCode from '../src/generator/query-serializer.js';
import validateQueryParameterShape from '../src/generator/query-shape-validator.js';

import type { SwaggerParameter, SwaggerPaths } from '../src/generator/types.js';

describe('OpenAPI query shape validation', (): void => {
  it('rejects nested objects with form explode false', (): void => {
    const parameter: SwaggerParameter = {
      name: 'filter',
      in: 'query',
      style: 'form',
      explode: false,
      schema: {
        type: 'object',
        properties: {
          status: {
            type: 'object',
            properties: {
              code: { type: 'integer' },
            },
          },
        },
      },
    };

    expect((): string | null => {
      return generateEncodedFormQueryCode(parameter, 'filter', "'filter'");
    }).toThrow(/Unsupported nested query object parameter: filter/);
  });

  it('rejects nested objects with form explode true', (): void => {
    const parameter: SwaggerParameter = {
      name: 'filter',
      in: 'query',
      style: 'form',
      explode: true,
      schema: {
        type: 'object',
        properties: {
          status: {
            type: 'object',
            properties: {
              code: { type: 'integer' },
            },
          },
        },
      },
    };

    expect((): string => {
      return generateQueryParameterCode(parameter, 'filter', "'filter'");
    }).toThrow(/Unsupported nested query object parameter: filter/);
  });

  it('rejects arrays inside deepObject properties', (): void => {
    const parameter: SwaggerParameter = {
      name: 'filters',
      in: 'query',
      style: 'deepObject',
      explode: true,
      schema: {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    };

    expect((): string => {
      return generateQueryParameterCode(parameter, 'filters', "'filters'");
    }).toThrow(/Unsupported nested query object parameter: filters/);
  });

  it('rejects nested dictionary values with explode false', (): void => {
    const parameter: SwaggerParameter = {
      name: 'filters',
      in: 'query',
      style: 'form',
      explode: false,
      schema: {
        type: 'object',
        additionalProperties: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    };

    expect((): string | null => {
      return generateEncodedFormQueryCode(parameter, 'filters', "'filters'");
    }).toThrow(/Unsupported nested query object parameter: filters/);
  });

  it('rejects composed property schemas', (): void => {
    const parameter: SwaggerParameter = {
      name: 'filter',
      in: 'query',
      schema: {
        type: 'object',
        properties: {
          value: {
            oneOf: [{ type: 'string' }, { type: 'integer' }],
          },
        },
      },
    };

    expect((): void => {
      validateQueryParameterShape(parameter);
    }).toThrow(/Unsupported nested query object parameter: filter/);
  });

  it('rejects object elements in default form arrays', (): void => {
    const parameter: SwaggerParameter = {
      name: 'items',
      in: 'query',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
          },
        },
      },
    };

    expect((): string => {
      return generateQueryParameterCode(parameter, 'items', "'items'");
    }).toThrow(/Unsupported nested query array parameter: items/);
  });

  it('rejects nested arrays in pipeDelimited parameters', (): void => {
    const parameter: SwaggerParameter = {
      name: 'groups',
      in: 'query',
      style: 'pipeDelimited',
      schema: {
        type: 'array',
        items: {
          type: 'array',
          items: { type: 'integer' },
        },
      },
    };

    expect((): string | null => {
      return generateEncodedFormQueryCode(parameter, 'groups', "'groups'");
    }).toThrow(/Unsupported nested query array parameter: groups/);
  });

  it('preserves valid scalar arrays', (): void => {
    const parameter: SwaggerParameter = {
      name: 'ids',
      in: 'query',
      style: 'form',
      explode: false,
      schema: {
        type: 'array',
        items: { type: 'integer' },
      },
    };

    expect((): void => {
      validateQueryParameterShape(parameter);
    }).not.toThrow();

    const content: string | null = generateEncodedFormQueryCode(
      parameter,
      'ids',
      "'ids'",
    );

    expect(content).toContain(
      'ids.map((value): string => encodeURIComponent(String(value)))',
    );
  });

  it('preserves valid flat object dictionaries', (): void => {
    const parameter: SwaggerParameter = {
      name: 'scores',
      in: 'query',
      style: 'form',
      explode: false,
      schema: {
        type: 'object',
        additionalProperties: { type: 'integer' },
      },
    };

    expect((): void => {
      validateQueryParameterShape(parameter);
    }).not.toThrow();

    const content: string | null = generateEncodedFormQueryCode(
      parameter,
      'scores',
      "'scores'",
    );

    expect(content).toContain('Object.entries(scores)');
  });

  it('rejects nested form objects through generateMethods', (): void => {
    const paths: SwaggerPaths = {
      '/v1/search': {
        get: {
          operationId: 'search',
          parameters: [
            {
              name: 'filter',
              in: 'query',
              style: 'form',
              explode: false,
              schema: {
                type: 'object',
                properties: {
                  status: {
                    type: 'object',
                    properties: {
                      code: { type: 'integer' },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    };

    expect((): string => {
      return generateMethods(paths, 'basePathApi');
    }).toThrow(/Unsupported nested query object parameter: filter/);
  });
});
