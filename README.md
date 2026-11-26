# @osumi/swagger-to-angular

![npm](https://img.shields.io/npm/v/@osumi/swagger-to-angular.svg)
![downloads](https://img.shields.io/npm/dm/@osumi/swagger-to-angular.svg)
![license](https://img.shields.io/npm/l/@osumi/swagger-to-angular.svg)
![node](https://img.shields.io/badge/node-%3E%3D24-3C873A)
![typescript](https://img.shields.io/badge/typescript-6.x-3178C6)

Generador de servicios HTTP e interfaces TypeScript para Angular a partir de especificaciones **OpenAPI en formato JSON**.

La herramienta analiza las operaciones, parámetros, esquemas y respuestas de una API y genera un servicio Angular que utiliza `HttpClient`, `Observable`, `inject()` y `@Service()`.

## Compatibilidad

| Versión del paquete | Versión de Angular    |
| ------------------- | --------------------- |
| 1.3.0 en adelante   | Angular 22 o superior |
| Hasta 1.2.0         | Angular 20 o superior |

**Requisitos de la versión 1.3.0:**

- Node.js 24 o superior para ejecutar la CLI.
- Un proyecto Angular 22 o superior para utilizar los servicios generados.
- `HttpClient` configurado en la aplicación.
- Un documento OpenAPI 3.x en formato JSON.

La herramienta se desarrolla con TypeScript 6 y genera código TypeScript para Angular.

La versión 1.3.0 utiliza el decorador `@Service()` introducido en Angular 22 en lugar de `@Injectable()`.

## Instalación

### Instalación local (recomendada)

```bash
npm install --save-dev @osumi/swagger-to-angular
```

Ejecutar mediante `npx`:

```bash
npx swagger-to-angular -f ./openapi.json -d src/app/services
```

### Instalación global

```bash
npm install -g @osumi/swagger-to-angular
```

Después puede utilizarse directamente:

```bash
swagger-to-angular -f ./openapi.json -d src/app/services
```

## Uso de la CLI

```text
swagger-to-angular [ -u <url> | -f <archivo> ] -d <directorio>
```

| Opción       | Descripción                                     |
| ------------ | ----------------------------------------------- |
| `-u, --url`  | URL de una especificación OpenAPI JSON          |
| `-f, --file` | Ruta de un archivo OpenAPI JSON local           |
| `-d, --dest` | Directorio de destino de los archivos generados |

Es obligatorio indicar `-d` y exactamente una de las opciones `-u` o `-f`.

### Generar desde un archivo

```bash
swagger-to-angular -f ./openapi.json -d src/app/services
```

### Generar desde una URL

```bash
swagger-to-angular -u https://example.com/openapi.json -d src/app/services
```

La CLI descarga y analiza el JSON antes de generar el servicio.

Si la URL no responde correctamente, el JSON es inválido o se encuentra una característica no soportada, el proceso muestra un error.

### Archivos generados

El nombre del servicio se obtiene del último segmento no vacío de `servers[0].url`.

Por ejemplo, para:

```json
{
  "servers": [
    {
      "url": "https://example.com/api"
    }
  ]
}
```

Y el destino:

```bash
-d src/app/services
```

Se genera:

```text
src/
  app/
    services/
      api/
        api.service.ts
```

El archivo contiene una clase `ApiService`, los tipos definidos en `components.schemas` y los métodos HTTP correspondientes a las operaciones soportadas.

Si no existe `servers[0].url`, se utiliza `api` como nombre predeterminado.

**Importante:** si el archivo de destino ya existe, se sobrescribe.

## Configuración del servicio generado

Los servicios generados importan:

```typescript
import { environment } from 'src/environments/environment';
```

El servicio utiliza una propiedad `basePath` cuyo nombre depende del servicio generado.

Para `ApiService`, la propiedad es `basePathApi`.

Ejemplo de `src/environments/environment.ts`:

```typescript
export const environment = {
  basePathApi: 'https://example.com/api',
};
```

El servicio generado utiliza esta configuración y, si el valor es vacío o no está definido, recurre a la URL del servidor obtenida de la especificación OpenAPI.

Las rutas declaradas en `paths` se añaden a esa URL base.

Es necesario que la URL base y las rutas de la especificación sean coherentes para evitar segmentos duplicados.

En una aplicación Angular también debe estar configurado `HttpClient`, por ejemplo mediante `provideHttpClient()`.

## Funcionalidades soportadas

### Métodos HTTP

Se generan operaciones de los siguientes métodos:

- `GET`
- `POST`
- `PUT`
- `PATCH`
- `DELETE`
- `HEAD`
- `OPTIONS`

Se utiliza `operationId` como base para el nombre del método.

Si no está definido, se genera un nombre a partir del método HTTP y la ruta.

Los nombres se normalizan para producir identificadores TypeScript válidos y evitar colisiones.

### Modelos TypeScript

Los esquemas de `components.schemas` se convierten en interfaces o alias de tipos TypeScript, según su estructura.

Se admiten, entre otros:

- Tipos primitivos: `string`, `number` y `boolean`.
- Objetos, propiedades obligatorias y opcionales.
- Arrays y referencias entre esquemas.
- Enumeraciones.
- Composiciones `oneOf`, `anyOf` y `allOf`.
- `additionalProperties` para diccionarios.
- `nullable` de OpenAPI 3.0.

Los formatos como `date` y `date-time` se representan como `string`. El generador no convierte automáticamente estas propiedades en objetos `Date`.

El soporte de esquemas es parcial: no se implementan todas las construcciones de JSON Schema ni todas las particularidades de OpenAPI 3.1.

### Referencias `$ref`

Se resuelven referencias locales a:

- `components.schemas`, para generar tipos TypeScript.
- `components.parameters`.
- `components.responses`.
- `components.requestBodies`.
- `components.pathItems`.

Las referencias de parámetros y otros componentes reutilizables admiten cadenas de referencias, así como la detección de referencias circulares o inexistentes.

No se realiza la descarga de referencias externas.

### Parámetros de ruta

Los parámetros `in: path` se incluyen en la firma del método y se serializan según su definición.

Se soportan los estilos `simple`, `label` y `matrix` para los tipos y estructuras admitidos.

La codificación de componentes de URL evita que los valores de los parámetros alteren accidentalmente la estructura de la ruta.

### Parámetros de consulta

Los parámetros `in: query` utilizan `HttpParams` o una serialización de URL específica cuando el estilo lo requiere.

Se soportan:

- Valores escalares.
- Arrays con estilos `form`, `spaceDelimited` y `pipeDelimited`.
- Objetos planos con estilos `form` y `deepObject`.
- Las combinaciones implementadas de `explode`.
- `allowReserved` para valores escalares y arrays compatibles.

Los valores `undefined` se omiten.

En parámetros escalares, los valores `null` se convierten mediante `String()` cuando se proporcionan. Los arrays y objetos nulos se omiten.

Las estructuras anidadas o combinaciones de estilo no soportadas pueden provocar un error de generación.

### Cabeceras HTTP

Se soportan parámetros `in: header` con valores escalares, arrays y objetos planos compatibles con el estilo `simple`.

Los parámetros declarados con los nombres `Accept`, `Content-Type` y `Authorization` se ignoran como parámetros ordinarios, de acuerdo con su tratamiento especial en OpenAPI.

El generador establece `Content-Type` cuando la representación seleccionada de la petición lo requiere.

También puede establecer `Accept` cuando una respuesta ofrece varias representaciones y se necesita seleccionar una.

### Cuerpos de petición

Se soportan cuerpos opcionales y obligatorios, tanto definidos directamente como mediante referencias locales.

Las representaciones admitidas son:

| Media type                                | Cuerpo generado           |
| ----------------------------------------- | ------------------------- |
| `application/json`                        | Tipo deducido del esquema |
| `application/*+json` con subtipo concreto | JSON                      |
| `text/json`                               | JSON                      |
| `text/plain`                              | `string`                  |
| `application/octet-stream`                | `Blob`                    |

En las representaciones JSON que pueden contener cadenas, valores nulos o tipos indeterminados, el generador utiliza `JSON.stringify()` para producir un cuerpo JSON válido.

Las peticiones binarias utilizan `Blob`; puede pasarse también un `File`, que hereda de `Blob`.

Cuando un cuerpo declara varias representaciones, se elige una según el orden de prioridad implementado. El método generado no permite seleccionar dinámicamente otra representación.

Los cuerpos de petición en operaciones `GET`, `HEAD` y `OPTIONS` se rechazan explícitamente.

### Tipos de respuesta

El generador determina el tipo de retorno a partir de la respuesta de éxito seleccionada.

La selección prioriza el código `2xx` explícito más bajo y utiliza `2XX` cuando no existe una respuesta de éxito explícita.

Se admiten:

| Media type                                      | Tipo de respuesta         |
| ----------------------------------------------- | ------------------------- |
| JSON (`application/json`, `+json`, `text/json`) | Tipo deducido del esquema |
| `text/plain`                                    | `string`                  |
| `application/pdf`                               | `ArrayBuffer`             |
| `application/octet-stream`                      | `ArrayBuffer`             |

Las respuestas sin contenido generan `Observable<void>`.

Cuando no existe una respuesta de éxito documentada, se mantiene `Observable<any>` como comportamiento de compatibilidad.

### Media types parametrizados

Se admiten representaciones con parámetros MIME, por ejemplo:

```text
application/json; v=1.0
application/json; charset=utf-8
text/plain; charset=utf-8
application/merge-patch+json
```

La selección se realiza utilizando el tipo base, pero se conserva el valor declarado para las cabeceras `Content-Type` o `Accept` cuando corresponde.

### Cookies

Cuando una operación declara un parámetro `in: cookie`, se añade:

```typescript
withCredentials: true;
```

Las cookies son gestionadas por el navegador.

El generador no añade argumentos individuales para los valores de las cookies ni establece manualmente la cabecera `Cookie`.

Su envío depende de la configuración del navegador, las políticas `SameSite`, el origen de la petición y las reglas CORS.

En SSR, `withCredentials` no reenvía automáticamente las cookies recibidas en la petición original al servidor Angular.

### Gestión de errores

Los servicios generados utilizan `catchError()` y un manejador común que transforma los errores HTTP en instancias de `Error`.

Esta gestión es genérica y no genera clases especializadas para cada respuesta de error declarada en OpenAPI.

## Limitaciones conocidas

La versión 1.3.0 no pretende implementar la especificación OpenAPI completa.

Entre las características no soportadas o no implementadas automáticamente se encuentran:

- Documentos YAML y especificaciones Swagger 2.0.
- Referencias `$ref` externas.
- Cuerpos `multipart/form-data` y `application/x-www-form-urlencoded`.
- Cuerpos XML y otros formatos no incluidos entre los media types soportados.
- Selección dinámica de media types por cada llamada.
- Generación automática de autenticación OAuth2, Bearer, API Key u otros mecanismos a partir de `security` o `securitySchemes`.
- Generación de métodos para operaciones HTTP `TRACE`.
- Conversión automática de fechas a objetos `Date`.
- Soporte integral de JSON Schema/OpenAPI 3.1.
- Todas las combinaciones posibles de serialización de parámetros.
- Generación de tipos de error especializados o validación de datos en tiempo de ejecución.

Si se encuentra un cuerpo, una referencia o una combinación de serialización no soportada, el generador puede interrumpir la generación con un error descriptivo.

La autenticación, cuando sea necesaria, puede gestionarse desde la aplicación Angular, por ejemplo mediante interceptores HTTP.

## Desarrollo

Clona el repositorio:

```bash
git clone https://github.com/osumionline/swagger-to-angular.git
cd swagger-to-angular
```

Instala las dependencias:

```bash
npm install
```

Compila el proyecto:

```bash
npm run build
```

Ejecuta la CLI compilada:

```bash
node dist/bin/cli.js -f ./openapi.json -d ./output
```

También puedes utilizar:

```bash
npm run start -- -f ./openapi.json -d ./output
```

### Lint

```bash
npm run lint
```

### Pruebas

Ejecutar todas las pruebas:

```bash
npm test
```

Ejecutar en modo watch:

```bash
npm run test:watch
```

Generar un informe de cobertura:

```bash
npm run test:coverage
```

Actualizar snapshots cuando un cambio intencionado modifique la salida del generador:

```bash
npm run test:update
```

Las pruebas incluyen casos unitarios y de integración, fixtures OpenAPI y comprobaciones de compilación de servicios generados utilizando las declaraciones de tipos de Angular 22.

### Comprobar el paquete npm

Antes de publicar una nueva versión, se recomienda ejecutar:

```bash
npm run build
npm run lint
npm test
npm pack --dry-run
```

El último comando permite revisar los archivos que se incluirán en el paquete sin publicarlo.

## Repositorio y soporte

- Repositorio: https://github.com/osumionline/swagger-to-angular
- Incidencias: https://github.com/osumionline/swagger-to-angular/issues
- npm: https://www.npmjs.com/package/@osumi/swagger-to-angular

## Licencia

MIT. Consulta el archivo [LICENSE](LICENSE).
