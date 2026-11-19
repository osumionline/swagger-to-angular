import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import generate from '../src/generator.js';
import generateInterfaces from '../src/generator/interfaces.js';
import type { SwaggerDoc, SwaggerSchema } from '../src/generator/types.js';

describe('generateInterfaces', (): void => {
  it('generates required and optional properties', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      User: {
        type: 'object',
        required: ['id', 'email'],
        properties: {
          id: { type: 'integer' },
          email: { type: 'string' },
          name: { type: 'string' },
          active: { type: 'boolean' },
        },
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain('export interface User {');
    expect(content).toContain('  id: number;');
    expect(content).toContain('  email: string;');
    expect(content).toContain('  name?: string;');
    expect(content).toContain('  active?: boolean;');

    expect(content).not.toContain('  id?: number;');
    expect(content).not.toContain('  email?: string;');
  });

  it('keeps properties optional when required is missing', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      Product: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
        },
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain('  id?: number;');
    expect(content).toContain('  name?: string;');
  });

  it('keeps properties optional when required is empty', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      Product: {
        type: 'object',
        required: [],
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
        },
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain('  id?: number;');
    expect(content).toContain('  name?: string;');
  });

  it('distinguishes required from nullable properties', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      Profile: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            nullable: true,
          },
          nickname: {
            type: 'string',
            nullable: true,
          },
        },
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain('  name: string | null;');
    expect(content).toContain('  nickname?: string | null;');
    expect(content).not.toContain('  name?: string | null;');
  });

  it('respects independent required lists for multiple schemas', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      User: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
        },
      },
      Product: {
        type: 'object',
        required: ['name'],
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
        },
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain(
      'export interface User {\n  id: number;\n  name?: string;\n}',
    );

    expect(content).toContain(
      'export interface Product {\n  id?: number;\n  name: string;\n}',
    );
  });

  it('preserves required properties in nested objects', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      User: {
        type: 'object',
        required: ['address'],
        properties: {
          address: {
            type: 'object',
            required: ['street'],
            properties: {
              street: { type: 'string' },
              postalCode: { type: 'string' },
            },
          },
        },
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain(
      '  address: { street: string; postalCode?: string; };',
    );
  });

  it('generates empty interfaces without errors', (): void => {
    const schemas: Record<string, SwaggerSchema> = {
      Empty: {
        type: 'object',
        required: [],
        properties: {},
      },
    };

    const content: string = generateInterfaces(schemas);

    expect(content).toContain('export interface Empty {\n}\n');
  });

  it('writes required properties to the generated service file', (): void => {
    const swagger: SwaggerDoc = {
      servers: [
        {
          url: 'https://example.com/api',
        },
      ],
      components: {
        schemas: {
          Account: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'integer' },
              alias: { type: 'string' },
            },
          },
        },
      },
      paths: {},
    };

    const outputDir: string = fs.mkdtempSync(
      path.join(os.tmpdir(), 'swagger-to-angular-required-'),
    );

    try {
      generate(swagger, outputDir);

      const filePath: string = path.join(outputDir, 'api', 'api.service.ts');

      expect(fs.existsSync(filePath)).toBe(true);

      const content: string = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('export interface Account {');
      expect(content).toContain('  id: number;');
      expect(content).toContain('  alias?: string;');
      expect(content).not.toContain('  id?: number;');
    } finally {
      fs.rmSync(outputDir, {
        recursive: true,
        force: true,
      });
    }
  });
});
