import formatSchemaName from './schema-name.js';

/**
 * Names reserved by the generated service or inherited
 * from the JavaScript Object prototype.
 */
const RESERVED_METHOD_NAMES: ReadonlySet<string> = new Set<string>([
  'constructor',
  'http',
  'handleError',
  'toString',
  'toLocaleString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  '__proto__',
]);

/**
 * Creates a valid and unique TypeScript method name
 * from an OpenAPI operationId.
 *
 * Preserves ordinary identifiers whenever possible.
 * Resolves collisions with generated service members,
 * existing operations and the base path property.
 *
 * The HTTP method is used as a suffix when a name
 * requires disambiguation.
 *
 * @param operationId Original OpenAPI operation identifier.
 * @param httpMethod HTTP method associated with the operation.
 * @param basePathName Generated service base path property name.
 * @param usedNames Method names already assigned in this service.
 * @returns Valid and unique TypeScript method name.
 */
export default function createOperationName(
  operationId: string,
  httpMethod: string,
  basePathName: string,
  usedNames: Set<string>,
): string {
  const baseName: string = formatSchemaName(operationId);

  /**
   * Checks whether a candidate conflicts with an existing
   * or reserved service member.
   *
   * @param candidate Method name to check.
   * @returns True when the candidate cannot be used.
   */
  const isUnavailable = (candidate: string): boolean => {
    return (
      RESERVED_METHOD_NAMES.has(candidate) ||
      candidate === basePathName ||
      usedNames.has(candidate)
    );
  };

  let methodName: string = baseName;

  if (isUnavailable(methodName)) {
    methodName = `${baseName}_${httpMethod}`;
  }

  let suffix: number = 2;

  while (isUnavailable(methodName)) {
    methodName = `${baseName}_${httpMethod}_${suffix}`;
    suffix += 1;
  }

  usedNames.add(methodName);

  return methodName;
}
