import type { SwaggerParameter, SwaggerSchema } from './types.js';

/**
 * Supported OpenAPI path serialization styles.
 */
type PathStyle = 'simple' | 'label' | 'matrix';

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
 * Builds the TypeScript expression for a simple, label or
 * matrix style object path parameter.
 *
 * Object values must be explicitly scalar. Unknown
 * additionalProperties are rejected.
 *
 * For exploded label objects, dots inside individual
 * keys and values are encoded to distinguish them
 * from structural dot separators.
 *
 * For matrix objects, empty collections use the
 * semicolon-prefixed parameter name without an equals sign.
 *
 * @param parameter OpenAPI path parameter definition.
 * @param argumentName Generated TypeScript argument name.
 * @param style Supported OpenAPI path serialization style.
 * @returns TypeScript expression for the serialized object.
 */
function generateObjectExpression(
  parameter: SwaggerParameter,
  argumentName: string,
  style: PathStyle,
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

  if (style === 'matrix') {
    const encodedName: string = `encodeURIComponent(${JSON.stringify(parameter.name)})`;

    if (parameter.explode === true) {
      const encodedEntries: string =
        `${entries}` +
        `.map(([key, value]): string => ` +
        `encodeURIComponent(key) + '=' + ` +
        `encodeURIComponent(String(value)))`;

      return (
        `((parts: string[]): string => parts.length === 0 ` +
        `? ';' + ${encodedName} : ';' + parts.join(';'))` +
        `(${encodedEntries})`
      );
    }

    const encodedEntries: string =
      `${entries}` +
      `.flatMap(([key, value]): string[] => [` +
      `encodeURIComponent(key), ` +
      `encodeURIComponent(String(value))])`;

    return (
      `((parts: string[]): string => parts.length === 0 ` +
      `? ';' + ${encodedName} : ` +
      `';' + ${encodedName} + '=' + parts.join(','))` +
      `(${encodedEntries})`
    );
  }

  if (style === 'label') {
    if (parameter.explode === true) {
      return (
        `'.' + ${entries}` +
        `.map(([key, value]): string => ` +
        `encodeURIComponent(key).replace(/\\./g, '%2E') + '=' + ` +
        `encodeURIComponent(String(value)).replace(/\\./g, '%2E'))` +
        `.join('.')`
      );
    }

    return (
      `'.' + ${entries}` +
      `.flatMap(([key, value]): string[] => [` +
      `encodeURIComponent(key), ` +
      `encodeURIComponent(String(value))])` +
      `.join(',')`
    );
  }

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
 * an OpenAPI path parameter.
 *
 * Supports simple, label and matrix styles, including
 * scalar values, arrays of scalars and flat objects.
 *
 * Array elements and object keys/values are encoded
 * individually, leaving structural delimiters intact.
 *
 * Unsupported parameter schemas are rejected.
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

  if (style !== 'simple' && style !== 'label' && style !== 'matrix') {
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

    if (style === 'matrix') {
      const encodedName: string = `encodeURIComponent(${JSON.stringify(parameter.name)})`;

      if (parameter.explode === true) {
        return (
          `(${argumentName}.length === 0 ? ';' + ${encodedName} : ` +
          `${argumentName}.map((value): string => ';' + ` +
          `${encodedName} + '=' + encodeURIComponent(String(value)))` +
          `.join(''))`
        );
      }

      return (
        `(${argumentName}.length === 0 ? ';' + ${encodedName} : ` +
        `';' + ${encodedName} + '=' + ` +
        `${argumentName}.map((value): string => ` +
        `encodeURIComponent(String(value))).join(','))`
      );
    }

    const encodeValue: string =
      style === 'label' && parameter.explode === true
        ? "encodeURIComponent(String(value)).replace(/\\./g, '%2E')"
        : 'encodeURIComponent(String(value))';

    const separator: string =
      style === 'label' && parameter.explode === true ? '.' : ',';

    const expression: string =
      `${argumentName}` +
      `.map((value): string => ${encodeValue})` +
      `.join('${separator}')`;

    return style === 'label' ? `'.' + ${expression}` : expression;
  }

  if (isObjectSchema(schema)) {
    return generateObjectExpression(parameter, argumentName, style);
  }

  if (!isScalarSchema(schema, false)) {
    throw new Error(`Unsupported path parameter schema: ${parameter.name}`);
  }

  const scalarExpression: string = `encodeURIComponent(String(${argumentName}))`;

  if (style === 'matrix') {
    const encodedName: string = `encodeURIComponent(${JSON.stringify(parameter.name)})`;

    return (
      `(String(${argumentName}).length === 0 ` +
      `? ';' + ${encodedName} ` +
      `: ';' + ${encodedName} + '=' + ${scalarExpression})`
    );
  }

  return style === 'label' ? `'.' + ${scalarExpression}` : scalarExpression;
}
