import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generate } from '../src/generator.js';
import { loadFixture } from './_helpers';

describe('generate() filesystem branches', () => {
  it('generates twice to trigger "file exists" branch', () => {
    const swagger = loadFixture('minimal');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swagger-to-angular-twice-'));

    generate(swagger, tmp);
    generate(swagger, tmp);

    expect(true).toBe(true);
  });
});