import validateQueryParameterShape from './query-shape-validator.js';
import type { SwaggerParameter, SwaggerSchema } from './types.js';

/**
 * Generates raw, percent-encoded query fragments for
 * OpenAPI form, spaceDelimited and pipeDelimited parameters.
 *
 * Array values and object keys/values are encoded separately
 * before joining them with structural delimiters.
 *
 * Form objects and arrays are handled when explode=false.
 * Delimited arrays use the default explode=false behavior.
 *
 * Explicitly nested values are rejected by the shared
 * query shape validator.
 *
 * Other serialization modes return null and continue
 * using Angular HttpParams.
 *
 * @param parameter OpenAPI query parameter definition.
 * @param argumentName Generated TypeScript argument name.
 * @param queryKey Escaped TypeScript literal for the query name.
 * @returns Generated statements, or null when not applicable.
 */
export default function generateEncodedFormQueryCode(
  parameter: SwaggerParameter,
  argumentName: string,
  queryKey: string,
): string | null {
  validateQueryParameterShape(parameter);

  const style: string = parameter.style ?? 'form';

  const schema: SwaggerSchema | undefined = parameter.schema;

  const isArray: boolean = schema?.type === 'array';

  const isObject: boolean =
    schema?.type === 'object' ||
    (schema?.type === undefined &&
      (schema?.properties !== undefined ||
        schema?.additionalProperties !== undefined));

  const condition: string = `${argumentName} !== undefined && ${argumentName} !== null`;

  const encodedKey: string = `encodeURIComponent(${queryKey})`;

  if (isArray && (style === 'spaceDelimited' || style === 'pipeDelimited')) {
    if (parameter.explode === true) {
      throw new Error(
        `Unsupported ${style} array serialization for ` +
          `"${parameter.name}": explode=true.`,
      );
    }

    const delimiter: string = style === 'spaceDelimited' ? '%20' : '|';

    const delimiterLiteral: string = JSON.stringify(delimiter);

    return (
      `    if (${condition}) {\n` +
      `      const encodedValues: string[] = ${argumentName}` +
      `.map((value): string => encodeURIComponent(String(value)));\n` +
      `      querySegments.push(${encodedKey} + '=' + ` +
      `encodedValues.join(${delimiterLiteral}));\n` +
      `    }`
    );
  }

  if (style !== 'form' || parameter.explode !== false) {
    return null;
  }

  if (isArray) {
    return (
      `    if (${condition}) {\n` +
      `      const encodedValues: string[] = ${argumentName}` +
      `.map((value): string => encodeURIComponent(String(value)));\n` +
      `      querySegments.push(${encodedKey} + '=' + ` +
      `encodedValues.join(','));\n` +
      `    }`
    );
  }

  if (isObject) {
    return (
      `    if (${condition}) {\n` +
      `      const encodedEntries: string[] = ` +
      `Object.entries(${argumentName})\n` +
      `        .filter(([, value]): boolean => ` +
      `value !== undefined && value !== null)\n` +
      `        .flatMap(([key, value]): string[] => ` +
      `[encodeURIComponent(key), ` +
      `encodeURIComponent(String(value))]);\n` +
      `      if (encodedEntries.length > 0) {\n` +
      `        querySegments.push(${encodedKey} + '=' + ` +
      `encodedEntries.join(','));\n` +
      `      }\n` +
      `    }`
    );
  }

  return null;
}
