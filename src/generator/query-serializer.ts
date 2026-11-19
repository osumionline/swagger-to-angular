import type { SwaggerParameter } from './types.js';

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
 * Null and undefined arrays are omitted.
 *
 * Object serialization and other parameter styles retain
 * the existing scalar fallback until separately supported.
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
