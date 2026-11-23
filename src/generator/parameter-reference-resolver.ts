import type { SwaggerParameter, SwaggerParameterOrReference } from './types.js';

/**
 * Extracts a reusable parameter name from an OpenAPI
 * local reference.
 *
 * Supports URI decoding and JSON Pointer escapes.
 * External references and nested-property references
 * are not supported.
 *
 * @param ref OpenAPI parameter reference.
 * @returns Decoded reusable parameter name.
 */
function getReferencedParameterName(ref: string): string {
  const prefix: string = '#/components/parameters/';

  if (!ref.startsWith(prefix)) {
    throw new Error(
      `Unsupported parameter reference "${ref}". ` +
        `Only local components.parameters references are supported.`,
    );
  }

  const encodedName: string = ref.slice(prefix.length);

  let decodedName: string;

  try {
    decodedName = decodeURIComponent(encodedName);
  } catch {
    throw new Error(`Invalid parameter reference "${ref}".`);
  }

  if (
    decodedName.length === 0 ||
    decodedName.includes('/') ||
    /~(?![01])/.test(decodedName)
  ) {
    throw new Error(`Invalid parameter reference "${ref}".`);
  }

  return decodedName.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Resolves an OpenAPI parameter reference recursively.
 *
 * References may point to another parameter reference.
 * The visited set detects circular chains.
 *
 * Additional properties alongside $ref are ignored
 * according to OpenAPI 3.0 reference semantics.
 *
 * @param parameter Parameter or reference to resolve.
 * @param definitions Reusable component parameters.
 * @param visited Component names visited in the current chain.
 * @returns Resolved OpenAPI parameter.
 */
function resolveReference(
  parameter: SwaggerParameterOrReference,
  definitions: Record<string, SwaggerParameterOrReference>,
  visited: ReadonlySet<string>,
): SwaggerParameter {
  if (!('$ref' in parameter)) {
    return parameter;
  }

  const ref: string = parameter.$ref;
  const name: string = getReferencedParameterName(ref);

  if (visited.has(name)) {
    throw new Error(`Circular parameter reference "${ref}".`);
  }

  if (!Object.hasOwn(definitions, name)) {
    throw new Error(`Unresolved parameter reference "${ref}".`);
  }

  const nextVisited: Set<string> = new Set<string>(visited);
  nextVisited.add(name);

  const resolved: SwaggerParameter = resolveReference(
    definitions[name],
    definitions,
    nextVisited,
  );

  const validLocation: boolean =
    resolved.in === 'path' ||
    resolved.in === 'query' ||
    resolved.in === 'header' ||
    resolved.in === 'cookie';

  if (
    typeof resolved.name !== 'string' ||
    resolved.name.length === 0 ||
    !validLocation
  ) {
    throw new Error(`Invalid parameter definition referenced by "${ref}".`);
  }

  return resolved;
}

/**
 * Resolves a reusable OpenAPI parameter definition.
 *
 * Inline parameters are returned unchanged.
 * References are resolved from components.parameters,
 * including chained references.
 *
 * The original OpenAPI document is not modified.
 *
 * @param parameter Inline parameter or reference.
 * @param definitions Reusable OpenAPI component parameters.
 * @returns Complete parameter definition.
 */
export default function resolveParameterReference(
  parameter: SwaggerParameterOrReference,
  definitions: Record<string, SwaggerParameterOrReference>,
): SwaggerParameter {
  return resolveReference(parameter, definitions, new Set<string>());
}
