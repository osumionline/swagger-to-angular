import { mapSwaggerSchemaToTs } from './schema-mapper.js';
import type { SwaggerParameter, SwaggerPaths, SwaggerSchema } from './types.js';

/**
 * Generates Angular service methods from OpenAPI paths
 * and their HTTP operation definitions.
 *
 * @param paths Collection of OpenAPI paths and operations.
 * @param basePathName Environment property containing the API base URL.
 * @returns TypeScript source code for the generated service methods.
 */
export default function generateMethods(
  paths: SwaggerPaths,
  basePathName: string,
): string {
  const methods: string[] = [];

  for (const [rawPath, methodsMap] of Object.entries(paths)) {
    for (const [httpMethodRaw, def] of Object.entries(methodsMap)) {
      const httpMethod: string = httpMethodRaw.toLowerCase();

      const operationId: string =
        def.operationId ?? `${httpMethod}_${rawPath.replace(/[/{}/]/g, '_')}`;

      const responses200Content: Record<string, { schema?: SwaggerSchema }> =
        def.responses?.['200']?.content ?? {};

      const contentType: string =
        Object.keys(responses200Content)[0] ?? 'application/json';

      const isBinary: boolean =
        contentType === 'application/pdf' ||
        contentType === 'application/octet-stream';

      const returnType: string = isBinary
        ? 'ArrayBuffer'
        : mapSwaggerSchemaToTs(
            responses200Content['application/json']?.schema ?? {},
          );

      const parameters: SwaggerParameter[] = Array.isArray(def.parameters)
        ? def.parameters
        : [];

      const queryParams: SwaggerParameter[] = parameters.filter(
        (param: SwaggerParameter): boolean => {
          return param.in === 'query';
        },
      );

      const pathParams: SwaggerParameter[] = parameters.filter(
        (param: SwaggerParameter): boolean => {
          return param.in === 'path';
        },
      );

      const argsList: string[] = [];

      for (const param of pathParams) {
        const type: string = mapSwaggerSchemaToTs(param.schema ?? {});
        const optional: boolean = param.required === false;

        argsList.push(`${param.name}${optional ? '?' : ''}: ${type}`);
      }

      const queryParamSets: string[] = [];

      for (const param of queryParams) {
        const type: string = mapSwaggerSchemaToTs(param.schema ?? {});

        argsList.push(`${param.name}?: ${type}`);

        queryParamSets.push(
          `    if (${param.name} !== undefined) {\n      params = params.set('${param.name}', String(${param.name}));\n    }`,
        );
      }

      const requestBodyRequired: boolean = def.requestBody?.required === true;

      const bodySchema: SwaggerSchema | undefined =
        def.requestBody?.content?.['application/json']?.schema;

      const hasPayload: boolean = bodySchema !== undefined;

      if (bodySchema !== undefined) {
        const bodyType: string = mapSwaggerSchemaToTs(bodySchema);

        argsList.push(`payload${requestBodyRequired ? '' : '?'}: ${bodyType}`);
      }

      let interpolatedPath: string = rawPath;

      for (const param of pathParams) {
        interpolatedPath = interpolatedPath.replace(
          `{${param.name}}`,
          `\${${param.name}}`,
        );
      }

      const url: string = `\${this.${basePathName}}${interpolatedPath}`;

      const hasQuery: boolean = queryParamSets.length > 0;

      const paramsPrelude: string = hasQuery
        ? `    let params = new HttpParams();\n${queryParamSets.join('\n')}\n`
        : '';

      const optionsParts: string[] = [];

      if (hasQuery) {
        optionsParts.push('params');
      }

      if (isBinary) {
        optionsParts.push("responseType: 'arraybuffer' as const");
      }

      const optionsDecl: string =
        optionsParts.length > 0
          ? `    const options = {\n      ${optionsParts.join(',\n      ')}\n    };\n`
          : '';

      const optionsArg: string = optionsParts.length > 0 ? 'options' : '{}';

      let httpCall: string;

      if (httpMethod === 'get') {
        if (isBinary) {
          httpCall = `.get(\`${url}\`, ${optionsArg})`;
        } else {
          httpCall = `.get<${returnType}>(\`${url}\`, ${optionsArg})`;
        }
      } else if (httpMethod === 'delete') {
        if (hasPayload) {
          const deleteOptions: string =
            optionsParts.length > 0
              ? '{ body: payload, ...options }'
              : '{ body: payload }';

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
        const requiresBodyArgument: boolean =
          httpMethod === 'post' ||
          httpMethod === 'put' ||
          httpMethod === 'patch';

        const requestBodyArgument: string = hasPayload
          ? 'payload, '
          : requiresBodyArgument
            ? 'null, '
            : '';

        const httpArguments: string = `\`${url}\`, ${requestBodyArgument}${optionsArg}`;

        if (isBinary) {
          httpCall = `.${httpMethod}(${httpArguments})`;
        } else {
          httpCall = `.${httpMethod}<${returnType}>(${httpArguments})`;
        }
      }

      const method: string = `
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
