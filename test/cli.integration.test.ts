import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'swagger-to-angular-cli-'));
}

type CliResult = { stdout: string; stderr: string };

async function runCli(args: string[], cwd: string, timeoutMs: number = 15_000): Promise<CliResult> {
  const nodePath: string = process.execPath;
  const cliPath: string = path.join(cwd, 'dist', 'bin', 'cli.js');

  return await new Promise<CliResult>((resolve, reject) => {
    const child = execFile(
      nodePath,
      [cliPath, ...args],
      { cwd, encoding: 'utf-8' },
      (error, stdout, stderr) => {
        if (error) {
          const err = error as NodeJS.ErrnoException & {
            code?: number | string;
            stdout?: string;
            stderr?: string;
          };
          err.stdout = typeof stdout === 'string' ? stdout : '';
          err.stderr = typeof stderr === 'string' ? stderr : '';
          reject(err);
          return;
        }
        resolve({
          stdout: typeof stdout === 'string' ? stdout : '',
          stderr: typeof stderr === 'string' ? stderr : '',
        });
      }
    );

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`CLI timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('exit', () => clearTimeout(timer));
  });
}

async function startServer(
  statusCode: number,
  body: string,
  contentType: string = 'application/json'
): Promise<{ url: string; close: () => Promise<void> }> {
  return await new Promise((resolve) => {
    const server = http.createServer((_, res) => {
      res.statusCode = statusCode;
      res.setHeader('content-type', contentType);
      res.end(body);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;

      resolve({
        url: `http://127.0.0.1:${port}/swagger.json`,
        close: async () => {
          await new Promise<void>((r) => server.close(() => r()));
        },
      });
    });
  });
}

describe('CLI integration', () => {
  it('generates from -f fixture.json into dest folder', async () => {
    const cwd: string = process.cwd();
    const out: string = tmpDir();

    const fixture: string = path.join(cwd, 'test', 'fixtures', 'minimal.json');
    const { stdout } = await runCli(['-f', fixture, '-d', out], cwd);

    expect(stdout).toContain('Archivo generado correctamente');

    const slug = 'api';
    const filePath = path.join(out, slug, `${slug}.service.ts`);
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('export class ApiService');
  });

  it('fails if neither -u nor -f is provided', async () => {
    const cwd: string = process.cwd();
    const out: string = tmpDir();

    await expect(runCli(['-d', out], cwd)).rejects.toBeTruthy();
  });

  it('fails if both -u and -f are provided', async () => {
    const cwd: string = process.cwd();
    const out: string = tmpDir();
    const fixture: string = path.join(cwd, 'test', 'fixtures', 'minimal.json');

    await expect(runCli(['-u', 'https://example.com/swagger.json', '-f', fixture, '-d', out], cwd)).rejects.toBeTruthy();
  });

  it('fails if file does not exist', async () => {
    const cwd: string = process.cwd();
    const out: string = tmpDir();

    await expect(runCli(['-f', path.join(cwd, 'test', 'fixtures', 'nope.json'), '-d', out], cwd)).rejects.toBeTruthy();
  });

  it('supports -u (url) with local http server returning swagger', async () => {
    const cwd: string = process.cwd();
    const out: string = tmpDir();

    const fixturePath: string = path.join(cwd, 'test', 'fixtures', 'minimal.json');
    const fixtureBody: string = fs.readFileSync(fixturePath, 'utf-8');

    const { url, close } = await startServer(200, fixtureBody);
    try {
      const { stdout } = await runCli(['-u', url, '-d', out], cwd);
      expect(stdout).toContain('Archivo generado correctamente');

      const slug = 'api';
      const filePath = path.join(out, slug, `${slug}.service.ts`);
      expect(fs.existsSync(filePath)).toBe(true);
    } finally {
      await close();
    }
  });

  it('fails when -u returns non-ok response', async () => {
    const cwd: string = process.cwd();
    const out: string = tmpDir();

    const { url, close } = await startServer(404, JSON.stringify({ error: 'not found' }));
    try {
      await expect(runCli(['-u', url, '-d', out], cwd)).rejects.toBeTruthy();
    } finally {
      await close();
    }
  });

  it('fails when -u returns invalid json', async () => {
    const cwd: string = process.cwd();
    const out: string = tmpDir();

    const { url, close } = await startServer(200, 'NOT_JSON', 'application/json');
    try {
      await expect(runCli(['-u', url, '-d', out], cwd)).rejects.toBeTruthy();
    } finally {
      await close();
    }
  });

  it('fails when -d is whitespace', async () => {
    const cwd: string = process.cwd();
    const fixture: string = path.join(cwd, 'test', 'fixtures', 'minimal.json');

    await expect(runCli(['-f', fixture, '-d', '   '], cwd)).rejects.toBeTruthy();
  });

  it('fails when swagger json root is not an object (URL returns null)', async () => {
    const cwd: string = process.cwd();
    const out: string = tmpDir();

    const { url, close } = await startServer(200, 'null', 'application/json');
    try {
      await expect(runCli(['-u', url, '-d', out], cwd)).rejects.toBeTruthy();
    } finally {
      await close();
    }
  });
});