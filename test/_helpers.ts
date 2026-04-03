import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import type { SwaggerDoc } from '../src/generator.js';
import { generate } from '../src/generator.js';

export type FixtureName =
  | 'minimal'
  | 'query-params'
  | 'path-params'
  | 'body-inline'
  | 'composition'
  | 'binary'
  | 'delete-with-body'
  | 'no-operation-id'
  | 'delete-no-body'
  | 'post-no-body'
  | 'binary-with-query'
  | 'additional-properties-schema'
  | 'object-no-type-properties'
  | 'missing-servers'
  | 'no-paths'
  | 'schema-no-properties'
  | 'no-200';

export interface GeneratedResult {
  tmpDir: string;
  serviceDir: string;
  filePath: string;
  content: string;
}

export function loadFixture(name: FixtureName): SwaggerDoc {
  const filePath = path.join(process.cwd(), 'test', 'fixtures', `${name}.json`);
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as SwaggerDoc;
}

function extractSlugFromServerUrl(url: string): string {
  const slug = url.split('/').filter(Boolean).pop();
  return slug && slug.length > 0 ? slug : 'api';
}

export function generateFromFixture(name: FixtureName): GeneratedResult {
  const swagger = loadFixture(name);
  const serverUrl = swagger.servers?.[0]?.url ?? 'https://example.com/api';
  const slug = extractSlugFromServerUrl(serverUrl);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swagger-to-angular-'));
  generate(swagger, tmpDir);

  const serviceDir = path.join(tmpDir, slug);
  const filePath = path.join(serviceDir, `${slug}.service.ts`);
  const content = fs.readFileSync(filePath, 'utf-8');

  return { tmpDir, serviceDir, filePath, content };
}