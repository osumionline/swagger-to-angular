import type { ServiceInfo } from './types.js';

/**
 * Builds the complete Angular service source file.
 * Combines imports, interfaces, service metadata,
 * generated HTTP methods and the error handler.
 *
 * @param serviceInfo Metadata identifying the generated service.
 * @param interfaces Generated TypeScript interface declarations.
 * @param methods Generated Angular HTTP method declarations.
 * @returns Complete Angular service source code.
 */
export default function buildFullFile(
  serviceInfo: ServiceInfo,
  interfaces: string,
  methods: string,
): string {
  return `import {
  HttpClient,
  HttpErrorResponse,
  HttpParams,
} from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { environment } from 'src/environments/environment';
import { catchError, Observable, throwError } from 'rxjs';

${interfaces}

@Service()
export class ${serviceInfo.className} {
  http: HttpClient = inject(HttpClient);
  ${serviceInfo.basePathName}: string = environment.${serviceInfo.basePathName} || '${serviceInfo.serverUrl}';

${methods}

  /**
   * Generic HTTP error handler.
   *
   * @param error HttpErrorResponse
   * @returns Observable that errors with a normalized Error instance.
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage: string = "";

    if (error.error instanceof ErrorEvent) {
      errorMessage = "Error: " + error.error.message;
    } else {
      errorMessage = "Error " + error.status + ": " + error.message;
    }

    return throwError((): Error => new Error(errorMessage));
  }
}`;
}
