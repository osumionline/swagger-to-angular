import { mapSwaggerSchemaToTs } from './schema-mapper.js';
import type { SwaggerSchema } from './types.js';

/**
 * Generates TypeScript interfaces from the schemas
 * defined in the OpenAPI components section.
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

    for (const [propName, prop] of Object.entries(props)) {
      const type: string = mapSwaggerSchemaToTs(prop);
      lines.push(`  ${propName}?: ${type};`);
    }

    lines.push('}\n');
  }

  return lines.join('\n');
}
