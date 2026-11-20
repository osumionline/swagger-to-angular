import type { SwaggerParameter, SwaggerSchema } from './types.js';

/**
 * Extracts a schema component name from a local
 * OpenAPI reference.
 *
 * Supports URI encoding and JSON Pointer escapes.
 * External and nested-property references are rejected.
 *
 * @param ref Reference to resolve.
 * @param parameterName Name of the HTTP parameter.
 * @returns Decoded component schema name.
 */
function getReferencedSchemaName(ref: string, parameterName: string): string {
  const prefix: string = '#/components/schemas/';

  if (!ref.startsWith(prefix)) {
    throw new Error(
      `Unsupported parameter schema reference "${ref}" ` +
        `in "${parameterName}". Only local components.schemas ` +
        `references are supported.`,
    );
  }

  const encodedName: string = ref.slice(prefix.length);

  let decodedName: string;

  try {
    decodedName = decodeURIComponent(encodedName);
  } catch {
    throw new Error(
      `Invalid parameter schema reference "${ref}" ` + `in "${parameterName}".`,
    );
  }

  if (
    decodedName.length === 0 ||
    decodedName.includes('/') ||
    /~(?![01])/.test(decodedName)
  ) {
    throw new Error(
      `Invalid parameter schema reference "${ref}" ` + `in "${parameterName}".`,
    );
  }

  return decodedName.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Recursively resolves local component references
 * within an OpenAPI schema.
 *
 * Each resolution branch tracks its own references
 * to detect cycles without rejecting valid reuse
 * of the same component in separate properties.
 *
 * @param schema Schema or reference to resolve.
 * @param schemas Available named component schemas.
 * @param parameterName Name of the HTTP parameter.
 * @param visited Component names in the current resolution branch.
 * @returns A new schema with references resolved.
 */
function resolveSchema(
  schema: SwaggerSchema,
  schemas: Record<string, SwaggerSchema>,
  parameterName: string,
  visited: ReadonlySet<string>,
): SwaggerSchema {
  if (schema.$ref !== undefined) {
    const ref: string = schema.$ref;

    const name: string = getReferencedSchemaName(ref, parameterName);

    if (visited.has(name)) {
      throw new Error(
        `Circular parameter schema reference "${ref}" ` +
          `in "${parameterName}".`,
      );
    }

    if (!Object.hasOwn(schemas, name)) {
      throw new Error(
        `Unresolved parameter schema reference "${ref}" ` +
          `in "${parameterName}".`,
      );
    }

    const nextVisited: Set<string> = new Set<string>(visited);
    nextVisited.add(name);

    return resolveSchema(schemas[name], schemas, parameterName, nextVisited);
  }

  const resolved: SwaggerSchema = { ...schema };

  if (schema.items !== undefined) {
    resolved.items = resolveSchema(
      schema.items,
      schemas,
      parameterName,
      visited,
    );
  }

  if (schema.properties !== undefined) {
    const properties: Record<string, SwaggerSchema> = {};

    for (const [key, value] of Object.entries(schema.properties)) {
      properties[key] = resolveSchema(value, schemas, parameterName, visited);
    }

    resolved.properties = properties;
  }

  if (
    schema.additionalProperties !== undefined &&
    typeof schema.additionalProperties === 'object'
  ) {
    resolved.additionalProperties = resolveSchema(
      schema.additionalProperties,
      schemas,
      parameterName,
      visited,
    );
  }

  if (schema.oneOf !== undefined) {
    resolved.oneOf = schema.oneOf.map((item: SwaggerSchema): SwaggerSchema => {
      return resolveSchema(item, schemas, parameterName, visited);
    });
  }

  if (schema.anyOf !== undefined) {
    resolved.anyOf = schema.anyOf.map((item: SwaggerSchema): SwaggerSchema => {
      return resolveSchema(item, schemas, parameterName, visited);
    });
  }

  if (schema.allOf !== undefined) {
    resolved.allOf = schema.allOf.map((item: SwaggerSchema): SwaggerSchema => {
      return resolveSchema(item, schemas, parameterName, visited);
    });
  }

  return resolved;
}

/**
 * Resolves schema references used by an HTTP parameter.
 *
 * Returns a separate parameter definition for runtime
 * serialization. The original parameter remains unchanged,
 * allowing method signatures to preserve named TypeScript
 * aliases from components.schemas.
 *
 * Parameters without a schema are returned unchanged.
 *
 * @param parameter Original OpenAPI HTTP parameter.
 * @param schemas Named schemas from components.schemas.
 * @returns Parameter with resolved serialization schema.
 */
export default function resolveParameterSchema(
  parameter: SwaggerParameter,
  schemas: Record<string, SwaggerSchema>,
): SwaggerParameter {
  if (parameter.schema === undefined) {
    return parameter;
  }

  return {
    ...parameter,
    schema: resolveSchema(
      parameter.schema,
      schemas,
      parameter.name,
      new Set<string>(),
    ),
  };
}
