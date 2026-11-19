import type { SwaggerParameter, SwaggerSchema } from './types.js';

/**
 * Generates raw URL query serialization for scalar
 * OpenAPI parameters with allowReserved=true.
 *
 * Preserves query-safe reserved characters while
 * encoding characters that could alter query parsing.
 *
 * Valid percent-encoded triples are preserved.
 *
 * Non-scalar schemas and unsupported styles are rejected
 * rather than silently ignoring allowReserved.
 *
 * Parameters without allowReserved=true return null.
 *
 * @param parameter OpenAPI parameter definition.
 * @param argumentName Generated TypeScript argument name.
 * @param queryKey Escaped TypeScript literal for the query name.
 * @returns Generated statements, or null when not applicable.
 */
export default function generateAllowReservedQueryCode(
  parameter: SwaggerParameter,
  argumentName: string,
  queryKey: string,
): string | null {
  if (parameter.allowReserved !== true) {
    return null;
  }

  if (parameter.in !== 'query') {
    throw new Error(
      `allowReserved is only valid for query parameters: ${parameter.name}`,
    );
  }

  if (parameter.style !== undefined && parameter.style !== 'form') {
    throw new Error(
      `Unsupported allowReserved style for "${parameter.name}": ` +
        parameter.style,
    );
  }

  const schema: SwaggerSchema | undefined = parameter.schema;

  const isScalarType: boolean =
    schema?.type === undefined ||
    schema.type === 'string' ||
    schema.type === 'integer' ||
    schema.type === 'number' ||
    schema.type === 'boolean';

  const hasComplexShape: boolean =
    schema?.$ref !== undefined ||
    schema?.items !== undefined ||
    schema?.properties !== undefined ||
    schema?.additionalProperties !== undefined ||
    schema?.oneOf !== undefined ||
    schema?.anyOf !== undefined ||
    schema?.allOf !== undefined;

  if (!isScalarType || hasComplexShape) {
    throw new Error(
      `allowReserved is only supported for scalar query parameters: ${parameter.name}`,
    );
  }

  return (
    `    if (${argumentName} !== undefined && ${argumentName} !== null) {\n` +
    `      querySegments.push(\n` +
    `        encodeURIComponent(${queryKey}) + '=' +\n` +
    `        encodeURI(String(${argumentName}))\n` +
    `          .replace(/&/g, '%26')\n` +
    `          .replace(/\\+/g, '%2B')\n` +
    `          .replace(/#/g, '%23')\n` +
    `          .replace(/%25([0-9A-Fa-f]{2})/g, '%$1'),\n` +
    `      );\n` +
    `    }`
  );
}
