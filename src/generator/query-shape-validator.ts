import type { SwaggerParameter, SwaggerSchema } from './types.js';

/**
 * Checks whether a schema explicitly describes an array,
 * object or composition that cannot be serialized as
 * one scalar query value.
 *
 * @param schema Schema to inspect.
 * @returns True when the schema is not a simple scalar.
 */
function isNonScalarSchema(schema: SwaggerSchema): boolean {
  return (
    schema.type === 'array' ||
    schema.type === 'object' ||
    schema.items !== undefined ||
    schema.properties !== undefined ||
    schema.additionalProperties !== undefined ||
    schema.oneOf !== undefined ||
    schema.anyOf !== undefined ||
    schema.allOf !== undefined
  );
}

/**
 * Validates the explicitly declared value shapes of an
 * OpenAPI query parameter.
 *
 * Flat objects with scalar properties and arrays of
 * scalar elements are supported.
 *
 * Explicitly nested objects, nested arrays and composed
 * item/property schemas are rejected to prevent values
 * from being silently converted to "[object Object]".
 *
 * Unresolved schema references are not classified here
 * because their actual shape is not available.
 *
 * @param parameter OpenAPI query parameter definition.
 * @returns Nothing; throws on an unsupported value shape.
 */
export default function validateQueryParameterShape(
  parameter: SwaggerParameter,
): void {
  const schema: SwaggerSchema | undefined = parameter.schema;

  if (schema === undefined) {
    return;
  }

  const isObject: boolean =
    schema.type === 'object' ||
    (schema.type === undefined &&
      (schema.properties !== undefined ||
        schema.additionalProperties !== undefined));

  if (isObject) {
    const propertySchemas: SwaggerSchema[] = Object.values(
      schema.properties ?? {},
    );

    if (
      schema.additionalProperties !== undefined &&
      typeof schema.additionalProperties === 'object'
    ) {
      propertySchemas.push(schema.additionalProperties);
    }

    const hasNestedValues: boolean = propertySchemas.some(
      (propertySchema: SwaggerSchema): boolean => {
        return isNonScalarSchema(propertySchema);
      },
    );

    if (hasNestedValues) {
      throw new Error(
        `Unsupported nested query object parameter: ${parameter.name}`,
      );
    }

    return;
  }

  if (
    schema.type === 'array' &&
    schema.items !== undefined &&
    isNonScalarSchema(schema.items)
  ) {
    throw new Error(
      `Unsupported nested query array parameter: ${parameter.name}`,
    );
  }
}
