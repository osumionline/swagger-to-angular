import * as fs from 'fs';
import * as path from 'path';

interface ServiceInfo {
	fileName: string;
	className: string;
	basePathName: string;
	serverUrl: string;
}

export async function generate(
	swagger: Record<string, any>,
	relativeOutputPath: string
): Promise<void> {
	const serviceInfo: ServiceInfo = extractServiceName(swagger);
	const interfaces: string = generateInterfaces(
		swagger.components?.schemas ?? {}
	);
	const methods: string = generateMethods(
		swagger.paths ?? {},
		serviceInfo.basePathName
	);
	const fullContent: string = buildFullFile(serviceInfo, interfaces, methods);

	const basePath: string = path.resolve(process.cwd(), relativeOutputPath);
	const slug: string = serviceInfo.fileName.replace('.service.ts', '');
	const serviceDir: string = path.join(basePath, slug);

	const parts: string[] = serviceDir.split(path.sep);
	for (let i = 1; i <= parts.length; i++) {
		const subPath: string = path.join(...parts.slice(0, i));
		if (!fs.existsSync(subPath)) {
			fs.mkdirSync(subPath);
		}
	}

	const fullFilePath: string = path.join(serviceDir, serviceInfo.fileName);

	if (fs.existsSync(fullFilePath)) {
		console.log(`El archivo ya existe y será reemplazado: ${fullFilePath}`);
	}

	fs.writeFileSync(fullFilePath, fullContent, 'utf-8');
	console.log(`Archivo generado correctamente: ${fullFilePath}`);
}

function extractServiceName(swagger: Record<string, any>): ServiceInfo {
	const fullUrl: string = swagger.servers?.[0]?.url ?? '';
	const slug: string = fullUrl.split('/').filter(Boolean).pop() ?? 'api';
	const className: string =
		slug.replace(/(^\w|-\w)/g, (m: string) =>
			m.replace('-', '').toUpperCase()
		) + 'Service';
	const fileName: string = `${slug}.service.ts`;
	const basePathName: string = `basePath${className.replace('Service', '')}`;
	return { fileName, className, basePathName, serverUrl: fullUrl };
}

function generateInterfaces(schemas: Record<string, any>): string {
	const lines: string[] = [];

	for (const [name, schema] of Object.entries(schemas)) {
		lines.push(`export interface ${name} {`);
		for (const [propName, prop] of Object.entries(
			schema.properties ?? {}
		)) {
			const typedProp = prop as Record<string, any>;
			const type: string = mapSwaggerTypeToTs(typedProp);
			lines.push(`  ${propName}?: ${type};`);
		}
		lines.push('}\n');
	}

	return lines.join('\n');
}

function mapSwaggerTypeToTs(prop: Record<string, any>): string {
	if (prop.$ref) return extractRefName(prop.$ref);

	switch (prop.type) {
		case 'integer':
		case 'number':
			return 'number';
		case 'string':
			return 'string';
		case 'boolean':
			return 'boolean';
		case 'array':
			return `${mapSwaggerTypeToTs(prop.items)}[]`;
		case 'object':
			return '{ [key: string]: any }';
		default:
			return 'any';
	}
}

function extractRefName(ref: string): string {
	return ref.split('/').pop() ?? 'any';
}

function generateMethods(
	paths: Record<string, any>,
	basePathName: string
): string {
	const methods: string[] = [];

	for (const [rawPath, methodsMap] of Object.entries(paths)) {
		for (const [httpMethod, defUnknown] of Object.entries(methodsMap)) {
			const def = defUnknown as Record<string, any>;
			const operationId: string =
				def.operationId ??
				`${httpMethod}_${rawPath.replace(/[\/{}/]/g, '_')}`;

			const responses: Record<string, any> =
				def.responses?.['200']?.content ?? {};
			const contentType: string =
				Object.keys(responses)[0] ?? 'application/json';

			let returnType: string = 'void';
			let responseTypeOption: string = '';

			if (
				contentType === 'application/pdf' ||
				contentType === 'application/octet-stream'
			) {
				returnType = 'ArrayBuffer';
				responseTypeOption = `{ responseType: 'arraybuffer' as 'arraybuffer' }`;
			} else {
				returnType = extractRefName(
					responses['application/json']?.schema?.$ref ?? 'void'
				);
			}

			const params: any[] = def.parameters ?? [];
			const queryParams: any[] = params.filter((p) => p.in === 'query');
			const pathParams: any[] = params.filter((p) => p.in === 'path');

			const argsList: string[] = [];
			const paramAssignments: string[] = [];

			for (const param of pathParams) {
				const type: string = mapSwaggerTypeToTs(param.schema);
				argsList.push(`${param.name}?: ${type}`);
			}

			for (const param of queryParams) {
				const type: string = mapSwaggerTypeToTs(param.schema);
				argsList.push(`${param.name}?: ${type}`);
				paramAssignments.push(param.name);
			}

			const content: any = def.requestBody?.content;
			let bodyUsage: string = '{}';
			let hasPayload = false;

			if (content) {
				if ('application/json' in content) {
					const ref: string | undefined =
						content['application/json'].schema?.$ref;
					if (ref) {
						const bodyType: string = extractRefName(ref);
						argsList.push(`payload?: ${bodyType}`);
						bodyUsage = 'payload';
						hasPayload = true;
					}
				} else if ('multipart/form-data' in content) {
					const formParams: Record<string, any> =
						content['multipart/form-data'].schema?.properties ?? {};
					const formArgs: string[] = Object.keys(formParams).map(
						(key) => `${key}?: File`
					);
					argsList.push(...formArgs);
					const formDataLines: string[] = Object.keys(formParams).map(
						(key) =>
							`if (${key}) formData.append('${key}', ${key});`
					);
					bodyUsage = `(() => {\nconst formData = new FormData();\n${formDataLines.join(
						'\n'
					)}\nreturn formData;\n})()`;
					hasPayload = true;
				}
			}

			let interpolatedPath: string = rawPath;
			for (const param of pathParams) {
				interpolatedPath = interpolatedPath.replace(
					`{${param.name}}`,
					`\${${param.name}}`
				);
			}

			const url: string = `\${this.${basePathName}}${interpolatedPath}`;

			let paramsBlock: string = '';
			let optionsBlock: string = '';

			if (queryParams.length > 0) {
				paramsBlock = `\n  const params = {\n    ${paramAssignments.join(
					',\n    '
				)}\n  };`;
				optionsBlock = `{ params }`;
			}

			if (responseTypeOption) {
				optionsBlock = responseTypeOption;
			}

			const requestArgs: string = (() => {
				if (httpMethod === 'get' || httpMethod === 'delete') {
					return optionsBlock || '{}';
				}
				if (hasPayload && optionsBlock.startsWith('{ params')) {
					return `${bodyUsage}, ${optionsBlock}`;
				}
				return bodyUsage;
			})();

			const argsSignature: string = argsList.join(', ');

			const method = `
  ${operationId}(${argsSignature}): Observable<${returnType}> {${paramsBlock}
    return this.http
      .${httpMethod}<${returnType}>(\`${url}\`, ${requestArgs})
      .pipe(catchError(this.handleError));
  }`;

			methods.push(method);
		}
	}

	return methods.join('\n');
}

function buildFullFile(
	serviceInfo: ServiceInfo,
	interfaces: string,
	methods: string
): string {
	return `import {
  HttpClient,
  HttpErrorResponse,
  HttpParams,
} from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { catchError, Observable, throwError } from 'rxjs';

${interfaces}

@Injectable({ providedIn: 'root' })
export class ${serviceInfo.className} {
  http: HttpClient = inject(HttpClient);
  ${serviceInfo.basePathName}: string = environment.${serviceInfo.basePathName} || '${serviceInfo.serverUrl}';

${methods}

  /**
   * Método para manejar los errores de las peticiones HTTP
   *
   * @param error Error de la petición
   * @returns Error manejado con un mensaje de error legible
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage: string = "";

    if (error.error instanceof ErrorEvent) {
      errorMessage = "Error: " + error.error.message;
    } else {
      errorMessage = "Error " + error.status + ": " + error.message;
    }

    return throwError((): Error => new Error(errorMessage));
  }
}`;
}
