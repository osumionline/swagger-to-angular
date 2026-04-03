import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generate } from '../src/generator.js';

describe('generate() integration', () => {
  it('generates a service file from a minimal swagger', () => {
    const swagger = {
      servers: [{ url: 'https://example.com/api' }],
      components: {
        schemas: {
          Foo: { type: 'object', properties: { id: { type: 'integer' } } },
        },
      },
      paths: {
        '/v1/foo': {
          get: {
            operationId: 'getFoo',
            responses: {
              '200': {
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/Foo' } },
                },
              },
            },
          },
        },
      },
    };

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swagger-to-angular-'));
    generate(swagger, tmp);

    const slug = 'api';
    const outFile = path.join(tmp, slug, `${slug}.service.ts`);

    expect(fs.existsSync(outFile)).toBe(true);

    const content = fs.readFileSync(outFile, 'utf-8');
    expect(content).toContain('export class ApiService');
    expect(content).toContain('getFoo(');
    expect(content).toContain('Observable<Foo>');
  });
});