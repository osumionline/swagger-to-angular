import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import generate from '../src/generator.js';
import extractServiceName from '../src/generator/service-info.js';

import type { ServiceInfo, SwaggerDoc } from '../src/generator/types.js';

/**
 * Reads an OpenAPI document from a JSON fixture.
 *
 * @param filePath Absolute path to the fixture.
 * @returns Parsed OpenAPI document.
 */
function readSwaggerFixture(filePath: string): SwaggerDoc {
  const content: string = fs.readFileSync(filePath, 'utf-8');

  return JSON.parse(content) as SwaggerDoc;
}

/**
 * Generates an Angular service in a temporary directory.
 *
 * @param swagger OpenAPI document to process.
 * @param outputDirectory Directory for generated files.
 * @returns Absolute path to the generated TypeScript service.
 */
function generateServiceFile(
  swagger: SwaggerDoc,
  outputDirectory: string,
): string {
  const serviceInfo: ServiceInfo = extractServiceName(swagger);

  generate(swagger, outputDirectory);

  const slug: string = serviceInfo.fileName.replace(/\.service\.ts$/, '');

  return path.join(outputDirectory, slug, serviceInfo.fileName);
}

/**
 * Compiles generated Angular services using the TypeScript
 * compiler and the installed Angular type declarations.
 *
 * No JavaScript is emitted.
 *
 * @param serviceFiles Absolute paths to generated services.
 * @param environmentFile Absolute path to the environment stub.
 * @returns Formatted TypeScript compilation errors.
 */
function compileServices(
  serviceFiles: string[],
  environmentFile: string,
): string[] {
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    exactOptionalPropertyTypes: true,
    experimentalDecorators: true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true,
    paths: {
      'src/environments/environment': [environmentFile],
    },
  };

  const program: ts.Program = ts.createProgram(
    [...serviceFiles, environmentFile],
    compilerOptions,
  );

  const diagnostics: readonly ts.Diagnostic[] =
    ts.getPreEmitDiagnostics(program);

  return diagnostics
    .filter((diagnostic: ts.Diagnostic): boolean => {
      return diagnostic.category === ts.DiagnosticCategory.Error;
    })
    .map((diagnostic: ts.Diagnostic): string => {
      const message: string = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        '\n',
      );

      if (diagnostic.file === undefined || diagnostic.start === undefined) {
        return `TS${diagnostic.code}: ${message}`;
      }

      const location: ts.LineAndCharacter =
        diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);

      const filePath: string = path.relative(
        process.cwd(),
        diagnostic.file.fileName,
      );

      return (
        `${filePath}:${location.line + 1}:` +
        `${location.character + 1} ` +
        `TS${diagnostic.code}: ${message}`
      );
    });
}

describe('Generated Angular service compilation', (): void => {
  it('compiles every generated fixture with Angular 22 types', (): void => {
    const fixtureDirectory: string = path.join(
      process.cwd(),
      'test',
      'fixtures',
    );

    const fixtureFiles: string[] = fs
      .readdirSync(fixtureDirectory)
      .filter((fileName: string): boolean => {
        return fileName.endsWith('.json');
      })
      .sort();

    expect(fixtureFiles.length).toBeGreaterThan(0);

    /*
     * The temporary directory is created inside the project,
     * allowing TypeScript to resolve Angular and RxJS from
     * the project's node_modules directory.
     */
    const temporaryDirectory: string = fs.mkdtempSync(
      path.join(process.cwd(), '.angular-typecheck-'),
    );

    try {
      const serviceFiles: string[] = [];
      const basePathNames: Set<string> = new Set<string>();

      for (const fixtureFile of fixtureFiles) {
        const fixturePath: string = path.join(fixtureDirectory, fixtureFile);

        const swagger: SwaggerDoc = readSwaggerFixture(fixturePath);

        const serviceInfo: ServiceInfo = extractServiceName(swagger);

        basePathNames.add(serviceInfo.basePathName);

        const fixtureName: string = path.basename(fixtureFile, '.json');

        const outputDirectory: string = path.join(
          temporaryDirectory,
          fixtureName,
        );

        const serviceFile: string = generateServiceFile(
          swagger,
          outputDirectory,
        );

        expect(fs.existsSync(serviceFile)).toBe(true);

        serviceFiles.push(serviceFile);
      }

      /*
       * Create a minimal environment module with all basePath
       * properties used by the generated services.
       */
      const environmentFile: string = path.join(
        temporaryDirectory,
        'environment.ts',
      );

      const environmentProperties: string[] = Array.from(basePathNames).map(
        (name: string): string => {
          return `  ${name}: '',`;
        },
      );

      const environmentContent: string =
        `export const environment = {\n` +
        `${environmentProperties.join('\n')}\n` +
        `};\n`;

      fs.writeFileSync(environmentFile, environmentContent, 'utf-8');

      const errors: string[] = compileServices(serviceFiles, environmentFile);

      expect(errors).toEqual([]);
    } finally {
      fs.rmSync(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  }, 30_000);
});
