import { describe, expect, it } from 'vitest';
import extractServiceName from '../src/generator/service-info.js';
import type { ServiceInfo, SwaggerDoc } from '../src/generator/types.js';

describe('extractServiceName', (): void => {
  it('extracts service metadata from a server URL', (): void => {
    const swagger: SwaggerDoc = {
      servers: [{ url: 'https://example.com/api' }],
    };

    const result: ServiceInfo = extractServiceName(swagger);

    expect(result).toEqual({
      fileName: 'api.service.ts',
      className: 'ApiService',
      basePathName: 'basePathApi',
      serverUrl: 'https://example.com/api',
    });
  });

  it('converts hyphenated names to PascalCase', (): void => {
    const swagger: SwaggerDoc = {
      servers: [{ url: 'https://example.com/my-api' }],
    };

    const result: ServiceInfo = extractServiceName(swagger);

    expect(result.fileName).toBe('my-api.service.ts');
    expect(result.className).toBe('MyApiService');
    expect(result.basePathName).toBe('basePathMyApi');
  });

  it('uses api when servers are missing', (): void => {
    const swagger: SwaggerDoc = {};

    const result: ServiceInfo = extractServiceName(swagger);

    expect(result).toEqual({
      fileName: 'api.service.ts',
      className: 'ApiService',
      basePathName: 'basePathApi',
      serverUrl: '',
    });
  });
});
