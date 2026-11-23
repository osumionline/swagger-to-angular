import { mapSwaggerSchemaToTs } from './schema-mapper.js';

import type {
  SwaggerRequestBody,
  SwaggerRequestBodyInfo,
  SwaggerSchema,
} from './types.js';

/**
 * Selects a supported request body representation.
 *
 * Preference order:
 * - application/json
 * - application/*+json
 * - text/plain
 *
 * JSON payload types are inferred from their schemas.
 * Text payloads must use a string schema when one exists.
 * Unsupported media types and invalid bodies are rejected.
 *
 * Content-Type is explicit for nonstandard JSON, plain
 * text and request bodies with multiple representations.
 * A single application/json representation retains
 * the existing generated output.
 *
 * @param requestBody Resolved OpenAPI request body, if present.
 * @param operationId Identifier used in error messages.
 * @returns Selected payload metadata or undefined without a body.
 */
export default function getRequestBodyInfo(
  requestBody: SwaggerRequestBody | undefined,
  operationId: string,
): SwaggerRequestBodyInfo | undefined {
  if (requestBody === undefined) {
    return undefined;
  }

  const content: Record<string, { schema?: SwaggerSchema }> =
    requestBody.content ?? {};

  const mediaTypes: string[] = Object.keys(content);

  const jsonMediaType: string | undefined =
    mediaTypes.find((mediaType: string): boolean => {
      return mediaType === 'application/json';
    }) ??
    mediaTypes.find((mediaType: string): boolean => {
      return /^application\/[a-z0-9!#$&^_.+-]+\+json$/i.test(mediaType);
    });

  const selectedMediaType: string | undefined =
    jsonMediaType ??
    (mediaTypes.includes('text/plain') ? 'text/plain' : undefined);

  if (selectedMediaType === undefined) {
    const declaredTypes: string =
      mediaTypes.length > 0 ? mediaTypes.join(', ') : '(none)';

    throw new Error(
      `Unsupported request body media types for "${operationId}": ` +
        `${declaredTypes}.`,
    );
  }

  const schema: SwaggerSchema | undefined = content[selectedMediaType]?.schema;

  let payloadType: string;

  if (selectedMediaType === 'text/plain') {
    if (
      schema !== undefined &&
      (schema.type !== 'string' ||
        schema.$ref !== undefined ||
        schema.nullable === true ||
        schema.oneOf !== undefined ||
        schema.anyOf !== undefined ||
        schema.allOf !== undefined)
    ) {
      throw new Error(
        `Unsupported text/plain request body schema for "${operationId}".`,
      );
    }

    payloadType =
      schema === undefined ? 'string' : mapSwaggerSchemaToTs(schema);
  } else {
    payloadType =
      schema === undefined ? 'unknown' : mapSwaggerSchemaToTs(schema);
  }

  if (selectedMediaType !== 'application/json' || mediaTypes.length > 1) {
    return {
      payloadType,
      contentType: selectedMediaType,
    };
  }

  return {
    payloadType,
  };
}
