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
 * Serialization styles supported by OpenAPI parameters.
 */
export type SwaggerParameterStyle =
  | 'matrix'
  | 'label'
  | 'form'
  | 'simple'
  | 'spaceDelimited'
  | 'pipeDelimited'
  | 'deepObject';

/**
 * Definition of an HTTP operation parameter.
 */
export interface SwaggerParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  schema?: SwaggerSchema;
  style?: SwaggerParameterStyle;
  explode?: boolean;
}

/**
 * Definition of an HTTP request body.
 */
interface SwaggerRequestBody {
  required?: boolean;
  content?: Record<string, { schema?: SwaggerSchema }>;
}

/**
 * Definition of an OpenAPI response.
 */
export interface SwaggerResponse {
  description?: string;
  content?: Record<string, { schema?: SwaggerSchema }>;
}

/**
 * Resolved TypeScript information for a successful
 * OpenAPI response.
 */
export interface SwaggerResponseInfo {
  returnType: string;
  isBinary: boolean;
}

/**
 * Definition of an OpenAPI operation.
 */
export interface SwaggerOperation {
  operationId?: string;
  parameters?: SwaggerParameter[];
  requestBody?: SwaggerRequestBody;
  responses?: Record<string, SwaggerResponse>;
}

/**
 * OpenAPI path item containing HTTP operations
 * and metadata shared by those operations.
 */
export interface SwaggerPathItem {
  $ref?: string;
  summary?: string;
  description?: string;
  servers?: SwaggerServer[];
  parameters?: SwaggerParameter[];

  get?: SwaggerOperation;
  put?: SwaggerOperation;
  post?: SwaggerOperation;
  delete?: SwaggerOperation;
  options?: SwaggerOperation;
  head?: SwaggerOperation;
  patch?: SwaggerOperation;
  trace?: SwaggerOperation;

  [extension: `x-${string}`]: unknown;
}

/**
 * Collection of OpenAPI paths.
 */
export type SwaggerPaths = Record<string, SwaggerPathItem>;

/**
 * Metadata required to generate an Angular service.
 */
export interface ServiceInfo {
  fileName: string;
  className: string;
  basePathName: string;
  serverUrl: string;
}
