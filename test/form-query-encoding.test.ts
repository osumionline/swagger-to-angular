import { describe, expect, it } from 'vitest';

import generateEncodedFormQueryCode from '../src/generator/form-query-serializer.js';
import generateMethods from '../src/generator/methods.js';

import type { SwaggerParameter, SwaggerPaths } from '../src/generator/types.js';

describe('Encoded form query serialization', (): void => {
  it('keeps regular scalar parameters unchanged', (): void => {
    const parameter: SwaggerParameter = {
      name: 'page',
      in: 'query',
      schema: { type: 'integer' },
    };

    expect(
      generateEncodedFormQueryCode(parameter, 'page', "'page'"),
    ).toBeNull();
  });

  it('keeps exploded arrays in Angular HttpParams', (): void => {
    const parameter: SwaggerParameter = {
      name: 'colors',
      in: 'query',
      schema: {
        type: 'array',
        items: { type: 'string' },
      },
    };

    expect(
      generateEncodedFormQueryCode(parameter, 'colors', "'colors'"),
    ).toBeNull();
  });

  it('encodes array elements separately', (): void => {
    const parameter: SwaggerParameter = {
      name: 'cities',
      in: 'query',
      style: 'form',
      explode: false,
      schema: {
        type: 'array',
        items: { type: 'string' },
      },
    };

    const content: string | null = generateEncodedFormQueryCode(
      parameter,
      'cities',
      "'cities'",
    );

    expect(content).toContain(
      'cities.map((value): string => encodeURIComponent(String(value)))',
    );

    expect(content).toContain(
      "querySegments.push(encodeURIComponent('cities') + '=' + encodedValues.join(','));",
    );
  });

  it('encodes object keys and values separately', (): void => {
    const parameter: SwaggerParameter = {
      name: 'filter',
      in: 'query',
      style: 'form',
      explode: false,
      schema: {
        type: 'object',
        properties: {
          'first name': { type: 'string' },
        },
      },
    };

    const content: string | null = generateEncodedFormQueryCode(
      parameter,
      'filter',
      "'filter'",
    );

    expect(content).toContain(
      '[encodeURIComponent(key), encodeURIComponent(String(value))]',
    );

    expect(content).toContain(
      "querySegments.push(encodeURIComponent('filter') + '=' + encodedEntries.join(','));",
    );
  });

  it('omits null and undefined object properties', (): void => {
    const parameter: SwaggerParameter = {
      name: 'filter',
      in: 'query',
      style: 'form',
      explode: false,
      schema: {
        type: 'object',
        nullable: true,
        properties: {
          status: { type: 'string' },
        },
      },
    };

    const content: string | null = generateEncodedFormQueryCode(
      parameter,
      'filter',
      "'filter'",
    );

    expect(content).toContain('if (filter !== undefined && filter !== null)');

    expect(content).toContain('value !== undefined && value !== null');

    expect(content).toContain('if (encodedEntries.length > 0)');
  });

  it('generates a URL fragment without double encoding', (): void => {
    const paths: SwaggerPaths = {
      '/v1/search': {
        get: {
          operationId: 'search',
          parameters: [
            {
              name: 'cities',
              in: 'query',
              style: 'form',
              explode: false,
              schema: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          ],
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    expect(content).toContain('const querySegments: string[] = [];');

    expect(content).toContain(
      "const encodedQuery: string = querySegments.join('&');",
    );

    expect(content).toContain('.get<any>(finalUrl, options)');

    expect(content).not.toContain("params = params.set('cities'");
  });

  it('preserves ordinary HttpParams alongside encoded forms', (): void => {
    const paths: SwaggerPaths = {
      '/v1/search': {
        get: {
          operationId: 'search',
          parameters: [
            {
              name: 'cities',
              in: 'query',
              style: 'form',
              explode: false,
              schema: {
                type: 'array',
                items: { type: 'string' },
              },
            },
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
      "querySegments.push(encodeURIComponent('cities')",
    );

    expect(content).toContain("params = params.set('page', String(page));");

    expect(content).toContain('.get<any>(finalUrl, options)');
  });

  it('supports multiple form objects in one method', (): void => {
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
                  role: { type: 'string' },
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
                },
              },
            },
          ],
        },
      },
    };

    const content: string = generateMethods(paths, 'basePathApi');

    const occurrences: RegExpMatchArray | null = content.match(
      /const encodedEntries: string\[\]/g,
    );

    expect(occurrences).toHaveLength(2);

    expect(content).toContain('.get<any>(finalUrl, options)');
  });
});
