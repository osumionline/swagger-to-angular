import { describe, expect, it } from 'vitest';

import generateInterfaces from '../src/generator/interfaces.js';
import generateMethods from '../src/generator/methods.js';
import {
  extractRefName,
  mapSwaggerSchemaToTs,
} from '../src/generator/schema-mapper.js';
import formatSchemaName from '../src/generator/schema-name.js';

import type { SwaggerPaths, SwaggerSchema } from '../src/generator/types.js';

describe('OpenAPI schema names and references', (): void => {
  it('preserves valid schema names', (): void => {
    expect(formatSchemaName('User')).toBe('User');
    expect(formatSchemaName('OrderItem')).toBe('OrderItem');
    expect(formatSchemaName('User_2')).toBe('User_2');
    expect(formatSchemaName('$Metadata')).toBe('$Metadata');
    expect(formatSchemaName('_Private')).toBe('_Private');
  });

  it('encodes invalid schema identifiers', (): void => {
    expect(formatSchemaName('User-Profile')).toBe(
      'OpenApiSchema_User_2d_Profile',
    );

    expect(formatSchemaName('Order.Item')).toBe('OpenApiSchema_Order_2e_Item');

    expect(formatSchemaName('123Code')).toBe('OpenApiSchema_123Code');

    expect(formatSchemaName('User Profile')).toBe(
      'OpenApiSchema_User_20_Profile',
    );

    expect(formatSchemaName('Café')).toBe('OpenApiSchema_Caf_e9_');
  });

  it('encodes reserved TypeScript names', (): void => {
    expect(formatSchemaName('default')).toBe('OpenApiSchema_default');

    expect(formatSchemaName('class')).toBe('OpenApiSchema_class');

    expect(formatSchemaName('string')).toBe('OpenApiSchema_string');

    expect(formatSchemaName('null')).toBe('OpenApiSchema_null');
  });

  it('avoids collisions with encoded-looking names', (): void => {
    const names: string[] = [
      'User-Profile',
      'User_2d_Profile',
      'OpenApiSchema_User_2d_Profile',
    ];

    const generatedNames: string[] = names.map((name: string): string =>
      formatSchemaName(name),
    );

    const uniqueNames: Set<string> = new Set<string>(generatedNames);

    expect(uniqueNames.size).toBe(3);

    expect(generatedNames[0]).toBe('OpenApiSchema_User_2d_Profile');

    expect(generatedNames[1]).toBe('User_2d_Profile');

    expect(generatedNames[2]).toBe(
      'OpenApiSchema_OpenApiSchema_5f_User_5f_2d_5f_Profile',
    );
  });

  it('decodes JSON Pointer escape sequences', (): void => {
    expect(extractRefName('#/components/schemas/User~1Profile')).toBe(
      'OpenApiSchema_User_2f_Profile',
    );

    expect(extractRefName('#/components/schemas/User~0Version')).toBe(
      'OpenApiSchema_User_7e_Version',
    );

    expect(extractRefName('#/components/schemas/User~01Profile')).toBe(
      'OpenApiSchema_User_7e_1Profile',
    );
  });

  it('decodes URI-encoded schema names', (): void => {
    expect(extractRefName('#/components/schemas/User%20Profile')).toBe(
      'OpenApiSchema_User_20_Profile',
    );

    expect(extractRefName('#/components/schemas/Caf%C3%A9')).toBe(
      'OpenApiSchema_Caf_e9_',
    );
  });

  it('preserves existing references and rejects unsupported ones', (): void => {
    expect(extractRefName('#/components/schemas/User')).toBe('User');
    expect(extractRefName('User')).toBe('User');

    expect(extractRefName('')).toBe('any');
    expect(extractRefName('/')).toBe('any');

    expect(extractRefName('#/components/schemas/User/properties/id')).toBe(
      'any',
    );

    expect(extractRefName('#/components/schemas/Bad%XX')).toBe('any');

    expect(extractRefName('#/components/schemas/User~2')).toBe('any');

    expect(extractRefName('https://example.com/schemas/User.json')).toBe('any');
  });

  it('uses encoded names consistently in generated interfaces', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      'User-Profile': {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'integer' },
        },
      },
      'Order.Item': {
        type: 'object',
        required: ['user'],
        properties: {
          user: {
            $ref: '#/components/schemas/User-Profile',
          },
        },
      },
      Wrapper: {
        type: 'object',
        properties: {
          orders: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/Order.Item',
            },
          },
        },
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain(
      'export interface OpenApiSchema_User_2d_Profile {',
    );

    expect(content).toContain('export interface OpenApiSchema_Order_2e_Item {');

    expect(content).toContain('user: OpenApiSchema_User_2d_Profile;');

    expect(content).toContain('orders?: OpenApiSchema_Order_2e_Item[];');

    expect(content).not.toContain('export interface User-Profile');
  });

  it('resolves references inside nested compositions', (): void => {
    const schema: SwaggerSchema = {
      allOf: [
        {
          oneOf: [
            {
              $ref: '#/components/schemas/User-Profile',
            },
            {
              $ref: '#/components/schemas/Order.Item',
            },
          ],
        },
        {
          $ref: '#/components/schemas/Metadata',
        },
      ],
    };

    const content: string = mapSwaggerSchemaToTs(schema);

    expect(content).toBe(
      '(OpenApiSchema_User_2d_Profile | OpenApiSchema_Order_2e_Item) & Metadata',
    );
  });

  it('uses encoded names in HTTP request and response types', (): void => {
    const paths: SwaggerPaths = {
      '/v1/users': {
        post: {
          operationId: 'saveUser',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/User-Profile',
                },
              },
            },
          },
          responses: {
            '201': {
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Order.Item',
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
      'saveUser(payload: OpenApiSchema_User_2d_Profile): Observable<OpenApiSchema_Order_2e_Item>',
    );

    expect(content).toContain(
      '.post<OpenApiSchema_Order_2e_Item>(`${this.basePathApi}/v1/users`, JSON.stringify(payload), options)',
    );
  });
});
