import type { SwaggerResponse, SwaggerResponseOrReference } from './types.js';

/**
 * Extracts a component response name from a local OpenAPI reference.
 *
 * Decodes URI encoding and JSON Pointer escape sequences.
 * External references and references to nested fields are unsupported.
 *
 * @param ref OpenAPI response reference.
 * @returns Decoded reusable response name.
 */
function getReferencedResponseName(ref: string): string {
  const prefix: string = '#/components/responses/';

  if (!ref.startsWith(prefix)) {
    throw new Error(
      `Unsupported response reference "${ref}". ` +
        `Only local components.responses references are supported.`,
    );
  }

  const encodedName: string = ref.slice(prefix.length);

  let decodedName: string;

  try {
    decodedName = decodeURIComponent(encodedName);
  } catch {
    throw new Error(`Invalid response reference "${ref}".`);
  }

  if (
    decodedName.length === 0 ||
    decodedName.includes('/') ||
    /~(?![01])/.test(decodedName)
  ) {
    throw new Error(`Invalid response reference "${ref}".`);
  }

  return decodedName.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Resolves an inline response or a chain of local response references.
 *
 * Tracks component names to detect circular references.
 * Reference Object siblings are ignored for compatibility with
 * OpenAPI 3.0; summary and description do not change the response body.
 *
 * @param response Response or reference to resolve.
 * @param definitions Reusable OpenAPI response definitions.
 * @param visited Component names visited in the current chain.
 * @returns Resolved OpenAPI response.
 */
function resolveReference(
  response: SwaggerResponseOrReference,
  definitions: Record<string, SwaggerResponseOrReference>,
  visited: ReadonlySet<string>,
): SwaggerResponse {
  if (!('$ref' in response)) {
    return response;
  }

  const ref: string = response.$ref;
  const name: string = getReferencedResponseName(ref);

  if (visited.has(name)) {
    throw new Error(`Circular response reference "${ref}".`);
  }

  if (!Object.hasOwn(definitions, name)) {
    throw new Error(`Unresolved response reference "${ref}".`);
  }

  const referenced: SwaggerResponseOrReference = definitions[name];

  if (
    referenced === null ||
    typeof referenced !== 'object' ||
    Array.isArray(referenced)
  ) {
    throw new Error(`Invalid response definition referenced by "${ref}".`);
  }

  const nextVisited: Set<string> = new Set<string>(visited);
  nextVisited.add(name);

  return resolveReference(referenced, definitions, nextVisited);
}

/**
 * Resolves a reusable OpenAPI response definition.
 *
 * Inline responses are returned unchanged. Local references to
 * components.responses may be chained; external references are rejected.
 * The original OpenAPI document is not modified.
 *
 * @param response Inline response or reference.
 * @param definitions Reusable OpenAPI component responses.
 * @returns Complete response definition.
 */
export default function resolveResponseReference(
  response: SwaggerResponseOrReference,
  definitions: Record<string, SwaggerResponseOrReference>,
): SwaggerResponse {
  return resolveReference(response, definitions, new Set<string>());
}
