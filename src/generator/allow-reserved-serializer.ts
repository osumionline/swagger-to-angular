import type { SwaggerParameter, SwaggerSchema } from './types.js';

/**
 * Checks whether an array item schema represents a
 * supported scalar value.
 *
 * References, objects, arrays and schema compositions
 * are excluded until their serialization is supported.
 *
 * @param schema OpenAPI array item schema.
 * @returns True when the schema describes a scalar value.
 */
function isSupportedScalarItem(schema: SwaggerSchema | undefined): boolean {
  if (schema === undefined) {
    return false;
  }

  const isScalarType: boolean =
    schema.type === 'string' ||
    schema.type === 'integer' ||
    schema.type === 'number' ||
    schema.type === 'boolean';

  return (
    isScalarType &&
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
 * Builds a TypeScript expression that serializes a value
 * using the supported allowReserved behavior.
 *
 * Preserves safe reserved characters and valid percent
 * triples while escaping characters that could alter
 * query parsing.
 *
 * Commas can also be escaped when they occur inside
 * elements of a non-exploded form array.
 *
 * @param valueExpression TypeScript expression containing the value.
 * @param escapeComma Whether commas inside the value must be escaped.
 * @returns Generated TypeScript encoding expression.
 */
function createReservedValueExpression(
  valueExpression: string,
  escapeComma: boolean,
): string {
  const parts: string[] = [
    `encodeURI(String(${valueExpression}))`,
    ".replace(/&/g, '%26')",
    ".replace(/\\+/g, '%2B')",
    ".replace(/#/g, '%23')",
  ];

  if (escapeComma) {
    parts.push(".replace(/,/g, '%2C')");
  }

  parts.push(".replace(/%25([0-9A-Fa-f]{2})/g, '%$1')");

  return parts.join('\n            ');
}

/**
 * Generates raw URL query serialization for OpenAPI
 * parameters with allowReserved=true.
 *
 * Supports scalar values and form arrays of scalar values.
 *
 * Form arrays with explode=true generate repeated query
 * names. Arrays with explode=false use structural commas
 * while escaping commas inside individual values.
 *
 * Objects and unsupported styles are rejected.
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

  const condition: string = `${argumentName} !== undefined && ${argumentName} !== null`;

  if (schema?.type === 'array') {
    if (!isSupportedScalarItem(schema.items)) {
      throw new Error(
        `allowReserved arrays require scalar item schemas: ${parameter.name}`,
      );
    }

    const explode: boolean = parameter.explode !== false;

    const encodedItem: string = createReservedValueExpression('item', !explode);

    if (explode) {
      return (
        `    if (${condition}) {\n` +
        `      ${argumentName}.forEach((item): void => {\n` +
        `        querySegments.push(\n` +
        `          encodeURIComponent(${queryKey}) + '=' +\n` +
        `          ${encodedItem},\n` +
        `        );\n` +
        `      });\n` +
        `    }`
      );
    }

    return (
      `    if (${condition}) {\n` +
      `      querySegments.push(\n` +
      `        encodeURIComponent(${queryKey}) + '=' +\n` +
      `        ${argumentName}\n` +
      `          .map((item): string => ${encodedItem})\n` +
      `          .join(','),\n` +
      `      );\n` +
      `    }`
    );
  }

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
      `allowReserved is only supported for scalar query parameters ` +
        `and arrays of scalars: ${parameter.name}`,
    );
  }

  const encodedValue: string = createReservedValueExpression(
    argumentName,
    false,
  );

  return (
    `    if (${condition}) {\n` +
    `      querySegments.push(\n` +
    `        encodeURIComponent(${queryKey}) + '=' +\n` +
    `        ${encodedValue},\n` +
    `      );\n` +
    `    }`
  );
}
