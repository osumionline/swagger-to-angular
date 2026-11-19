import formatPropertyName from './property-name.js';
import { mapSwaggerSchemaToTs } from './schema-mapper.js';
import formatSchemaName from './schema-name.js';
import type { SwaggerSchema } from './types.js';

/**
 * Generates TypeScript declarations from the schemas
 * defined in the OpenAPI components section.
 *
 * Plain object schemas are generated as interfaces.
 * Arrays, primitives, enums, compositions, references,
 * nullable objects and dictionaries use type aliases.
 *
 * Required properties are preserved in interfaces,
 * and property and schema names are formatted as
 * valid TypeScript identifiers.
 *
 * @param schemas Collection of named OpenAPI schemas.
 * @returns Generated TypeScript declarations.
 */
export default function generateInterfaces(
  schemas: Record<string, SwaggerSchema>,
): string {
  const lines: string[] = [];

  for (const [name, schema] of Object.entries(schemas)) {
    const typeName: string = formatSchemaName(name);

    const hasEnum: boolean =
      Array.isArray(schema.enum) && schema.enum.length > 0;

    const hasComposition: boolean =
      (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) ||
      (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) ||
      (Array.isArray(schema.allOf) && schema.allOf.length > 0);

    const useInterface: boolean =
      (schema.type === 'object' || schema.type === undefined) &&
      schema.$ref === undefined &&
      schema.nullable !== true &&
      schema.additionalProperties === undefined &&
      !hasEnum &&
      !hasComposition;

    if (!useInterface) {
      const type: string = mapSwaggerSchemaToTs(schema);

      lines.push(`export type ${typeName} = ${type};\n`);

      continue;
    }

    lines.push(`export interface ${typeName} {`);

    const props: Record<string, SwaggerSchema> = schema.properties ?? {};

    const requiredList: string[] = Array.isArray(schema.required)
      ? schema.required
      : [];

    for (const [propName, prop] of Object.entries(props)) {
      const type: string = mapSwaggerSchemaToTs(prop);
      const isRequired: boolean = requiredList.includes(propName);
      const optionalMarker: string = isRequired ? '' : '?';
      const formattedName: string = formatPropertyName(propName);

      lines.push(`  ${formattedName}${optionalMarker}: ${type};`);
    }

    lines.push('}\n');
  }

  return lines.join('\n');
}
