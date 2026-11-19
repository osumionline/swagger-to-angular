import { describe, expect, it } from 'vitest';
import buildFullFile from '../src/generator/template.js';
import type { ServiceInfo } from '../src/generator/types.js';

describe('buildFullFile', (): void => {
  it('generates an Angular 22 service decorator', (): void => {
    const serviceInfo: ServiceInfo = {
      fileName: 'api.service.ts',
      className: 'ApiService',
      basePathName: 'basePathApi',
      serverUrl: 'https://example.com/api',
    };

    const content: string = buildFullFile(serviceInfo, '', '');

    expect(content).toContain(
      "import { Service, inject } from '@angular/core';",
    );

    expect(content).toContain('@Service()');

    expect(content).toContain('export class ApiService');

    expect(content).toContain('basePathApi: string = environment.basePathApi');

    expect(content).not.toContain('@Injectable');
  });
});
