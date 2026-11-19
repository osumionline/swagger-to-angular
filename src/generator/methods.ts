import createParameterName from './parameter-name.js';
import mergeParameters from './parameters.js';
import getResponseInfo from './response-info.js';
import { mapSwaggerSchemaToTs } from './schema-mapper.js';
import type {
  SwaggerOperation,
  SwaggerParameter,
  SwaggerPaths,
  SwaggerResponseInfo,
  SwaggerSchema,
} from './types.js';

/**
 * HTTP methods supported by the Angular service generator.
 */
type HttpMethod =
  | 'get'
  | 'put'
  | 'post'
  | 'delete'
  | 'options'
  | 'head'
  | 'patch';

/**
 * Checks whether a path item key identifies a supported
 * HTTP operation rather than OpenAPI metadata.
 *
 * @param method Path item property name.
 * @returns True when the property is a supported HTTP method.
 */
function isSupportedHttpMethod(method: string): method is HttpMethod {
  return (
    method === 'get' ||
    method === 'put' ||
    method === 'post' ||
    method === 'delete' ||
    method === 'options' ||
    method === 'head' ||
    method === 'patch'
  );
}

/**
 * Formats an OpenAPI query parameter name as a TypeScript
 * string literal.
 *
 * Simple names retain single quotes for compatibility
 * with the existing generated output.
 * Other names are safely escaped using JSON.stringify.
 *
 * @param name Original OpenAPI query parameter name.
 * @returns Escaped TypeScript string literal.
 */
function formatQueryParameterKey(name: string): string {
  const isSimpleName: boolean = /^[A-Za-z0-9_$.-]+$/.test(name);

  return isSimpleName ? `'${name}'` : JSON.stringify(name);
}

/**
 * Generates Angular service methods from OpenAPI paths
 * and their HTTP operation definitions.
 *
 * Combines path-level and operation-level parameters,
 * allowing operation parameters to override inherited ones.
 *
 * Required arguments are placed before optional arguments.
 * Response types are resolved from documented success statuses.
 *
 * HTTP parameter names are converted into valid, unique
 * TypeScript identifiers while preserving their original
 * names in outgoing requests.
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

  for (const [rawPath, pathItem] of Object.entries(paths)) {
    const pathParameters: SwaggerParameter[] = Array.isArray(
      pathItem.parameters,
    )
      ? pathItem.parameters
      : [];

    for (const httpMethodRaw of Object.keys(pathItem)) {
      if (!isSupportedHttpMethod(httpMethodRaw)) {
        continue;
      }

      const httpMethod: HttpMethod = httpMethodRaw;

      const def: SwaggerOperation | undefined = pathItem[httpMethod];

      if (def === undefined) {
        continue;
      }

      const operationId: string =
        def.operationId ?? `${httpMethod}_${rawPath.replace(/[/{}/]/g, '_')}`;

      const responseInfo: SwaggerResponseInfo = getResponseInfo(def);

      const returnType: string = responseInfo.returnType;
      const isBinary: boolean = responseInfo.isBinary;

      const operationParameters: SwaggerParameter[] = Array.isArray(
        def.parameters,
      )
        ? def.parameters
        : [];

      const parameters: SwaggerParameter[] = mergeParameters(
        pathParameters,
        operationParameters,
      );

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

      const requiredArgs: string[] = [];
      const optionalArgs: string[] = [];

      const usedNames: Set<string> = new Set<string>();

      let interpolatedPath: string = rawPath;

      for (const param of pathParams) {
        const type: string = mapSwaggerSchemaToTs(param.schema ?? {});
        const isRequired: boolean = param.required !== false;

        const argumentName: string = createParameterName(param, usedNames);

        const argument: string = `${argumentName}${isRequired ? '' : '?'}: ${type}`;

        if (isRequired) {
          requiredArgs.push(argument);
        } else {
          optionalArgs.push(argument);
        }

        interpolatedPath = interpolatedPath.replace(
          `{${param.name}}`,
          `\${${argumentName}}`,
        );
      }

      const queryParamSets: string[] = [];

      for (const param of queryParams) {
        const type: string = mapSwaggerSchemaToTs(param.schema ?? {});
        const isRequired: boolean = param.required === true;

        const argumentName: string = createParameterName(param, usedNames);

        const argument: string = `${argumentName}${isRequired ? '' : '?'}: ${type}`;

        if (isRequired) {
          requiredArgs.push(argument);
        } else {
          optionalArgs.push(argument);
        }

        const queryKey: string = formatQueryParameterKey(param.name);

        queryParamSets.push(
          `    if (${argumentName} !== undefined) {\n      params = params.set(${queryKey}, String(${argumentName}));\n    }`,
        );
      }

      const requestBodyRequired: boolean = def.requestBody?.required === true;

      const bodySchema: SwaggerSchema | undefined =
        def.requestBody?.content?.['application/json']?.schema;

      const hasPayload: boolean = bodySchema !== undefined;

      if (bodySchema !== undefined) {
        const bodyType: string = mapSwaggerSchemaToTs(bodySchema);

        const argument: string = `payload${requestBodyRequired ? '' : '?'}: ${bodyType}`;

        if (requestBodyRequired) {
          requiredArgs.push(argument);
        } else {
          optionalArgs.push(argument);
        }
      }

      const argsList: string[] = [...requiredArgs, ...optionalArgs];

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

      if (
        httpMethod === 'get' ||
        httpMethod === 'head' ||
        httpMethod === 'options'
      ) {
        if (isBinary) {
          httpCall = `.${httpMethod}(\`${url}\`, ${optionsArg})`;
        } else {
          httpCall = `.${httpMethod}<${returnType}>(\`${url}\`, ${optionsArg})`;
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
        const requestBodyArgument: string = hasPayload ? 'payload, ' : 'null, ';

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
