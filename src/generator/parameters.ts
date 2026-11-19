import type { SwaggerParameter } from './types.js';

/**
 * Combines path-level and operation-level OpenAPI parameters.
 *
 * Parameters defined at operation level override inherited
 * parameters when both their name and location match.
 * Other inherited parameters are preserved.
 *
 * @param pathParameters Parameters declared at path level.
 * @param operationParameters Parameters declared at operation level.
 * @returns Merged parameters without duplicate name/location pairs.
 */
export default function mergeParameters(
  pathParameters: SwaggerParameter[],
  operationParameters: SwaggerParameter[],
): SwaggerParameter[] {
  const merged: SwaggerParameter[] = [...pathParameters];

  for (const operationParameter of operationParameters) {
    const index: number = merged.findIndex(
      (parameter: SwaggerParameter): boolean => {
        return (
          parameter.name === operationParameter.name &&
          parameter.in === operationParameter.in
        );
      },
    );

    if (index === -1) {
      merged.push(operationParameter);
    } else {
      merged[index] = operationParameter;
    }
  }

  return merged;
}
