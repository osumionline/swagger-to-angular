import { describe, expect, it } from 'vitest';
import { generateFromFixture } from './_helpers';

describe('swagger-to-angular fixtures', () => {
  it('minimal: generates service with class, basePath and method', () => {
    const { content } = generateFromFixture('minimal');
    expect(content).toContain('export class ApiService');
    expect(content).toContain('basePathApi');
    expect(content).toContain('getFoo(');
    expect(content).toContain('Observable<Foo>');
    expect(content).toMatchSnapshot();
  });

  it('query-params: uses HttpParams and if blocks with braces', () => {
    const { content } = generateFromFixture('query-params');
    expect(content).toContain('HttpParams');
    expect(content).toContain('let params = new HttpParams();');

    expect(content).toContain("if (q !== undefined) {");
    expect(content).toContain("params = params.set('q', String(q));");
    expect(content).toContain("if (page !== undefined) {");
    expect(content).toContain("params = params.set('page', String(page));");
    expect(content).toContain("if (esCierre !== undefined) {");
    expect(content).toContain("params = params.set('esCierre', String(esCierre));");

    expect(content).toContain('const options = {');
    expect(content).toContain('params');
    expect(content).toMatchSnapshot();
  });

  it('path-params: required path param is not optional in method signature', () => {
    const { content } = generateFromFixture('path-params');
    expect(content).toContain('getUser(id: number)');
    expect(content).toContain('/v1/users/${id}');
    expect(content).toMatchSnapshot();
  });

  it('body-inline: generates required payload (no ?) and inline body type', () => {
    const { content } = generateFromFixture('body-inline');
    expect(content).toContain('createUser(payload: {');
    expect(content).toContain('email: string;');
    expect(content).toContain('age?: number | null;');
    expect(content).toContain('.post<boolean>(');
    expect(content).toContain('/v1/users');
    expect(content).toMatchSnapshot();
  });

  it('composition: generates oneOf union and allOf intersection', () => {
    const { content } = generateFromFixture('composition');
    expect(content).toContain('getThing(): Observable<A | B | {');
    expect(content).toContain('kind?: "X" | "Y";');
    expect(content).toContain('n?: number | null;');
    expect(content).toContain('getMerge(): Observable<A & B>');
    expect(content).toMatchSnapshot();
  });

  it('binary: pdf returns ArrayBuffer and sets responseType arraybuffer', () => {
    const { content } = generateFromFixture('binary');
    expect(content).toContain('getReportPdf(): Observable<ArrayBuffer>');
    expect(content).toContain("responseType: 'arraybuffer' as const");
    expect(content).toContain('.get(`');
    expect(content).toMatchSnapshot();
  });

  it('delete-with-body: delete uses body option object and preserves options merging', () => {
    const { content } = generateFromFixture('delete-with-body');
    expect(content).toContain('deleteItem(id: number, payload: {');
    expect(content).toContain('reason: string;');
    expect(content).toContain('force?: boolean;');
    expect(content).toContain('.delete<boolean>(');
    expect(content).toContain('/v1/items/${id}');
    expect(content).toContain('{ body: payload');
    expect(content).toMatchSnapshot();
  });

  it('no-operation-id: generates a fallback operationId', () => {
    const { content } = generateFromFixture('no-operation-id');
    expect(content).toContain('get__v1_ping(');
    expect(content).toContain('.get<string>(');
    expect(content).toContain('/v1/ping');
    expect(content).toMatchSnapshot();
  });

  it('delete-no-body: delete without payload uses options object', () => {
    const { content } = generateFromFixture('delete-no-body');
    expect(content).toContain('deleteItemNoBody(id: number)');
    expect(content).toContain('.delete<boolean>(');
    expect(content).toContain('/v1/items/${id}');
    expect(content).toMatchSnapshot();
  });

  it('post-no-body: post without payload uses options object', () => {
    const { content } = generateFromFixture('post-no-body');
    expect(content).toContain('postPing(): Observable<string>');
    expect(content).toContain('.post<string>(');
    expect(content).toContain('/v1/ping');
    expect(content).toMatchSnapshot();
  });

  it('binary-with-query: binary response + query params merges options', () => {
    const { content } = generateFromFixture('binary-with-query');
    expect(content).toContain('getReportPdfWithQuery(id?: number): Observable<ArrayBuffer>');
    expect(content).toContain('let params = new HttpParams();');
    expect(content).toContain("if (id !== undefined) {");
    expect(content).toContain("params = params.set('id', String(id));");
    expect(content).toContain("responseType: 'arraybuffer' as const");
    expect(content).toMatchSnapshot();
  });

  it('additional-properties-schema: maps to { [key: string]: number }', () => {
    const { content } = generateFromFixture('additional-properties-schema');
    expect(content).toContain('getMap(): Observable<{ [key: string]: number }>');
    expect(content).toMatchSnapshot();
  });

  it('object-no-type-properties: treats schema as object literal', () => {
    const { content } = generateFromFixture('object-no-type-properties');
    expect(content).toContain('getObjNoType(): Observable<{ x?: string; y?: number; }>');
    expect(content).toMatchSnapshot();
  });

  it('missing-servers: falls back to ApiService and basePathApi', () => {
    const { content } = generateFromFixture('missing-servers');
    expect(content).toContain('export class ApiService');
    expect(content).toContain('basePathApi');
    expect(content).toContain('getFooNoServers(');
    expect(content).toMatchSnapshot();
  });

  it('no-paths: handles swagger without paths', () => {
    const { content } = generateFromFixture('no-paths');
    expect(content).toContain('export class NopathsService');
    expect(content).toMatchSnapshot();
  });

  it('schema-no-properties: interface without properties is generated', () => {
    const { content } = generateFromFixture('schema-no-properties');
    expect(content).toContain('export interface Empty {');
    expect(content).toMatchSnapshot();
  });

  it('no-200: handles missing 200 response content', () => {
    const { content } = generateFromFixture('no-200');
    expect(content).toContain('getNo200(');
    expect(content).toMatchSnapshot();
  });
});