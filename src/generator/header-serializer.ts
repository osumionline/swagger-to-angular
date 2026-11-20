import type { SwaggerParameter, SwaggerSchema } from './types.js';

/**
 * Checks whether an OpenAPI schema describes a scalar
 * value supported by header serialization.
 *
 * @param schema Schema to inspect.
 * @param requireType Whether a primitive type must be declared.
 * @returns True when the schema represents a supported scalar.
 */
function isScalarSchema(
  schema: SwaggerSchema | undefined,
  requireType: boolean,
): boolean {
  if (schema === undefined) {
    return !requireType;
  }

  const isScalarType: boolean =
    schema.type === 'string' ||
    schema.type === 'integer' ||
    schema.type === 'number' ||
    schema.type === 'boolean';

  if (requireType && !isScalarType) {
    return false;
  }

  if (!requireType && schema.type !== undefined && !isScalarType) {
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
 * Checks whether an OpenAPI schema represents an object.
 *
 * Accepts object properties without an explicit type,
 * as supported by the existing schema mapper.
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
 * Validates the properties of a header object.
 *
 * Flat objects and dictionaries containing explicitly
 * typed scalar values are supported.
 *
 * Nested, composed and unresolved schemas are rejected
 * rather than converted to incorrect string values.
 *
 * @param parameter OpenAPI header parameter definition.
 * @returns Nothing; throws for unsupported object schemas.
 */
function validateHeaderObject(parameter: SwaggerParameter): void {
  const schema: SwaggerSchema = parameter.schema ?? {};

  if (
    schema.$ref !== undefined ||
    schema.oneOf !== undefined ||
    schema.anyOf !== undefined ||
    schema.allOf !== undefined ||
    schema.additionalProperties === true
  ) {
    throw new Error(`Unsupported header object schema: ${parameter.name}`);
  }

  const properties: SwaggerSchema[] = Object.values(schema.properties ?? {});

  if (
    schema.additionalProperties !== undefined &&
    typeof schema.additionalProperties === 'object'
  ) {
    properties.push(schema.additionalProperties);
  }

  const hasUnsupportedValues: boolean = properties.some(
    (property: SwaggerSchema): boolean => {
      return !isScalarSchema(property, true);
    },
  );

  if (hasUnsupportedValues) {
    throw new Error(
      `Unsupported nested header object parameter: ${parameter.name}`,
    );
  }
}

/**
 * Generates TypeScript statements for an OpenAPI header.
 *
 * Uses the simple serialization style:
 * - Scalar: String(value)
 * - Array: comma-separated values
 * - Object, explode=false: key,value,key,value
 * - Object, explode=true: key=value,key=value
 *
 * Header values are not URI percent-encoded.
 *
 * The existing scalar output is preserved for
 * backward compatibility.
 *
 * Unsupported styles and complex schemas are rejected.
 *
 * @param parameter OpenAPI header parameter definition.
 * @param argumentName Generated TypeScript argument name.
 * @param headerKey Escaped TypeScript literal for the header name.
 * @returns Generated TypeScript statements.
 */
export default function generateHeaderParameterCode(
  parameter: SwaggerParameter,
  argumentName: string,
  headerKey: string,
): string {
  if (parameter.in !== 'header') {
    throw new Error(`Expected a header parameter: ${parameter.name}`);
  }

  const style: string = parameter.style ?? 'simple';

  if (style !== 'simple') {
    throw new Error(
      `Unsupported header parameter style for "${parameter.name}": ${style}`,
    );
  }

  if (parameter.allowReserved === true) {
    throw new Error(
      `allowReserved is only supported for query parameters: ${parameter.name}`,
    );
  }

  const schema: SwaggerSchema | undefined = parameter.schema;

  const condition: string = `${argumentName} !== undefined && ${argumentName} !== null`;

  if (schema?.type === 'array') {
    if (!isScalarSchema(schema.items, true)) {
      throw new Error(
        `Unsupported header array item schema: ${parameter.name}`,
      );
    }

    return (
      `    if (${condition}) {\n` +
      `      headers[${headerKey}] = ${argumentName}` +
      `.map((value): string => String(value)).join(',');\n` +
      `    }`
    );
  }

  if (isObjectSchema(schema)) {
    validateHeaderObject(parameter);

    const serializedEntries: string =
      `Object.entries(${argumentName})\n` +
      `        .filter(([, value]): boolean => ` +
      `value !== undefined && value !== null)\n`;

    const mapping: string =
      parameter.explode === true
        ? `        .map(([key, value]): string => ` +
          `key + '=' + String(value))\n`
        : `        .flatMap(([key, value]): string[] => ` +
          `[key, String(value)])\n`;

    return (
      `    if (${condition}) {\n` +
      `      headers[${headerKey}] = ${serializedEntries}` +
      `${mapping}` +
      `        .join(',');\n` +
      `    }`
    );
  }

  if (!isScalarSchema(schema, false)) {
    throw new Error(`Unsupported header parameter schema: ${parameter.name}`);
  }

  return (
    `    if (${argumentName} !== undefined) {\n` +
    `      headers[${headerKey}] = String(${argumentName});\n` +
    `    }`
  );
}
