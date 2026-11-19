/**
 * Formats an OpenAPI property name as a valid TypeScript property key.
 *
 * Simple ASCII identifiers are preserved without quotes.
 * Other names are emitted as escaped string literals.
 *
 * @param name Original OpenAPI property name.
 * @returns Valid TypeScript property key.
 */
export default function formatPropertyName(name: string): string {
  const isSimpleIdentifier: boolean = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);

  return isSimpleIdentifier ? name : JSON.stringify(name);
}
