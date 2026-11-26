import selectMediaType from './media-type.js';
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
 * - application/<subtype>+json
 * - text/json
 * - text/plain
 * - application/octet-stream
 *
 * Media type parameters are supported and preserved.
 *
 * JSON payload types are inferred from their schemas.
 * Text payloads must use a string schema when one exists.
 * Unsupported media types and invalid bodies are rejected.
 *
 * Content-Type is explicit for nonstandard JSON, plain
 * text and request bodies with multiple representations.
 * A single application/json representation normally
 * retains the existing generated output. JSON bodies
 * that may contain strings, null or unknown values
 * require explicit serialization and Content-Type.
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

  const selectedMediaType = selectMediaType(mediaTypes, 'request');

  if (selectedMediaType === undefined) {
    const declaredTypes: string =
      mediaTypes.length > 0 ? mediaTypes.join(', ') : '(none)';

    throw new Error(
      `Unsupported request body media types for "${operationId}": ` +
        `${declaredTypes}.`,
    );
  }

  const schema: SwaggerSchema | undefined =
    content[selectedMediaType.name]?.schema;

  let payloadType: string;

  if (selectedMediaType.kind === 'binary') {
    if (
      schema !== undefined &&
      (schema.type !== 'string' ||
        schema.format !== 'binary' ||
        schema.$ref !== undefined ||
        schema.nullable === true ||
        schema.oneOf !== undefined ||
        schema.anyOf !== undefined ||
        schema.allOf !== undefined)
    ) {
      throw new Error(
        `Unsupported application/octet-stream request body schema for "${operationId}".`,
      );
    }

    payloadType = 'Blob';
  } else if (selectedMediaType.kind === 'text') {
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

  const needsExplicitJsonSerialization: boolean =
    selectedMediaType.kind === 'json' &&
    (schema?.type === undefined ||
      schema?.type === 'string' ||
      schema?.nullable === true ||
      schema?.oneOf !== undefined ||
      schema?.anyOf !== undefined ||
      schema?.allOf !== undefined ||
      (schema?.enum?.some((value: unknown): boolean => {
        return typeof value === 'string' || value === null;
      }) ??
        false));

  if (needsExplicitJsonSerialization) {
    return {
      payloadType,
      contentType: selectedMediaType.name,
      serializeAsJson: true,
    };
  }

  if (selectedMediaType.name !== 'application/json' || mediaTypes.length > 1) {
    return {
      payloadType,
      contentType: selectedMediaType.name,
    };
  }

  return {
    payloadType,
  };
}
