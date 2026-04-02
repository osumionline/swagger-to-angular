#!/usr/bin/env node

import { program, type OptionValues } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { generate } from '../src/generator.js';

program
  .option('-u, --url <url>', 'URL de un Swagger JSON')
  .option('-f, --file <path>', 'Ruta a un archivo JSON Swagger local')
  .requiredOption('-d, --dest <directorio>', 'Directorio de salida');

program.parse(process.argv);

const options: OptionValues = program.opts();

/**
 * Type guard to ensure the parsed Swagger JSON is a non-null object.
 *
 * @param value Unknown value to test.
 * @returns True when value is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * CLI entrypoint: loads Swagger JSON (from URL or local file) and generates the Angular service.
 *
 * @returns Promise that resolves when generation completes.
 */
async function main(): Promise<void> {
  const url: string | undefined = options.url as string | undefined;
  const file: string | undefined = options.file as string | undefined;
  const destRaw = String(options.dest);
  const dest: string = path.normalize(destRaw);

  if (!dest || dest.trim() === '') {
    console.error('❌ Debes indicar un directorio de salida válido (-d)');
    process.exit(1);
  }

  if (!url && !file) {
    console.error('❌ Debes indicar una URL (-u) o un archivo JSON (-f)');
    process.exit(1);
  }

  if (url && file) {
    console.error('❌ No puedes usar -u y -f al mismo tiempo');
    process.exit(1);
  }

  try {
    let swaggerData: unknown;

    if (url) {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Error al obtener la URL: ${res.status} ${res.statusText}`);
      }
      swaggerData = await res.json();
    } else {
      if (!fs.existsSync(file!)) {
        throw new Error(`El archivo no existe: ${file}`);
      }
      const raw: string = fs.readFileSync(file!, 'utf-8');
      swaggerData = JSON.parse(raw) as unknown;
    }

    if (!isRecord(swaggerData)) {
      throw new Error('Swagger JSON inválido: se esperaba un objeto JSON en la raíz');
    }

    generate(swaggerData, dest);
  } catch (err: unknown) {
    console.error('❌ Error durante la generación:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

void main();