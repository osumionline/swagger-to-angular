#!/usr/bin/env node

import { OptionValues, program } from 'commander';
import fs from 'fs';
import path from 'path';
import { generate } from '../src/generator.js';

program
	.option('-u, --url <url>', 'URL de un Swagger JSON')
	.option('-f, --file <path>', 'Ruta a un archivo JSON Swagger local')
	.requiredOption('-d, --dest <directorio>', 'Directorio de salida');

program.parse(process.argv);

const options: OptionValues = program.opts();

async function main(): Promise<void> {
	const url: string | undefined = options.url;
	const file: string | undefined = options.file;
	const dest: string = path.normalize(options.dest);

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
			const res: Response = await fetch(url);
			if (!res.ok) {
				throw new Error(`Error al obtener la URL: ${res.statusText}`);
			}
			swaggerData = await res.json();
		}

		if (file) {
			if (!fs.existsSync(file))
				throw new Error(`El archivo no existe: ${file}`);
			const raw: string = fs.readFileSync(file, 'utf-8');
			swaggerData = JSON.parse(raw);
		}

		await generate(swaggerData as Record<string, any>, dest);
	} catch (err: unknown) {
		console.error(
			'❌ Error durante la generación:',
			err instanceof Error ? err.message : err
		);
		process.exit(1);
	}
}

main();
