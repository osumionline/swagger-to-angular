import selectMediaType from './media-type.js';
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
 * Resolves the TypeScript return type and response media
 * metadata for an OpenAPI operation.
 *
 * Selects the lowest explicit 2xx response code.
 * Uses the 2XX response range when no explicit success
 * status is available.
 *
 * Supported media types are selected in this order:
 * - application/json
 * - application/<subtype>+json
 * - text/json
 * - text/plain
 * - application/octet-stream
 *
 * Media type parameters are supported and preserved.
 *
 * When multiple response media types exist, the selected
 * type is also returned as the preferred Accept header.
 *
 * Responses without content produce void.
 * Operations without a documented success response
 * retain the any fallback for compatibility.
 *
 * @param operation OpenAPI operation definition.
 * @param responseDefinitions Reusable responses from components.responses.
 * @returns Return type and response media metadata.
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

  const selectedMediaType = selectMediaType(mediaTypes, 'response');

  if (selectedMediaType === undefined) {
    throw new Error(
      `Unsupported response media types: ${mediaTypes.join(', ')}.`,
    );
  }

  let result: SwaggerResponseInfo;

  if (selectedMediaType.kind === 'json') {
    const jsonSchema: SwaggerSchema | undefined =
      content[selectedMediaType.name]?.schema;

    result = {
      returnType:
        jsonSchema === undefined ? 'any' : mapSwaggerSchemaToTs(jsonSchema),
      isBinary: false,
    };
  } else if (selectedMediaType.kind === 'text') {
    result = {
      returnType: 'string',
      isBinary: false,
      isText: true,
    };
  } else {
    result = {
      returnType: 'ArrayBuffer',
      isBinary: true,
    };
  }

  if (mediaTypes.length > 1) {
    result.accept = selectedMediaType.name;
  }

  return result;
}
