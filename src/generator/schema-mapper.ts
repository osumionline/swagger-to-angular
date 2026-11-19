import type { SwaggerSchema } from './types.js';

/**
 * Maps an OpenAPI schema to a TypeScript type.
 * Handles nullability after resolving the base type.
 *
 * @param schema OpenAPI schema definition.
 * @returns Generated TypeScript type representation.
 */
export function mapSwaggerSchemaToTs(schema: SwaggerSchema): string {
  const base: string = mapSwaggerSchemaToTsNonNullable(schema);

  if (schema.nullable === true) {
    return `${base} | null`;
  }

  return base;
}

/**
 * Maps an OpenAPI schema to a TypeScript type without
 * applying the nullable modifier of the current schema.
 *
 * @param schema OpenAPI schema definition.
 * @returns Non-nullable TypeScript type representation.
 */
export function mapSwaggerSchemaToTsNonNullable(schema: SwaggerSchema): string {
  if (schema.$ref) {
    return extractRefName(schema.$ref);
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const literals: string[] = schema.enum.map((value: unknown): string => {
      return toTsLiteral(value);
    });

    return literals.join(' | ');
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    const types: string[] = schema.oneOf.map((item: SwaggerSchema): string => {
      return mapSwaggerSchemaToTs(item);
    });

    return buildUnion(types);
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const types: string[] = schema.anyOf.map((item: SwaggerSchema): string => {
      return mapSwaggerSchemaToTs(item);
    });

    return buildUnion(types);
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const types: string[] = schema.allOf.map((item: SwaggerSchema): string => {
      return mapSwaggerSchemaToTs(item);
    });

    return buildIntersection(types);
  }

  if (schema.type === 'integer' || schema.type === 'number') {
    return 'number';
  }

  if (schema.type === 'string') {
    return 'string';
  }

  if (schema.type === 'boolean') {
    return 'boolean';
  }

  if (schema.type === 'array') {
    const items: SwaggerSchema = schema.items ?? {};
    const itemType: string = mapSwaggerSchemaToTs(items);

    const requiresParentheses: boolean =
      items.nullable === true ||
      (Array.isArray(items.enum) && items.enum.length > 1) ||
      (Array.isArray(items.oneOf) && items.oneOf.length > 0) ||
      (Array.isArray(items.anyOf) && items.anyOf.length > 0) ||
      (Array.isArray(items.allOf) && items.allOf.length > 0);

    const formattedItemType: string = requiresParentheses
      ? `(${itemType})`
      : itemType;

    return `${formattedItemType}[]`;
  }

  if (schema.type === 'object') {
    if (schema.properties && Object.keys(schema.properties).length > 0) {
      const requiredList: string[] = Array.isArray(schema.required)
        ? schema.required
        : [];

      const fields: string[] = [];

      for (const [key, value] of Object.entries(schema.properties)) {
        const type: string = mapSwaggerSchemaToTs(value);
        const isRequired: boolean = requiredList.includes(key);

        fields.push(`${key}${isRequired ? '' : '?'}: ${type};`);
      }

      return `{ ${fields.join(' ')} }`;
    }

    if (schema.additionalProperties === true) {
      return '{ [key: string]: any }';
    }

    if (
      schema.additionalProperties &&
      typeof schema.additionalProperties === 'object'
    ) {
      const additionalType: string = mapSwaggerSchemaToTs(
        schema.additionalProperties,
      );

      return `{ [key: string]: ${additionalType} }`;
    }

    return '{ [key: string]: any }';
  }

  if (schema.properties && Object.keys(schema.properties).length > 0) {
    return mapSwaggerSchemaToTsNonNullable({
      ...schema,
      type: 'object',
    });
  }

  return 'any';
}

/**
 * Extracts the schema name from an OpenAPI reference.
 *
 * @param ref OpenAPI reference, such as "#/components/schemas/User".
 * @returns Referenced schema name or "any" when empty.
 */
export function extractRefName(ref: string): string {
  const last: string = ref.split('/').pop() ?? '';
  return last === '' ? 'any' : last;
}

/**
 * Converts a JavaScript value into a TypeScript literal type.
 *
 * @param value Value to convert into a literal.
 * @returns TypeScript literal representation.
 */
export function toTsLiteral(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return String(value);
    }

    return 'number';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return 'any';
}

/**
 * Combines TypeScript types into a union.
 *
 * @param parts Type representations to combine.
 * @returns Union type or "any" if no types are provided.
 */
export function buildUnion(parts: string[]): string {
  const cleaned: string[] = parts.filter(Boolean);

  if (cleaned.length === 0) {
    return 'any';
  }

  if (cleaned.length === 1) {
    return cleaned[0];
  }

  return cleaned.join(' | ');
}

/**
 * Combines TypeScript types into an intersection.
 *
 * @param parts Type representations to combine.
 * @returns Intersection type or "any" if no types are provided.
 */
export function buildIntersection(parts: string[]): string {
  const cleaned: string[] = parts.filter(Boolean);

  if (cleaned.length === 0) {
    return 'any';
  }

  if (cleaned.length === 1) {
    return cleaned[0];
  }

  return cleaned.join(' & ');
}
