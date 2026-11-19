import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import generate from '../src/generator.js';
import generateInterfaces from '../src/generator/interfaces.js';
import type { SwaggerDoc, SwaggerSchema } from '../src/generator/types.js';

describe('OpenAPI root schema declarations', (): void => {
  it('preserves interfaces for regular objects', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      User: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
        },
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain('export interface User {');
    expect(content).toContain('  id: number;');
    expect(content).toContain('  name?: string;');
    expect(content).not.toContain('export type User =');
  });

  it('preserves interfaces for objects without an explicit type', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      User: {
        required: ['id'],
        properties: {
          id: { type: 'integer' },
        },
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain('export interface User {\n  id: number;\n}');
  });

  it('preserves empty object interfaces', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      Empty: {
        type: 'object',
        properties: {},
      },
      Unknown: {},
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain('export interface Empty {\n}\n');
    expect(content).toContain('export interface Unknown {\n}\n');
  });

  it('generates type aliases for root arrays', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      UserList: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/User',
        },
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain('export type UserList = User[];');

    expect(content).not.toContain('export interface UserList');
  });

  it('preserves nullability in root arrays', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      Values: {
        type: 'array',
        nullable: true,
        items: {
          type: 'integer',
          nullable: true,
        },
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain('export type Values = (number | null)[] | null;');
  });

  it('generates type aliases for enums', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      Status: {
        type: 'string',
        enum: ['draft', 'published'],
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain('export type Status = "draft" | "published";');

    expect(content).not.toContain('export interface Status');
  });

  it('generates type aliases for oneOf and anyOf', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      Animal: {
        oneOf: [
          { $ref: '#/components/schemas/Cat' },
          { $ref: '#/components/schemas/Dog' },
        ],
      },
      Result: {
        anyOf: [{ type: 'boolean' }, { type: 'integer' }],
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain('export type Animal = Cat | Dog;');

    expect(content).toContain('export type Result = boolean | number;');
  });

  it('preserves nested composition precedence in root aliases', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      Combined: {
        allOf: [
          {
            oneOf: [
              { $ref: '#/components/schemas/A' },
              { $ref: '#/components/schemas/B' },
            ],
          },
          { $ref: '#/components/schemas/C' },
        ],
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain('export type Combined = (A | B) & C;');
  });

  it('generates type aliases for direct references', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      UserAlias: {
        $ref: '#/components/schemas/User',
      },
      'Profile.Alias': {
        $ref: '#/components/schemas/User-Profile',
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain('export type UserAlias = User;');

    expect(content).toContain(
      'export type OpenApiSchema_Profile_2e_Alias = OpenApiSchema_User_2d_Profile;',
    );
  });

  it('generates aliases for primitive and nullable types', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      Token: {
        type: 'string',
      },
      Total: {
        type: 'number',
      },
      MaybeActive: {
        type: 'boolean',
        nullable: true,
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain('export type Token = string;');

    expect(content).toContain('export type Total = number;');

    expect(content).toContain('export type MaybeActive = boolean | null;');
  });

  it('generates dictionary aliases using additionalProperties', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      Scores: {
        type: 'object',
        additionalProperties: {
          type: 'integer',
        },
      },
      Metadata: {
        type: 'object',
        additionalProperties: true,
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain(
      'export type Scores = { [key: string]: number };',
    );

    expect(content).toContain('export type Metadata = { [key: string]: any };');

    expect(content).not.toContain('export interface Scores');
  });

  it('generates nullable object schemas as aliases', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      MaybeUser: {
        type: 'object',
        nullable: true,
        required: ['id'],
        properties: {
          id: { type: 'integer' },
          nickname: { type: 'string' },
        },
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain(
      'export type MaybeUser = { id: number; nickname?: string; } | null;',
    );

    expect(content).not.toContain('export interface MaybeUser');
  });

  it('writes root aliases and their references to the generated service', (): void => {
    const swagger: SwaggerDoc = {
      servers: [
        {
          url: 'https://example.com/api',
        },
      ],
      components: {
        schemas: {
          User: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'integer' },
            },
          },
          UserList: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/User',
            },
          },
          UserListAlias: {
            $ref: '#/components/schemas/UserList',
          },
        },
      },
      paths: {
        '/v1/users': {
          get: {
            operationId: 'getUsers',
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/UserListAlias',
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const outputDir: string = fs.mkdtempSync(
      path.join(os.tmpdir(), 'swagger-to-angular-root-schemas-'),
    );

    try {
      generate(swagger, outputDir);

      const filePath: string = path.join(outputDir, 'api', 'api.service.ts');

      expect(fs.existsSync(filePath)).toBe(true);

      const content: string = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('export interface User {');

      expect(content).toContain('export type UserList = User[];');

      expect(content).toContain('export type UserListAlias = UserList;');

      expect(content).toContain('getUsers(): Observable<UserListAlias>');

      expect(content).toContain(
        '.get<UserListAlias>(`${this.basePathApi}/v1/users`, {})',
      );
    } finally {
      fs.rmSync(outputDir, {
        recursive: true,
        force: true,
      });
    }
  });
});
