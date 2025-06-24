#!/usr/bin/env node

import path from 'path';
import { generate } from '../src/generator.js';

function printUsage(): void {
	console.log('Uso: swagger-to-angular <url_swagger> <directorio_salida>');
	console.log(
		'Ejemplo: swagger-to-angular http://localhost:8080/api-docs.json src/app/services/api'
	);
}

async function main(): Promise<void> {
	const [, , swaggerUrl, outputDir] = process.argv;

	if (!swaggerUrl || !outputDir) {
		printUsage();
		process.exit(1);
	}

	try {
		const outputPath: string = path.normalize(outputDir);
		await generate(swaggerUrl, outputPath);
	} catch (err: unknown) {
		console.error(
			'❌ Error durante la generación:',
			err instanceof Error ? err.message : err
		);
		process.exit(1);
	}
}

main();
