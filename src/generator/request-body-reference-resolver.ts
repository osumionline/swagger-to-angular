import type {
  SwaggerRequestBody,
  SwaggerRequestBodyOrReference,
} from './types.js';

/**
 * Extracts a reusable request body name from a local
 * OpenAPI JSON Pointer.
 *
 * Supports URI decoding and JSON Pointer escapes.
 * External and nested-field references are rejected.
 *
 * @param ref OpenAPI request body reference.
 * @returns Decoded reusable request body name.
 */
function getReferencedRequestBodyName(ref: string): string {
  const prefix: string = '#/components/requestBodies/';

  if (!ref.startsWith(prefix)) {
    throw new Error(
      `Unsupported request body reference "${ref}". ` +
        `Only local components.requestBodies references are supported.`,
    );
  }

  const encodedName: string = ref.slice(prefix.length);

  let decodedName: string;

  try {
    decodedName = decodeURIComponent(encodedName);
  } catch {
    throw new Error(`Invalid request body reference "${ref}".`);
  }

  if (
    decodedName.length === 0 ||
    decodedName.includes('/') ||
    /~(?![01])/.test(decodedName)
  ) {
    throw new Error(`Invalid request body reference "${ref}".`);
  }

  return decodedName.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Recursively resolves a request body or local reference.
 *
 * A referenced definition may point to another reference.
 * The visited set detects circular reference chains.
 *
 * Reference Object siblings are ignored, preserving
 * the behavior used for other component references.
 *
 * @param requestBody Request body or reference to resolve.
 * @param definitions Reusable request body definitions.
 * @param visited Component names visited in this chain.
 * @returns Resolved request body definition.
 */
function resolveReference(
  requestBody: SwaggerRequestBodyOrReference,
  definitions: Record<string, SwaggerRequestBodyOrReference>,
  visited: ReadonlySet<string>,
): SwaggerRequestBody {
  if (!('$ref' in requestBody)) {
    return requestBody;
  }

  const ref: string = requestBody.$ref;
  const name: string = getReferencedRequestBodyName(ref);

  if (visited.has(name)) {
    throw new Error(`Circular request body reference "${ref}".`);
  }

  if (!Object.hasOwn(definitions, name)) {
    throw new Error(`Unresolved request body reference "${ref}".`);
  }

  const referenced: SwaggerRequestBodyOrReference = definitions[name];

  if (
    referenced === null ||
    typeof referenced !== 'object' ||
    Array.isArray(referenced)
  ) {
    throw new Error(`Invalid request body definition referenced by "${ref}".`);
  }

  const nextVisited: Set<string> = new Set<string>(visited);
  nextVisited.add(name);

  return resolveReference(referenced, definitions, nextVisited);
}

/**
 * Resolves an OpenAPI request body definition.
 *
 * Inline definitions are returned unchanged. References
 * to components.requestBodies can be chained and are
 * resolved without modifying the original document.
 *
 * @param requestBody Inline request body or reference.
 * @param definitions Reusable OpenAPI request bodies.
 * @returns Complete request body definition.
 */
export default function resolveRequestBodyReference(
  requestBody: SwaggerRequestBodyOrReference,
  definitions: Record<string, SwaggerRequestBodyOrReference>,
): SwaggerRequestBody {
  return resolveReference(requestBody, definitions, new Set<string>());
}
