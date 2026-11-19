import fs from 'node:fs';
import path from 'node:path';
import generateInterfaces from './generator/interfaces.js';
import generateMethods from './generator/methods.js';
import extractServiceName from './generator/service-info.js';
import buildFullFile from './generator/template.js';
import type { ServiceInfo, SwaggerDoc } from './generator/types.js';

/**
 * Generates an Angular service from an OpenAPI document.
 * Resolves service metadata, generates TypeScript source
 * and writes the result to the destination directory.
 *
 * @param swagger Parsed Swagger/OpenAPI document.
 * @param relativeOutputPath Output directory relative to the current working directory.
 * @returns Nothing. The generated service is written to disk.
 */
export default function generate(
  swagger: SwaggerDoc,
  relativeOutputPath: string,
): void {
  const serviceInfo: ServiceInfo = extractServiceName(swagger);

  const interfaces: string = generateInterfaces(
    swagger.components?.schemas ?? {},
  );

  const methods: string = generateMethods(
    swagger.paths ?? {},
    serviceInfo.basePathName,
  );

  const fullContent: string = buildFullFile(serviceInfo, interfaces, methods);

  const basePath: string = path.resolve(process.cwd(), relativeOutputPath);

  const slug: string = serviceInfo.fileName.replace('.service.ts', '');

  const serviceDir: string = path.join(basePath, slug);

  if (!fs.existsSync(serviceDir)) {
    fs.mkdirSync(serviceDir, { recursive: true });
  }

  const fullFilePath: string = path.join(serviceDir, serviceInfo.fileName);

  if (fs.existsSync(fullFilePath)) {
    console.log(`El archivo ya existe y será reemplazado: ${fullFilePath}`);
  }

  fs.writeFileSync(fullFilePath, fullContent, 'utf-8');

  console.log(`Archivo generado correctamente: ${fullFilePath}`);
}
