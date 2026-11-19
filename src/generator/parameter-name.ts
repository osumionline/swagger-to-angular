import formatSchemaName from './schema-name.js';
import type { SwaggerParameter } from './types.js';

/**
 * Names reserved for generated HTTP method internals
 * or forbidden as strict-mode function parameters.
 */
const RESERVED_PARAMETER_NAMES: ReadonlySet<string> = new Set<string>([
  'params',
  'headers',
  'options',
  'payload',
  'arguments',
  'eval',
]);

/**
 * Creates a valid and unique TypeScript argument name
 * for an OpenAPI parameter.
 *
 * Preserves ordinary parameter names where possible.
 * Reserved names and collisions receive a suffix based
 * on the parameter location.
 *
 * The resulting name is added to usedNames so subsequent
 * parameters cannot reuse it.
 *
 * @param parameter OpenAPI parameter definition.
 * @param usedNames Argument names already assigned in this method.
 * @returns Valid and unique TypeScript argument name.
 */
export default function createParameterName(
  parameter: SwaggerParameter,
  usedNames: Set<string>,
): string {
  const baseName: string = formatSchemaName(parameter.name);

  let argumentName: string = baseName;

  if (
    RESERVED_PARAMETER_NAMES.has(argumentName) ||
    usedNames.has(argumentName)
  ) {
    argumentName = `${baseName}_${parameter.in}`;
  }

  let suffix: number = 2;

  while (
    RESERVED_PARAMETER_NAMES.has(argumentName) ||
    usedNames.has(argumentName)
  ) {
    argumentName = `${baseName}_${parameter.in}_${suffix}`;
    suffix += 1;
  }

  usedNames.add(argumentName);

  return argumentName;
}
