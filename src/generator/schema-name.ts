/**
 * Prefix reserved for encoded OpenAPI schema names.
 */
const GENERATED_PREFIX: string = 'OpenApiSchema_';

/**
 * TypeScript keywords and primitive type names that should not
 * be used directly as generated schema declarations.
 */
const RESERVED_SCHEMA_NAMES: ReadonlySet<string> = new Set<string>([
  'any',
  'as',
  'asserts',
  'async',
  'await',
  'bigint',
  'boolean',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'constructor',
  'continue',
  'debugger',
  'declare',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'get',
  'if',
  'implements',
  'import',
  'in',
  'infer',
  'instanceof',
  'interface',
  'is',
  'keyof',
  'let',
  'module',
  'namespace',
  'never',
  'new',
  'null',
  'number',
  'object',
  'of',
  'package',
  'private',
  'protected',
  'public',
  'readonly',
  'require',
  'return',
  'set',
  'static',
  'string',
  'super',
  'switch',
  'symbol',
  'this',
  'throw',
  'true',
  'try',
  'type',
  'typeof',
  'undefined',
  'unique',
  'unknown',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

/**
 * Converts an OpenAPI schema name into a valid TypeScript
 * type identifier.
 *
 * Valid identifiers are preserved unless they are reserved
 * or use the prefix dedicated to generated names.
 *
 * All non-alphanumeric characters in encoded names are
 * represented by their Unicode code points. This preserves
 * uniqueness, including when an original name resembles
 * an already encoded name.
 *
 * @param name Original OpenAPI schema name.
 * @returns Valid and deterministic TypeScript identifier.
 */
export default function formatSchemaName(name: string): string {
  const isValidIdentifier: boolean = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);

  const requiresEncoding: boolean =
    !isValidIdentifier ||
    RESERVED_SCHEMA_NAMES.has(name) ||
    name.startsWith(GENERATED_PREFIX);

  if (!requiresEncoding) {
    return name;
  }

  const encodedCharacters: string[] = Array.from(name).map(
    (character: string): string => {
      const isAlphanumeric: boolean = /^[A-Za-z0-9]$/.test(character);

      if (isAlphanumeric) {
        return character;
      }

      const codePoint: number = character.codePointAt(0) ?? 0;

      return `_${codePoint.toString(16)}_`;
    },
  );

  return `${GENERATED_PREFIX}${encodedCharacters.join('')}`;
}
