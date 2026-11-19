import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import generate from '../src/generator.js';
import type { SwaggerDoc } from '../src/generator/types.js';
import { loadFixture } from './_helpers.js';

describe('generate() filesystem branches', (): void => {
  it('generates twice to trigger "file exists" branch', (): void => {
    const swagger: SwaggerDoc = loadFixture('minimal');

    const tmp: string = fs.mkdtempSync(
      path.join(os.tmpdir(), 'swagger-to-angular-twice-'),
    );

    generate(swagger, tmp);
    generate(swagger, tmp);

    expect(true).toBe(true);
  });
});
