import validateQueryParameterShape from './query-shape-validator.js';
import type { SwaggerParameter, SwaggerSchema } from './types.js';

/**
 * Checks whether an OpenAPI schema describes an object.
 *
 * Also accepts schemas with object properties when the
 * explicit type field is omitted.
 *
 * @param schema OpenAPI schema to inspect.
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
 * Generates TypeScript statements for an object-valued
 * OpenAPI query parameter.
 *
 * Supports flat objects with scalar values using:
 * - form with explode=true
 * - form with explode=false
 * - deepObject with explode=true
 *
 * Unsupported styles are rejected.
 * Value shapes are validated by the public entry point
 * before this function is called.
 *
 * @param parameter OpenAPI query parameter definition.
 * @param argumentName Generated TypeScript argument name.
 * @param queryKey Escaped TypeScript string literal for the query key.
 * @returns TypeScript statements for serializing the object.
 */
function generateObjectQueryParameterCode(
  parameter: SwaggerParameter,
  argumentName: string,
  queryKey: string,
): string {
  const style: string = parameter.style ?? 'form';

  const condition: string = `${argumentName} !== undefined && ${argumentName} !== null`;

  if (style === 'form' && parameter.explode !== false) {
    return (
      `    if (${condition}) {\n` +
      `      for (const [key, value] of Object.entries(${argumentName})) {\n` +
      `        if (value !== undefined && value !== null) {\n` +
      `          params = params.append(key, String(value));\n` +
      `        }\n` +
      `      }\n` +
      `    }`
    );
  }

  if (style === 'form' && parameter.explode === false) {
    return (
      `    if (${condition}) {\n` +
      `      const entries: string[] = Object.entries(${argumentName})\n` +
      `        .filter(([, value]): boolean => value !== undefined && value !== null)\n` +
      `        .flatMap(([key, value]): string[] => [key, String(value)]);\n` +
      `      if (entries.length > 0) {\n` +
      `        params = params.set(${queryKey}, entries.join(','));\n` +
      `      }\n` +
      `    }`
    );
  }

  if (style === 'deepObject' && parameter.explode === true) {
    return (
      `    if (${condition}) {\n` +
      `      for (const [key, value] of Object.entries(${argumentName})) {\n` +
      `        if (value !== undefined && value !== null) {\n` +
      `          params = params.append(${queryKey} + '[' + key + ']', String(value));\n` +
      `        }\n` +
      `      }\n` +
      `    }`
    );
  }

  throw new Error(
    `Unsupported query object serialization for "${parameter.name}": ` +
      `style=${style}, explode=${String(parameter.explode)}. ` +
      `deepObject requires explode: true.`,
  );
}

/**
 * Generates the TypeScript statements that serialize
 * an OpenAPI query parameter into Angular HttpParams.
 *
 * Scalar parameters preserve the existing String()
 * serialization.
 *
 * Arrays support form, spaceDelimited and pipeDelimited.
 * The default form style uses explode=true, producing
 * repeated parameter names through HttpParams.append().
 *
 * Flat objects support form and deepObject serialization.
 * Explicitly nested values are rejected by the shared
 * query shape validator.
 *
 * Null and undefined array/object parameters are omitted.
 *
 * @param parameter OpenAPI query parameter definition.
 * @param argumentName Generated TypeScript argument name.
 * @param queryKey Escaped TypeScript string literal for the query key.
 * @returns TypeScript statements for serializing the parameter.
 */
export default function generateQueryParameterCode(
  parameter: SwaggerParameter,
  argumentName: string,
  queryKey: string,
): string {
  validateQueryParameterShape(parameter);

  if (isObjectSchema(parameter.schema)) {
    return generateObjectQueryParameterCode(parameter, argumentName, queryKey);
  }

  const isArray: boolean = parameter.schema?.type === 'array';

  if (!isArray) {
    return (
      `    if (${argumentName} !== undefined) {\n` +
      `      params = params.set(${queryKey}, String(${argumentName}));\n` +
      `    }`
    );
  }

  const style: string = parameter.style ?? 'form';

  const condition: string = `${argumentName} !== undefined && ${argumentName} !== null`;

  if (style === 'form' && parameter.explode !== false) {
    return (
      `    if (${condition}) {\n` +
      `      for (const value of ${argumentName}) {\n` +
      `        params = params.append(${queryKey}, String(value));\n` +
      `      }\n` +
      `    }`
    );
  }

  let delimiter: string | undefined;

  if (style === 'form') {
    delimiter = ',';
  } else if (style === 'spaceDelimited') {
    delimiter = ' ';
  } else if (style === 'pipeDelimited') {
    delimiter = '|';
  }

  if (delimiter === undefined) {
    return (
      `    if (${condition}) {\n` +
      `      params = params.set(${queryKey}, String(${argumentName}));\n` +
      `    }`
    );
  }

  const delimiterLiteral: string = JSON.stringify(delimiter);

  return (
    `    if (${condition}) {\n` +
    `      params = params.set(${queryKey}, ` +
    `${argumentName}.map((value): string => String(value))` +
    `.join(${delimiterLiteral}));\n` +
    `    }`
  );
}
