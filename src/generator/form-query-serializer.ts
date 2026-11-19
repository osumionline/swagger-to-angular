import type { SwaggerParameter, SwaggerSchema } from './types.js';

/**
 * Generates raw, percent-encoded query fragments for
 * OpenAPI form parameters with explode=false.
 *
 * Each array element or object key/value is encoded
 * separately before joining with structural commas.
 *
 * Other serialization modes return null and continue
 * using Angular HttpParams.
 *
 * @param parameter OpenAPI query parameter definition.
 * @param argumentName Generated TypeScript argument name.
 * @param queryKey Escaped TypeScript literal for the original query name.
 * @returns Generated statements, or null when not applicable.
 */
export default function generateEncodedFormQueryCode(
  parameter: SwaggerParameter,
  argumentName: string,
  queryKey: string,
): string | null {
  const style: string = parameter.style ?? 'form';

  if (style !== 'form' || parameter.explode !== false) {
    return null;
  }

  const schema: SwaggerSchema | undefined = parameter.schema;

  const isArray: boolean = schema?.type === 'array';

  const isObject: boolean =
    schema?.type === 'object' ||
    (schema?.type === undefined &&
      (schema?.properties !== undefined ||
        schema?.additionalProperties !== undefined));

  const condition: string = `${argumentName} !== undefined && ${argumentName} !== null`;

  const encodedKey: string = `encodeURIComponent(${queryKey})`;

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
