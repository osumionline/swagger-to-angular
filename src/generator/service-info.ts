import type { ServiceInfo, SwaggerDoc } from './types.js';

/**
 * Extracts the service name and related metadata from
 * the first server URL defined in the Swagger document.
 *
 * @param swagger Parsed Swagger/OpenAPI document.
 * @returns Service filename, class name, base path key and server URL.
 */
export default function extractServiceName(swagger: SwaggerDoc): ServiceInfo {
  const fullUrl: string = swagger.servers?.[0]?.url ?? '';

  const slug: string = fullUrl.split('/').filter(Boolean).pop() ?? 'api';

  const className: string =
    slug.replace(/(^\w|-\w)/g, (m: string): string => {
      return m.replace('-', '').toUpperCase();
    }) + 'Service';

  const fileName: string = `${slug}.service.ts`;

  const basePathName: string = `basePath${className.replace('Service', '')}`;

  return {
    fileName,
    className,
    basePathName,
    serverUrl: fullUrl,
  };
}
