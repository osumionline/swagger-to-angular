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
  parameters?: Record<string, SwaggerParameterOrReference>;
  responses?: Record<string, SwaggerResponseOrReference>;
  requestBodies?: Record<string, SwaggerRequestBodyOrReference>;
  pathItems?: Record<string, SwaggerPathItem>;
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
  allowReserved?: boolean;
}

/**
 * OpenAPI reference to a reusable parameter definition.
 */
export interface SwaggerParameterReference {
  $ref: string;
}

/**
 * HTTP parameter declared inline or through a reference.
 */
export type SwaggerParameterOrReference =
  | SwaggerParameter
  | SwaggerParameterReference;

/**
 * Definition of an HTTP request body.
 */
export interface SwaggerRequestBody {
  description?: string;
  required?: boolean;
  content?: Record<string, { schema?: SwaggerSchema }>;
}

/**
 * OpenAPI reference to a reusable request body definition.
 */
export interface SwaggerRequestBodyReference {
  $ref: string;
  summary?: string;
  description?: string;
}

/**
 * HTTP request body declared inline or through a reference.
 */
export type SwaggerRequestBodyOrReference =
  | SwaggerRequestBody
  | SwaggerRequestBodyReference;

/**
 * Definition of an OpenAPI response.
 */
export interface SwaggerResponse {
  description?: string;
  content?: Record<string, { schema?: SwaggerSchema }>;
}

/**
 * OpenAPI reference to a reusable response definition.
 */
export interface SwaggerResponseReference {
  $ref: string;
  summary?: string;
  description?: string;
}

/**
 * HTTP response declared inline or through a reference.
 */
export type SwaggerResponseOrReference =
  | SwaggerResponse
  | SwaggerResponseReference;

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
  parameters?: SwaggerParameterOrReference[];
  requestBody?: SwaggerRequestBodyOrReference;
  responses?: Record<string, SwaggerResponseOrReference>;
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
  parameters?: SwaggerParameterOrReference[];

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
