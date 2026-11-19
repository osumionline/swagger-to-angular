import { mapSwaggerSchemaToTs } from './schema-mapper.js';
import type { SwaggerSchema } from './types.js';

/**
 * Generates TypeScript interfaces from the schemas
 * defined in the OpenAPI components section.
 *
 * Respects the required property list of each schema.
 * Properties not included in this list are optional.
 *
 * @param schemas Collection of named OpenAPI schemas.
 * @returns Generated TypeScript interface declarations.
 */
export default function generateInterfaces(
  schemas: Record<string, SwaggerSchema>,
): string {
  const lines: string[] = [];

  for (const [name, schema] of Object.entries(schemas)) {
    lines.push(`export interface ${name} {`);

    const props: Record<string, SwaggerSchema> = schema.properties ?? {};

    const requiredList: string[] = Array.isArray(schema.required)
      ? schema.required
      : [];

    for (const [propName, prop] of Object.entries(props)) {
      const type: string = mapSwaggerSchemaToTs(prop);
      const isRequired: boolean = requiredList.includes(propName);
      const optionalMarker: string = isRequired ? '' : '?';

      lines.push(`  ${propName}${optionalMarker}: ${type};`);
    }

    lines.push('}\n');
  }

  return lines.join('\n');
}
