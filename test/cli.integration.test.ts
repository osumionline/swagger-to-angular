import type { ChildProcess } from 'node:child_process';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Result returned by a successful CLI execution.
 */
interface CliResult {
  stdout: string;
  stderr: string;
}

/**
 * Error returned by a failed CLI execution.
 */
interface CliExecutionError extends Error {
  stdout?: string;
  stderr?: string;
}

/**
 * Local HTTP server used by CLI integration tests.
 */
interface LocalServer {
  url: string;
  close: () => Promise<void>;
}

/**
 * Creates a temporary directory for CLI integration tests.
 *
 * @returns Absolute path to the temporary directory.
 */
function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'swagger-to-angular-cli-'));
}

/**
 * Executes the compiled CLI in a child Node.js process.
 *
 * @param args Command-line arguments.
 * @param cwd Working directory of the CLI process.
 * @param timeoutMs Maximum execution time in milliseconds.
 * @returns Promise containing the standard output and error output.
 */
async function runCli(
  args: string[],
  cwd: string,
  timeoutMs: number = 15_000,
): Promise<CliResult> {
  const nodePath: string = process.execPath;
  const cliPath: string = path.join(cwd, 'dist', 'bin', 'cli.js');

  return await new Promise<CliResult>((resolve, reject): void => {
    const child: ChildProcess = execFile(
      nodePath,
      [cliPath, ...args],
      { cwd, encoding: 'utf-8' },
      (error, stdout, stderr): void => {
        if (error) {
          const executionError: CliExecutionError = error;

          executionError.stdout = typeof stdout === 'string' ? stdout : '';

          executionError.stderr = typeof stderr === 'string' ? stderr : '';

          reject(executionError);
          return;
        }

        resolve({
          stdout: typeof stdout === 'string' ? stdout : '',
          stderr: typeof stderr === 'string' ? stderr : '',
        });
      },
    );

    const timer: NodeJS.Timeout = setTimeout((): void => {
      child.kill('SIGKILL');
      reject(new Error(`CLI timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('exit', (): void => {
      clearTimeout(timer);
    });
  });
}

/**
 * Verifies that the CLI fails and reports the expected
 * error message through stderr.
 *
 * @param args Command-line arguments.
 * @param cwd Working directory of the CLI process.
 * @param expectedMessage Text expected in the error output.
 * @returns Promise resolved when the expected failure is verified.
 */
async function expectCliFailure(
  args: string[],
  cwd: string,
  expectedMessage: string,
): Promise<void> {
  try {
    await runCli(args, cwd);
  } catch (error: unknown) {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('stderr' in error) ||
      typeof error.stderr !== 'string'
    ) {
      throw new Error('CLI execution failed without a valid stderr message', {
        cause: error,
      });
    }

    const stderr: string = error.stderr;

    expect(stderr).toContain(expectedMessage);
    return;
  }

  throw new Error(
    'Expected CLI execution to fail, but it completed successfully',
  );
}

/**
 * Starts a local HTTP server to simulate Swagger responses.
 *
 * @param statusCode HTTP response status code.
 * @param body Response body.
 * @param contentType Response content type.
 * @returns Promise containing the server URL and a shutdown function.
 */
async function startServer(
  statusCode: number,
  body: string,
  contentType: string = 'application/json',
): Promise<LocalServer> {
  return await new Promise<LocalServer>((resolve): void => {
    const server: Server = http.createServer(
      (_request: IncomingMessage, response: ServerResponse): void => {
        response.statusCode = statusCode;
        response.setHeader('content-type', contentType);
        response.end(body);
      },
    );

    server.listen(0, '127.0.0.1', (): void => {
      const address: AddressInfo | string | null = server.address();

      const port: number =
        typeof address === 'object' && address !== null ? address.port : 0;

      resolve({
        url: `http://127.0.0.1:${port}/swagger.json`,
        close: async (): Promise<void> => {
          await new Promise<void>((done): void => {
            server.close((): void => {
              done();
            });
          });
        },
      });
    });
  });
}

describe('CLI integration', (): void => {
  it('generates from -f fixture.json into dest folder', async (): Promise<void> => {
    const cwd: string = process.cwd();
    const out: string = tmpDir();

    const fixture: string = path.join(cwd, 'test', 'fixtures', 'minimal.json');

    const result: CliResult = await runCli(['-f', fixture, '-d', out], cwd);

    expect(result.stdout).toContain('Archivo generado correctamente');

    const slug: string = 'api';
    const filePath: string = path.join(out, slug, `${slug}.service.ts`);

    expect(fs.existsSync(filePath)).toBe(true);

    const content: string = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain('export class ApiService');
  });

  it('fails if neither -u nor -f is provided', async (): Promise<void> => {
    const cwd: string = process.cwd();
    const out: string = tmpDir();

    await expectCliFailure(
      ['-d', out],
      cwd,
      'Debes indicar una URL (-u) o un archivo JSON (-f)',
    );
  });

  it('fails if both -u and -f are provided', async (): Promise<void> => {
    const cwd: string = process.cwd();
    const out: string = tmpDir();

    const fixture: string = path.join(cwd, 'test', 'fixtures', 'minimal.json');

    await expectCliFailure(
      ['-u', 'https://example.com/swagger.json', '-f', fixture, '-d', out],
      cwd,
      'No puedes usar -u y -f al mismo tiempo',
    );
  });

  it('fails if file does not exist', async (): Promise<void> => {
    const cwd: string = process.cwd();
    const out: string = tmpDir();

    await expectCliFailure(
      ['-f', path.join(cwd, 'test', 'fixtures', 'nope.json'), '-d', out],
      cwd,
      'El archivo no existe:',
    );
  });

  it('supports -u with local HTTP server', async (): Promise<void> => {
    const cwd: string = process.cwd();
    const out: string = tmpDir();

    const fixturePath: string = path.join(
      cwd,
      'test',
      'fixtures',
      'minimal.json',
    );

    const fixtureBody: string = fs.readFileSync(fixturePath, 'utf-8');

    const { url, close }: LocalServer = await startServer(200, fixtureBody);

    try {
      const result: CliResult = await runCli(['-u', url, '-d', out], cwd);

      expect(result.stdout).toContain('Archivo generado correctamente');

      const slug: string = 'api';

      const filePath: string = path.join(out, slug, `${slug}.service.ts`);

      expect(fs.existsSync(filePath)).toBe(true);
    } finally {
      await close();
    }
  });

  it('fails when -u returns non-ok response', async (): Promise<void> => {
    const cwd: string = process.cwd();
    const out: string = tmpDir();

    const { url, close }: LocalServer = await startServer(
      404,
      JSON.stringify({ error: 'not found' }),
    );

    try {
      await expectCliFailure(
        ['-u', url, '-d', out],
        cwd,
        'Error al obtener la URL: 404',
      );
    } finally {
      await close();
    }
  });

  it('fails when -u returns invalid JSON', async (): Promise<void> => {
    const cwd: string = process.cwd();
    const out: string = tmpDir();

    const { url, close }: LocalServer = await startServer(
      200,
      'NOT_JSON',
      'application/json',
    );

    try {
      await expectCliFailure(
        ['-u', url, '-d', out],
        cwd,
        'Error durante la generación:',
      );
    } finally {
      await close();
    }
  });

  it('fails when -d is whitespace', async (): Promise<void> => {
    const cwd: string = process.cwd();

    const fixture: string = path.join(cwd, 'test', 'fixtures', 'minimal.json');

    await expectCliFailure(
      ['-f', fixture, '-d', '   '],
      cwd,
      'Debes indicar un directorio de salida válido (-d)',
    );
  });

  it('fails when Swagger JSON root is null', async (): Promise<void> => {
    const cwd: string = process.cwd();
    const out: string = tmpDir();

    const { url, close }: LocalServer = await startServer(
      200,
      'null',
      'application/json',
    );

    try {
      await expectCliFailure(
        ['-u', url, '-d', out],
        cwd,
        'Swagger JSON inválido: se esperaba un objeto JSON en la raíz',
      );
    } finally {
      await close();
    }
  });
});
