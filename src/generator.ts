import * as fs from 'fs';
import * as path from 'path';

interface SwaggerServer {
  url?: string;
}

interface SwaggerComponents {
  schemas?: Record<string, SwaggerSchema>;
}

interface SwaggerDoc {
  servers?: SwaggerServer[];
  components?: SwaggerComponents;
  paths?: SwaggerPaths;
}

type SwaggerPaths = Record<string, Record<string, SwaggerOperation>>;

interface SwaggerSchema {
  $ref?: string;
  type?: string;
  properties?: Record<string, SwaggerSchema>;
  items?: SwaggerSchema;
  required?: string[];
  nullable?: boolean;
  enum?: unknown[];
  oneOf?: SwaggerSchema[];
  anyOf?: SwaggerSchema[];
  allOf?: SwaggerSchema[];
  additionalProperties?: true | SwaggerSchema;
}

interface SwaggerParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  schema?: SwaggerSchema;
}

interface SwaggerRequestBody {
  required?: boolean;
  content?: Record<string, { schema?: SwaggerSchema }>;
}

interface SwaggerOperation {
  operationId?: string;
  parameters?: SwaggerParameter[];
  requestBody?: SwaggerRequestBody;
  responses?: Record<string, { content?: Record<string, { schema?: SwaggerSchema }> }>;
}

interface ServiceInfo {
  fileName: string;
  className: string;
  basePathName: string;
  serverUrl: string;
}

/**
 * Generates an Angular service file (with interfaces + endpoints) from a Swagger/OpenAPI document.
 *
 * @param swagger Parsed Swagger/OpenAPI JSON object.
 * @param relativeOutputPath Output folder relative to current working directory.
 */
export function generate(swagger: SwaggerDoc, relativeOutputPath: string): void {
  const serviceInfo = extractServiceName(swagger);
  const interfaces = generateInterfaces(swagger.components?.schemas ?? {});
  const methods = generateMethods(swagger.paths ?? {}, serviceInfo.basePathName);
  const fullContent = buildFullFile(serviceInfo, interfaces, methods);

  const basePath = path.resolve(process.cwd(), relativeOutputPath);
  const slug = serviceInfo.fileName.replace('.service.ts', '');
  const serviceDir = path.join(basePath, slug);

  if (!fs.existsSync(serviceDir)) {
    fs.mkdirSync(serviceDir, { recursive: true });
  }

  const fullFilePath = path.join(serviceDir, serviceInfo.fileName);

  if (fs.existsSync(fullFilePath)) {
    console.log(`El archivo ya existe y será reemplazado: ${fullFilePath}`);
  }

  fs.writeFileSync(fullFilePath, fullContent, 'utf-8');
  console.log(`Archivo generado correctamente: ${fullFilePath}`);
}

/**
 * Extracts the service naming (class/file/basePath) from swagger.servers[0].url.
 *
 * @param swagger Swagger/OpenAPI document.
 * @returns ServiceInfo with filename, class name, basePath env key and server URL.
 */
function extractServiceName(swagger: SwaggerDoc): ServiceInfo {
  const fullUrl = swagger.servers?.[0]?.url ?? '';
  const slug = fullUrl.split('/').filter(Boolean).pop() ?? 'api';

  const className =
    slug.replace(/(^\w|-\w)/g, (m: string): string => {
      return m.replace('-', '').toUpperCase();
    }) + 'Service';

  const fileName = `${slug}.service.ts`;
  const basePathName = `basePath${className.replace('Service', '')}`;

  return { fileName, className, basePathName, serverUrl: fullUrl };
}

/**
 * Generates TypeScript interfaces for all schemas under components.schemas.
 *
 * @param schemas Record of schemas keyed by schema name.
 * @returns TypeScript code with interface declarations.
 */
function generateInterfaces(schemas: Record<string, SwaggerSchema>): string {
  const lines: string[] = [];

  for (const [name, schema] of Object.entries(schemas)) {
    lines.push(`export interface ${name} {`);

    const props: Record<string, SwaggerSchema> = schema.properties ?? {};
    for (const [propName, prop] of Object.entries(props)) {
      const type = mapSwaggerSchemaToTs(prop);
      lines.push(`  ${propName}?: ${type};`);
    }

    lines.push('}\n');
  }

  return lines.join('\n');
}

/**
 * Maps a Swagger/OpenAPI schema object to a TypeScript type string.
 * Supports: $ref, primitives, arrays, objects (inline properties), additionalProperties, enum,
 * nullable, and composition (oneOf/anyOf/allOf).
 *
 * @param schema Schema object.
 * @returns TypeScript type representation.
 */
function mapSwaggerSchemaToTs(schema: SwaggerSchema): string {
  const base = mapSwaggerSchemaToTsNonNullable(schema);

  if (schema.nullable === true) {
    return `${base} | null`;
  }

  return base;
}

/**
 * Internal: maps schema to TS without adding nullable union.
 *
 * @param schema Schema object.
 * @returns TypeScript type representation (non-nullable).
 */
function mapSwaggerSchemaToTsNonNullable(schema: SwaggerSchema): string {
  if (schema.$ref) {
    return extractRefName(schema.$ref);
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const literals = schema.enum.map((v: unknown): string => {
      return toTsLiteral(v);
    });
    return literals.join(' | ');
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    const types = schema.oneOf.map((x: SwaggerSchema): string => {
      return mapSwaggerSchemaToTs(x);
    });
    return buildUnion(types);
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const types = schema.anyOf.map((x: SwaggerSchema): string => {
      return mapSwaggerSchemaToTs(x);
    });
    return buildUnion(types);
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const types = schema.allOf.map((x: SwaggerSchema): string => {
      return mapSwaggerSchemaToTs(x);
    });
    return buildIntersection(types);
  }

  if (schema.type === 'integer' || schema.type === 'number') {
    return 'number';
  }

  if (schema.type === 'string') {
    return 'string';
  }

  if (schema.type === 'boolean') {
    return 'boolean';
  }

  if (schema.type === 'array') {
    const items = schema.items ?? {};
    return `${mapSwaggerSchemaToTs(items)}[]`;
  }

  if (schema.type === 'object') {
    if (schema.properties && Object.keys(schema.properties).length > 0) {
      const requiredList = Array.isArray(schema.required) ? schema.required : [];
      const fields: string[] = [];

      for (const [k, v] of Object.entries(schema.properties)) {
        const t = mapSwaggerSchemaToTs(v);
        const isRequired = requiredList.includes(k);
        fields.push(`${k}${isRequired ? '' : '?'}: ${t};`);
      }

      return `{ ${fields.join(' ')} }`;
    }

    if (schema.additionalProperties === true) {
      return `{ [key: string]: any }`;
    }

    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const apType = mapSwaggerSchemaToTs(schema.additionalProperties);
      return `{ [key: string]: ${apType} }`;
    }

    return `{ [key: string]: any }`;
  }

  if (schema.properties && Object.keys(schema.properties).length > 0) {
    return mapSwaggerSchemaToTsNonNullable({ ...schema, type: 'object' });
  }

  return 'any';
}

/**
 * Extracts the referenced schema/interface name from a $ref path.
 *
 * @param ref $ref string (e.g. "#/components/schemas/Foo")
 * @returns "Foo" or "any" fallback.
 */
function extractRefName(ref: string): string {
  return ref.split('/').pop() ?? 'any';
}

/**
 * Converts a JS value into a TS literal string (used for enum unions).
 *
 * @param v Enum value
 * @returns Literal representation (e.g. "'A'", "3", "true", "null")
 */
function toTsLiteral(v: unknown): string {
  if (v === null) {
    return 'null';
  }

  if (typeof v === 'string') {
    return JSON.stringify(v);
  }

  if (typeof v === 'number') {
    if (Number.isFinite(v)) {
      return String(v);
    }
    return 'number';
  }

  if (typeof v === 'boolean') {
    return v ? 'true' : 'false';
  }

  return 'any';
}

/**
 * Builds a union type string.
 *
 * @param parts Union parts
 * @returns Union string
 */
function buildUnion(parts: string[]): string {
  const cleaned = parts.filter(Boolean);

  if (cleaned.length === 0) {
    return 'any';
  }

  if (cleaned.length === 1) {
    return cleaned[0];
  }

  return cleaned.join(' | ');
}

/**
 * Builds an intersection type string.
 *
 * @param parts Intersection parts
 * @returns Intersection string
 */
function buildIntersection(parts: string[]): string {
  const cleaned = parts.filter(Boolean);

  if (cleaned.length === 0) {
    return 'any';
  }

  if (cleaned.length === 1) {
    return cleaned[0];
  }

  return cleaned.join(' & ');
}

/**
 * Generates all service methods from paths + basePathName.
 *
 * @param paths Swagger paths object
 * @param basePathName Env property name for base URL (e.g. basePathFoo)
 * @returns Generated TS methods code
 */
function generateMethods(paths: SwaggerPaths, basePathName: string): string {
  const methods: string[] = [];

  for (const [rawPath, methodsMap] of Object.entries(paths)) {
    for (const [httpMethodRaw, def] of Object.entries(methodsMap)) {
      const httpMethod = httpMethodRaw.toLowerCase();
      const operationId = def.operationId ?? `${httpMethod}_${rawPath.replace(/[/{}/]/g, '_')}`;

      const responses200Content = def.responses?.['200']?.content ?? {};
      const contentType = Object.keys(responses200Content)[0] ?? 'application/json';

      const isBinary =
        contentType === 'application/pdf' || contentType === 'application/octet-stream';

      const returnType = isBinary
        ? 'ArrayBuffer'
        : mapSwaggerSchemaToTs(responses200Content['application/json']?.schema ?? {});

      const parameters = Array.isArray(def.parameters) ? def.parameters : [];
      const queryParams = parameters.filter((p: SwaggerParameter): boolean => {
        return p.in === 'query';
      });
      const pathParams = parameters.filter((p: SwaggerParameter): boolean => {
        return p.in === 'path';
      });

      const argsList: string[] = [];

      for (const param of pathParams) {
        const type = mapSwaggerSchemaToTs(param.schema ?? {});
        const optional = param.required === false;
        argsList.push(`${param.name}${optional ? '?' : ''}: ${type}`);
      }

      const queryParamSets: string[] = [];
      for (const param of queryParams) {
        const type = mapSwaggerSchemaToTs(param.schema ?? {});
        argsList.push(`${param.name}?: ${type}`);

        queryParamSets.push(
          `    if (${param.name} !== undefined) {\n      params = params.set('${param.name}', String(${param.name}));\n    }`
        );
      }

      const requestBody = def.requestBody;
      const requestBodyRequired = requestBody?.required === true;

      const bodySchema = requestBody?.content?.['application/json']?.schema;
      const hasPayload = !!bodySchema;

      const bodyUsage = hasPayload ? 'payload' : undefined;

      if (hasPayload) {
        const bodyType = mapSwaggerSchemaToTs(bodySchema ?? {});
        argsList.push(`payload${requestBodyRequired ? '' : '?'}: ${bodyType}`);
      }

      let interpolatedPath = rawPath;
      for (const param of pathParams) {
        interpolatedPath = interpolatedPath.replace(`{${param.name}}`, `\${${param.name}}`);
      }
      const url = `\${this.${basePathName}}${interpolatedPath}`;

      const hasQuery = queryParamSets.length > 0;

      const paramsPrelude = hasQuery
        ? `    let params = new HttpParams();\n${queryParamSets.join('\n')}\n`
        : '';

      const optionsParts: string[] = [];

      if (hasQuery) {
        optionsParts.push('params');
      }

      if (isBinary) {
        optionsParts.push(`responseType: 'arraybuffer' as const`);
      }

      const optionsDecl =
        optionsParts.length > 0
          ? `    const options = {\n      ${optionsParts.join(',\n      ')}\n    };\n`
          : '';

      const optionsArg = optionsParts.length > 0 ? 'options' : '{}';

      let httpCall: string;

      if (httpMethod === 'get') {
        if (isBinary) {
          httpCall = `.get(\`${url}\`, ${optionsArg})`;
        } else {
          httpCall = `.get<${returnType}>(\`${url}\`, ${optionsArg})`;
        }
      } else if (httpMethod === 'delete') {
        if (hasPayload) {
          const deleteOptions =
            optionsParts.length > 0 ? `{ body: ${bodyUsage}, ...options }` : `{ body: ${bodyUsage} }`;

          if (isBinary) {
            httpCall = `.delete(\`${url}\`, ${deleteOptions})`;
          } else {
            httpCall = `.delete<${returnType}>(\`${url}\`, ${deleteOptions})`;
          }
        } else {
          if (isBinary) {
            httpCall = `.delete(\`${url}\`, ${optionsArg})`;
          } else {
            httpCall = `.delete<${returnType}>(\`${url}\`, ${optionsArg})`;
          }
        }
      } else {
        if (hasPayload) {
          if (isBinary) {
            httpCall = `.${httpMethod}(\`${url}\`, ${bodyUsage}, ${optionsArg})`;
          } else {
            httpCall = `.${httpMethod}<${returnType}>(\`${url}\`, ${bodyUsage}, ${optionsArg})`;
          }
        } else {
          if (isBinary) {
            httpCall = `.${httpMethod}(\`${url}\`, ${optionsArg})`;
          } else {
            httpCall = `.${httpMethod}<${returnType}>(\`${url}\`, ${optionsArg})`;
          }
        }
      }

      const method = `
  /**
   * Auto-generated method for operationId: ${operationId}
   */
  ${operationId}(${argsList.join(', ')}): Observable<${returnType}> {
${paramsPrelude}${optionsDecl}    return this.http
      ${httpCall}
      .pipe(catchError(this.handleError));
  }`;

      methods.push(method);
    }
  }

  return methods.join('\n');
}

/**
 * Builds the final output file: imports + interfaces + service class + methods + error handler.
 *
 * @param serviceInfo Service metadata
 * @param interfaces Interfaces code
 * @param methods Methods code
 * @returns Full file content
 */
function buildFullFile(serviceInfo: ServiceInfo, interfaces: string, methods: string): string {
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
   * Generic HTTP error handler.
   *
   * @param error HttpErrorResponse
   * @returns Observable that errors with a normalized Error instance.
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