/**
 * OpenAPI server definition.
 */
interface SwaggerServer {
  url?: string;
}

/**
 * OpenAPI components definition.
 */
interface SwaggerComponents {
  schemas?: Record<string, SwaggerSchema>;
}

/**
 * Root structure of a supported Swagger/OpenAPI document.
 */
export interface SwaggerDoc {
  servers?: SwaggerServer[];
  components?: SwaggerComponents;
  paths?: SwaggerPaths;
}

/**
 * Schema definition used to generate TypeScript types.
 */
export interface SwaggerSchema {
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

/**
 * Definition of an HTTP operation parameter.
 */
export interface SwaggerParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  schema?: SwaggerSchema;
}

/**
 * Definition of an HTTP request body.
 */
interface SwaggerRequestBody {
  required?: boolean;
  content?: Record<string, { schema?: SwaggerSchema }>;
}

/**
 * Definition of an OpenAPI operation.
 */
interface SwaggerOperation {
  operationId?: string;
  parameters?: SwaggerParameter[];
  requestBody?: SwaggerRequestBody;
  responses?: Record<
    string,
    { content?: Record<string, { schema?: SwaggerSchema }> }
  >;
}

/**
 * Collection of paths and HTTP operations.
 */
export type SwaggerPaths = Record<string, Record<string, SwaggerOperation>>;

/**
 * Metadata required to generate an Angular service.
 */
export interface ServiceInfo {
  fileName: string;
  className: string;
  basePathName: string;
  serverUrl: string;
}
