import type { SwaggerPathItem, SwaggerPaths } from './types.js';

/**
 * Retrieves the Path Item referenced by a local
 * OpenAPI JSON Pointer.
 *
 * Supports references to the root paths object and
 * reusable components.pathItems definitions.
 *
 * URI encoding and JSON Pointer escapes are decoded.
 * External and nested-field references are rejected.
 *
 * @param ref Local OpenAPI Path Item reference.
 * @param paths Root OpenAPI paths.
 * @param pathItems Reusable Path Item components.
 * @returns Referenced Path Item.
 */
function getReferencedPathItem(
  ref: string,
  paths: SwaggerPaths,
  pathItems: Record<string, SwaggerPathItem>,
): SwaggerPathItem {
  const pathsPrefix: string = '#/paths/';
  const componentsPrefix: string = '#/components/pathItems/';

  let definitions: Record<string, SwaggerPathItem>;
  let encodedName: string;

  if (ref.startsWith(pathsPrefix)) {
    definitions = paths;
    encodedName = ref.slice(pathsPrefix.length);
  } else if (ref.startsWith(componentsPrefix)) {
    definitions = pathItems;
    encodedName = ref.slice(componentsPrefix.length);
  } else {
    throw new Error(
      `Unsupported Path Item reference "${ref}". ` +
        `Only local paths and components.pathItems references are supported.`,
    );
  }

  let decodedName: string;

  try {
    decodedName = decodeURIComponent(encodedName);
  } catch {
    throw new Error(`Invalid Path Item reference "${ref}".`);
  }

  if (
    decodedName.length === 0 ||
    decodedName.includes('/') ||
    /~(?![01])/.test(decodedName)
  ) {
    throw new Error(`Invalid Path Item reference "${ref}".`);
  }

  const name: string = decodedName.replace(/~1/g, '/').replace(/~0/g, '~');

  if (!Object.hasOwn(definitions, name)) {
    throw new Error(`Unresolved Path Item reference "${ref}".`);
  }

  const referenced: SwaggerPathItem = definitions[name];

  if (
    referenced === null ||
    typeof referenced !== 'object' ||
    Array.isArray(referenced)
  ) {
    throw new Error(`Invalid Path Item definition referenced by "${ref}".`);
  }

  return referenced;
}

/**
 * Recursively resolves an OpenAPI Path Item reference.
 *
 * A referenced Path Item may itself contain another
 * reference. The visited set prevents circular resolution.
 *
 * Local summary, description and extension metadata
 * are accepted but do not affect HTTP method generation.
 *
 * Local operations, parameters and other fields alongside
 * $ref are rejected to avoid ambiguous merging behavior.
 *
 * @param pathItem Path Item to resolve.
 * @param paths Root OpenAPI paths.
 * @param pathItems Reusable Path Item components.
 * @param visited References visited in the current chain.
 * @returns Resolved Path Item.
 */
function resolveReference(
  pathItem: SwaggerPathItem,
  paths: SwaggerPaths,
  pathItems: Record<string, SwaggerPathItem>,
  visited: ReadonlySet<string>,
): SwaggerPathItem {
  const ref: string | undefined = pathItem.$ref;

  if (ref === undefined) {
    return pathItem;
  }

  const unsupportedSiblings: string[] = Object.keys(pathItem).filter(
    (key: string): boolean => {
      return (
        key !== '$ref' &&
        key !== 'summary' &&
        key !== 'description' &&
        !key.startsWith('x-')
      );
    },
  );

  if (unsupportedSiblings.length > 0) {
    throw new Error(
      `Unsupported Path Item siblings alongside "${ref}": ` +
        unsupportedSiblings.join(', '),
    );
  }

  if (visited.has(ref)) {
    throw new Error(`Circular Path Item reference "${ref}".`);
  }

  const referenced: SwaggerPathItem = getReferencedPathItem(
    ref,
    paths,
    pathItems,
  );

  const nextVisited: Set<string> = new Set<string>(visited);
  nextVisited.add(ref);

  return resolveReference(referenced, paths, pathItems, nextVisited);
}

/**
 * Resolves a Path Item used by the Angular method generator.
 *
 * Supports direct Path Items, references to root paths,
 * references to components.pathItems and reference chains.
 *
 * The original OpenAPI document is not modified.
 *
 * @param pathItem Original Path Item.
 * @param paths Root OpenAPI paths.
 * @param pathItems Reusable Path Item components.
 * @returns Resolved Path Item.
 */
export default function resolvePathItem(
  pathItem: SwaggerPathItem,
  paths: SwaggerPaths,
  pathItems: Record<string, SwaggerPathItem> = {},
): SwaggerPathItem {
  return resolveReference(pathItem, paths, pathItems, new Set<string>());
}
