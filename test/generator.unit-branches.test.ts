import { describe, expect, it } from 'vitest';
import { __test__ } from '../src/generator.js';

describe('generator.ts branch/unit coverage', () => {
  it('extractRefName(): returns last segment for normal refs and falls back to "any" when empty', () => {
    expect(__test__.extractRefName('#/components/schemas/Foo')).toBe('Foo');
    expect(__test__.extractRefName('Foo')).toBe('Foo');
    expect(__test__.extractRefName('')).toBe('any');
    expect(__test__.extractRefName('/')).toBe('any');
  });

  it('toTsLiteral(): handles null, string, number finite, number non-finite, boolean, and unknown', () => {
    expect(__test__.toTsLiteral(null)).toBe('null');
    expect(__test__.toTsLiteral('hola')).toBe('"hola"');
    expect(__test__.toTsLiteral(123)).toBe('123');
    expect(__test__.toTsLiteral(Number.POSITIVE_INFINITY)).toBe('number');
    expect(__test__.toTsLiteral(true)).toBe('true');
    expect(__test__.toTsLiteral(false)).toBe('false');
    expect(__test__.toTsLiteral({})).toBe('any');
  });

  it('buildUnion(): returns any for empty, same element for single, join for many', () => {
    expect(__test__.buildUnion([])).toBe('any');
    expect(__test__.buildUnion(['A'])).toBe('A');
    expect(__test__.buildUnion(['A', 'B'])).toBe('A | B');
  });

  it('buildIntersection(): returns any for empty, same element for single, join for many', () => {
    expect(__test__.buildIntersection([])).toBe('any');
    expect(__test__.buildIntersection(['A'])).toBe('A');
    expect(__test__.buildIntersection(['A', 'B'])).toBe('A & B');
  });

  it('mapSwaggerSchemaToTs(): handles anyOf', () => {
    const schema = {
      anyOf: [{ type: 'string' }, { type: 'integer' }],
    };
    expect(__test__.mapSwaggerSchemaToTs(schema)).toBe('string | number');
  });

  it('mapSwaggerSchemaToTs(): handles arrays', () => {
    const schema = { type: 'array', items: { type: 'integer' } };
    expect(__test__.mapSwaggerSchemaToTs(schema)).toBe('number[]');
  });

  it('mapSwaggerSchemaToTs(): handles object additionalProperties === true', () => {
    const schema = { type: 'object', additionalProperties: true };
    expect(__test__.mapSwaggerSchemaToTs(schema)).toBe('{ [key: string]: any }');
  });

  it('mapSwaggerSchemaToTs(): handles object with no properties and no additionalProperties (fallback any-map)', () => {
    const schema = { type: 'object' };
    expect(__test__.mapSwaggerSchemaToTs(schema)).toBe('{ [key: string]: any }');
  });

  it('mapSwaggerSchemaToTs(): handles enum with mixed values (string/number/bool/null)', () => {
    const schema = { enum: ['X', 1, true, null] };
    expect(__test__.mapSwaggerSchemaToTs(schema)).toBe('"X" | 1 | true | null');
  });

  it('mapSwaggerSchemaToTs(): returns any on completely unknown schema', () => {
    expect(__test__.mapSwaggerSchemaToTs({})).toBe('any');
  });
});