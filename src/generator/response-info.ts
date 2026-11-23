import resolveResponseReference from './response-reference-resolver.js';
import { mapSwaggerSchemaToTs } from './schema-mapper.js';
import type {
  SwaggerOperation,
  SwaggerResponse,
  SwaggerResponseInfo,
  SwaggerResponseOrReference,
  SwaggerSchema,
} from './types.js';

/**
 * Resolves the TypeScript return type and binary response
 * flag for an OpenAPI operation.
 *
 * Selects the lowest explicit 2xx response code.
 * Uses the 2XX response range when no explicit success
 * status is available.
 *
 * Responses without a body produce void.
 * Operations without a documented success response
 * retain the any fallback for compatibility.
 *
 * @param operation OpenAPI operation definition.
 * @param responseDefinitions Reusable responses from components.responses.
 * @returns Return type and binary response metadata.
 */
export default function getResponseInfo(
  operation: SwaggerOperation,
  responseDefinitions: Record<string, SwaggerResponseOrReference> = {},
): SwaggerResponseInfo {
  const responses: Record<string, SwaggerResponseOrReference> =
    operation.responses ?? {};

  const successCodes: string[] = Object.keys(responses)
    .filter((statusCode: string): boolean => {
      return /^2\d{2}$/.test(statusCode);
    })
    .sort((left: string, right: string): number => {
      return Number(left) - Number(right);
    });

  const selectedStatus: string | undefined =
    successCodes[0] ?? (responses['2XX'] !== undefined ? '2XX' : undefined);

  if (selectedStatus === undefined) {
    return {
      returnType: 'any',
      isBinary: false,
    };
  }

  if (selectedStatus === '204' || selectedStatus === '205') {
    return {
      returnType: 'void',
      isBinary: false,
    };
  }

  const selectedResponse: SwaggerResponseOrReference | undefined =
    responses[selectedStatus];

  if (selectedResponse === undefined) {
    return {
      returnType: 'any',
      isBinary: false,
    };
  }

  const response: SwaggerResponse = resolveResponseReference(
    selectedResponse,
    responseDefinitions,
  );

  const content: Record<string, { schema?: SwaggerSchema }> =
    response.content ?? {};

  const mediaTypes: string[] = Object.keys(content);

  if (mediaTypes.length === 0) {
    return {
      returnType: 'void',
      isBinary: false,
    };
  }

  const contentType: string = mediaTypes[0] ?? '';

  const isBinary: boolean =
    contentType === 'application/pdf' ||
    contentType === 'application/octet-stream';

  if (isBinary) {
    return {
      returnType: 'ArrayBuffer',
      isBinary: true,
    };
  }

  const jsonSchema: SwaggerSchema | undefined =
    content['application/json']?.schema;

  if (jsonSchema !== undefined) {
    return {
      returnType: mapSwaggerSchemaToTs(jsonSchema),
      isBinary: false,
    };
  }

  return {
    returnType: 'any',
    isBinary: false,
  };
}
