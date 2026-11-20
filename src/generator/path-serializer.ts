import type { SwaggerParameter, SwaggerSchema } from './types.js';

/**
 * Checks whether a schema represents a supported scalar
 * value for OpenAPI path serialization.
 *
 * When requireType is true, the schema must explicitly
 * declare a primitive OpenAPI type.
 *
 * References, compositions and complex shapes are
 * excluded until their serialization is supported.
 *
 * @param schema Schema to inspect.
 * @param requireType Whether a primitive type is required.
 * @returns True when the schema is supported as a scalar.
 */
function isScalarSchema(
  schema: SwaggerSchema | undefined,
  requireType: boolean,
): boolean {
  if (schema === undefined) {
    return !requireType;
  }

  const type: string | undefined = schema.type;

  const isScalarType: boolean =
    type === 'string' ||
    type === 'integer' ||
    type === 'number' ||
    type === 'boolean';

  if (requireType && !isScalarType) {
    return false;
  }

  if (!requireType && type !== undefined && !isScalarType) {
    return false;
  }

  return (
    schema.$ref === undefined &&
    schema.items === undefined &&
    schema.properties === undefined &&
    schema.additionalProperties === undefined &&
    schema.oneOf === undefined &&
    schema.anyOf === undefined &&
    schema.allOf === undefined
  );
}

/**
 * Checks whether a schema represents an object parameter.
 *
 * Also accepts schemas that declare object properties
 * without an explicit type.
 *
 * @param schema Schema to inspect.
 * @returns True when the schema describes an object.
 */
function isObjectSchema(schema: SwaggerSchema | undefined): boolean {
  if (schema === undefined) {
    return false;
  }

  return (
    schema.type === 'object' ||
    (schema.type === undefined &&
      (schema.properties !== undefined ||
        schema.additionalProperties !== undefined))
  );
}

/**
 * Builds the TypeScript expression for a simple-style
 * object path parameter.
 *
 * Object values must be explicitly scalar. Unknown
 * additionalProperties are rejected.
 *
 * @param parameter OpenAPI path parameter definition.
 * @param argumentName Generated TypeScript argument name.
 * @returns TypeScript expression for the serialized object.
 */
function generateObjectExpression(
  parameter: SwaggerParameter,
  argumentName: string,
): string {
  const schema: SwaggerSchema = parameter.schema ?? {};

  if (
    schema.$ref !== undefined ||
    schema.oneOf !== undefined ||
    schema.anyOf !== undefined ||
    schema.allOf !== undefined ||
    schema.additionalProperties === true
  ) {
    throw new Error(`Unsupported path object schema: ${parameter.name}`);
  }

  const properties: SwaggerSchema[] = Object.values(schema.properties ?? {});

  if (
    schema.additionalProperties !== undefined &&
    typeof schema.additionalProperties === 'object'
  ) {
    properties.push(schema.additionalProperties);
  }

  if (
    properties.some(
      (property: SwaggerSchema): boolean => !isScalarSchema(property, true),
    )
  ) {
    throw new Error(
      `Unsupported nested path object parameter: ${parameter.name}`,
    );
  }

  const entries: string =
    `Object.entries(${argumentName})` +
    `.filter(([, value]): boolean => value !== undefined && value !== null)`;

  if (parameter.explode === true) {
    return (
      `${entries}` +
      `.map(([key, value]): string => ` +
      `encodeURIComponent(key) + '=' + ` +
      `encodeURIComponent(String(value)))` +
      `.join(',')`
    );
  }

  return (
    `${entries}` +
    `.flatMap(([key, value]): string[] => [` +
    `encodeURIComponent(key), ` +
    `encodeURIComponent(String(value))])` +
    `.join(',')`
  );
}

/**
 * Generates the TypeScript expression used to serialize
 * an OpenAPI path parameter with simple style.
 *
 * Supports scalar values, arrays of scalars and flat
 * objects containing scalar values.
 *
 * Array elements and object keys/values are encoded
 * individually, leaving structural delimiters intact.
 *
 * Explicitly unsupported styles and schemas are rejected
 * rather than interpolated incorrectly.
 *
 * @param parameter OpenAPI path parameter definition.
 * @param argumentName Generated TypeScript argument name.
 * @returns TypeScript expression for the URL path.
 */
export default function generatePathParameterExpression(
  parameter: SwaggerParameter,
  argumentName: string,
): string {
  if (parameter.in !== 'path') {
    throw new Error(`Expected a path parameter: ${parameter.name}`);
  }

  const style: string = parameter.style ?? 'simple';

  if (style !== 'simple') {
    throw new Error(
      `Unsupported path parameter style for "${parameter.name}": ${style}`,
    );
  }

  if (parameter.allowReserved === true) {
    throw new Error(
      `allowReserved is only supported for query parameters: ${parameter.name}`,
    );
  }

  const schema: SwaggerSchema | undefined = parameter.schema;

  if (schema?.type === 'array') {
    if (!isScalarSchema(schema.items, true)) {
      throw new Error(`Unsupported path array item schema: ${parameter.name}`);
    }

    return (
      `${argumentName}` +
      `.map((value): string => ` +
      `encodeURIComponent(String(value)))` +
      `.join(',')`
    );
  }

  if (isObjectSchema(schema)) {
    return generateObjectExpression(parameter, argumentName);
  }

  if (!isScalarSchema(schema, false)) {
    throw new Error(`Unsupported path parameter schema: ${parameter.name}`);
  }

  return `encodeURIComponent(String(${argumentName}))`;
}
