import generateAllowReservedQueryCode from './allow-reserved-serializer.js';
import generateEncodedFormQueryCode from './form-query-serializer.js';
import generateHeaderParameterCode from './header-serializer.js';
import createOperationName from './operation-name.js';
import createParameterName from './parameter-name.js';
import resolveParameterReference from './parameter-reference-resolver.js';
import resolveParameterSchema from './parameter-schema-resolver.js';
import mergeParameters from './parameters.js';
import resolvePathItem from './path-item-resolver.js';
import generatePathParameterExpression from './path-serializer.js';
import generateQueryParameterCode from './query-serializer.js';
import getRequestBodyInfo from './request-body-info.js';
import resolveRequestBodyReference from './request-body-reference-resolver.js';
import getResponseInfo from './response-info.js';
import { mapSwaggerSchemaToTs } from './schema-mapper.js';
import type {
  SwaggerOperation,
  SwaggerParameter,
  SwaggerParameterOrReference,
  SwaggerPathItem,
  SwaggerPaths,
  SwaggerRequestBody,
  SwaggerRequestBodyInfo,
  SwaggerRequestBodyOrReference,
  SwaggerResponseInfo,
  SwaggerResponseOrReference,
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
 * Header parameter names that OpenAPI requires generators
 * to ignore in parameter definitions.
 */
const IGNORED_HEADER_NAMES: ReadonlySet<string> = new Set<string>([
  'accept',
  'content-type',
  'authorization',
]);

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
 * Formats an OpenAPI HTTP parameter name as a TypeScript
 * string literal.
 *
 * Simple names retain single quotes for compatibility
 * with existing generated output.
 * Other names are safely escaped using JSON.stringify.
 *
 * @param name Original HTTP parameter name.
 * @returns Escaped TypeScript string literal.
 */
function formatHttpParameterKey(name: string): string {
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
 * Parameter names and operation identifiers are converted
 * into valid and unique TypeScript identifiers.
 *
 * Supports path, query and header parameters.
 *
 * Non-exploded form arrays and objects are serialized
 * into URL segments with their values encoded individually.
 * Other query parameters use Angular HttpParams.
 *
 * @param paths Collection of OpenAPI paths and operations.
 * @param basePathName Environment property containing the API base URL.
 * @param schemas Named component schemas for parameter reference resolution.
 * @param parameterDefinitions Reusable parameters from components.parameters.
 * @param pathItemDefinitions Reusable Path Items from components.pathItems.
 * @param responseDefinitions Reusable responses from components.responses.
 * @param requestBodyDefinitions Reusable request bodies from components.requestBodies.
 * @returns TypeScript source code for the generated service methods.
 */
export default function generateMethods(
  paths: SwaggerPaths,
  basePathName: string,
  schemas: Record<string, SwaggerSchema> = {},
  parameterDefinitions: Record<string, SwaggerParameterOrReference> = {},
  pathItemDefinitions: Record<string, SwaggerPathItem> = {},
  responseDefinitions: Record<string, SwaggerResponseOrReference> = {},
  requestBodyDefinitions: Record<string, SwaggerRequestBodyOrReference> = {},
): string {
  const methods: string[] = [];
  const usedMethodNames: Set<string> = new Set<string>();

  for (const [rawPath, declaredPathItem] of Object.entries(paths)) {
    const pathItem: SwaggerPathItem = resolvePathItem(
      declaredPathItem,
      paths,
      pathItemDefinitions,
    );

    const pathParameters: SwaggerParameter[] = Array.isArray(
      pathItem.parameters,
    )
      ? pathItem.parameters.map(
          (parameter: SwaggerParameterOrReference): SwaggerParameter => {
            return resolveParameterReference(parameter, parameterDefinitions);
          },
        )
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

      const methodName: string = createOperationName(
        operationId,
        httpMethod,
        basePathName,
        usedMethodNames,
      );

      const operationIdComment: string = operationId
        .replace(/\*\//g, '* /')
        .replace(/[\r\n\u2028\u2029]/g, ' ');

      const responseInfo: SwaggerResponseInfo = getResponseInfo(
        def,
        responseDefinitions,
      );

      const returnType: string = responseInfo.returnType;
      const isBinary: boolean = responseInfo.isBinary;
      const isText: boolean = responseInfo.isText === true;
      const isNonJsonResponse: boolean = isBinary || isText;

      const operationParameters: SwaggerParameter[] = Array.isArray(
        def.parameters,
      )
        ? def.parameters.map(
            (parameter: SwaggerParameterOrReference): SwaggerParameter => {
              return resolveParameterReference(parameter, parameterDefinitions);
            },
          )
        : [];

      const parameters: SwaggerParameter[] = mergeParameters(
        pathParameters,
        operationParameters,
      );

      const hasCookieParameters: boolean = parameters.some(
        (param: SwaggerParameter): boolean => {
          return param.in === 'cookie';
        },
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

      const headerParams: SwaggerParameter[] = parameters.filter(
        (param: SwaggerParameter): boolean => {
          return (
            param.in === 'header' &&
            !IGNORED_HEADER_NAMES.has(param.name.toLowerCase())
          );
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

        const serializationParameter: SwaggerParameter = resolveParameterSchema(
          param,
          schemas,
        );

        const pathExpression: string = generatePathParameterExpression(
          serializationParameter,
          argumentName,
        );

        interpolatedPath = interpolatedPath.replaceAll(
          `{${param.name}}`,
          `\${${pathExpression}}`,
        );
      }

      const queryParamSets: string[] = [];
      let hasEncodedFormQuery: boolean = false;

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

        const queryKey: string = formatHttpParameterKey(param.name);

        const serializationParameter: SwaggerParameter = resolveParameterSchema(
          param,
          schemas,
        );

        const reservedCode: string | null = generateAllowReservedQueryCode(
          serializationParameter,
          argumentName,
          queryKey,
        );

        const encodedCode: string | null =
          reservedCode ??
          generateEncodedFormQueryCode(
            serializationParameter,
            argumentName,
            queryKey,
          );

        if (encodedCode !== null) {
          hasEncodedFormQuery = true;
          queryParamSets.push(encodedCode);
        } else {
          queryParamSets.push(
            generateQueryParameterCode(
              serializationParameter,
              argumentName,
              queryKey,
            ),
          );
        }
      }

      const headerParamSets: string[] = [];

      for (const param of headerParams) {
        const type: string = mapSwaggerSchemaToTs(param.schema ?? {});
        const isRequired: boolean = param.required === true;

        const argumentName: string = createParameterName(param, usedNames);

        const argument: string = `${argumentName}${isRequired ? '' : '?'}: ${type}`;

        if (isRequired) {
          requiredArgs.push(argument);
        } else {
          optionalArgs.push(argument);
        }

        const headerKey: string = formatHttpParameterKey(param.name);

        const serializationParameter: SwaggerParameter = resolveParameterSchema(
          param,
          schemas,
        );

        headerParamSets.push(
          generateHeaderParameterCode(
            serializationParameter,
            argumentName,
            headerKey,
          ),
        );
      }

      const requestBody: SwaggerRequestBody | undefined =
        def.requestBody === undefined
          ? undefined
          : resolveRequestBodyReference(
              def.requestBody,
              requestBodyDefinitions,
            );

      if (
        requestBody !== undefined &&
        (httpMethod === 'get' ||
          httpMethod === 'head' ||
          httpMethod === 'options')
      ) {
        throw new Error(
          `Unsupported request body for HTTP ${httpMethod.toUpperCase()} ` +
            `operation "${operationId}".`,
        );
      }

      const requestBodyInfo: SwaggerRequestBodyInfo | undefined =
        getRequestBodyInfo(requestBody, operationId);

      const requestBodyRequired: boolean = requestBody?.required === true;
      const hasPayload: boolean = requestBodyInfo !== undefined;

      if (requestBodyInfo !== undefined) {
        const argument: string =
          `payload${requestBodyRequired ? '' : '?'}: ` +
          requestBodyInfo.payloadType;

        if (requestBodyRequired) {
          requiredArgs.push(argument);
        } else {
          optionalArgs.push(argument);
        }
      }

      const argsList: string[] = [...requiredArgs, ...optionalArgs];

      const url: string = `\${this.${basePathName}}${interpolatedPath}`;

      if (requestBodyInfo?.contentType !== undefined) {
        headerParamSets.push(
          `    headers['Content-Type'] = ${JSON.stringify(requestBodyInfo.contentType)};`,
        );
      }

      if (responseInfo.accept !== undefined) {
        headerParamSets.push(
          `    headers['Accept'] = ${JSON.stringify(responseInfo.accept)};`,
        );
      }

      const hasQuery: boolean = queryParamSets.length > 0;
      const hasHeaders: boolean = headerParamSets.length > 0;

      const querySegmentsPrelude: string = hasEncodedFormQuery
        ? '    const querySegments: string[] = [];\n'
        : '';

      const paramsPrelude: string = hasQuery
        ? `    let params = new HttpParams();\n` +
          `${queryParamSets.join('\n')}\n`
        : '';

      const headersPrelude: string = hasHeaders
        ? `    const headers: Record<string, string> = {};\n` +
          `${headerParamSets.join('\n')}\n`
        : '';

      const requestUrlPrelude: string = hasEncodedFormQuery
        ? `    const requestUrl: string = \`${url}\`;\n` +
          `    const encodedQuery: string = querySegments.join('&');\n` +
          `    const separator: string = requestUrl.includes('?')` +
          ` ? '&' : '?';\n` +
          `    const finalUrl: string = encodedQuery.length > 0` +
          ` ? requestUrl + separator + encodedQuery : requestUrl;\n`
        : '';

      const optionsParts: string[] = [];

      if (hasQuery) {
        optionsParts.push('params');
      }

      if (hasHeaders) {
        optionsParts.push('headers');
      }

      if (isBinary) {
        optionsParts.push("responseType: 'arraybuffer' as const");
      } else if (isText) {
        optionsParts.push("responseType: 'text' as const");
      }

      if (hasCookieParameters) {
        optionsParts.push('withCredentials: true');
      }

      const optionsDecl: string =
        optionsParts.length > 0
          ? `    const options = {\n` +
            `      ${optionsParts.join(',\n      ')}\n` +
            `    };\n`
          : '';

      const optionsArg: string = optionsParts.length > 0 ? 'options' : '{}';

      const urlArgument: string = hasEncodedFormQuery
        ? 'finalUrl'
        : `\`${url}\``;

      let httpCall: string;

      if (
        httpMethod === 'get' ||
        httpMethod === 'head' ||
        httpMethod === 'options'
      ) {
        if (isNonJsonResponse) {
          httpCall = `.${httpMethod}(${urlArgument}, ${optionsArg})`;
        } else {
          httpCall =
            `.${httpMethod}<${returnType}>` + `(${urlArgument}, ${optionsArg})`;
        }
      } else if (httpMethod === 'delete') {
        if (hasPayload) {
          const deleteOptions: string =
            optionsParts.length > 0
              ? '{ body: payload, ...options }'
              : '{ body: payload }';

          if (isNonJsonResponse) {
            httpCall = `.delete(${urlArgument}, ${deleteOptions})`;
          } else {
            httpCall =
              `.delete<${returnType}>` + `(${urlArgument}, ${deleteOptions})`;
          }
        } else {
          if (isNonJsonResponse) {
            httpCall = `.delete(${urlArgument}, ${optionsArg})`;
          } else {
            httpCall =
              `.delete<${returnType}>` + `(${urlArgument}, ${optionsArg})`;
          }
        }
      } else {
        const requestBodyArgument: string = hasPayload ? 'payload, ' : 'null, ';

        const httpArguments: string = `${urlArgument}, ${requestBodyArgument}${optionsArg}`;

        if (isNonJsonResponse) {
          httpCall = `.${httpMethod}(${httpArguments})`;
        } else {
          httpCall = `.${httpMethod}<${returnType}>(${httpArguments})`;
        }
      }

      const cookieDocumentation: string = hasCookieParameters
        ? `   * Cookie parameters are managed by the browser.\n` +
          `   * withCredentials enables eligible stored cookies.\n` +
          `   * Individual cookie values cannot be passed as arguments.\n`
        : '';

      const method: string = `
  /**
   * Auto-generated method for operationId: ${operationIdComment}
${cookieDocumentation}   */
  ${methodName}(${argsList.join(', ')}): Observable<${returnType}> {
${querySegmentsPrelude}${paramsPrelude}${headersPrelude}${requestUrlPrelude}${optionsDecl}    return this.http
      ${httpCall}
      .pipe(catchError(this.handleError));
  }`;

      methods.push(method);
    }
  }

  return methods.join('\n');
}
