# @osumi/swagger-to-angular

![npm](https://img.shields.io/npm/v/@osumi/swagger-to-angular.svg)
![downloads](https://img.shields.io/npm/dm/@osumi/swagger-to-angular.svg)
![license](https://img.shields.io/npm/l/@osumi/swagger-to-angular.svg)
![tests](https://img.shields.io/badge/tests-vitest-6E9F18)
![node](https://img.shields.io/badge/node-%3E%3D24-3C873A)
![typescript](https://img.shields.io/badge/typescript-6.x-3178C6)

Herramienta CLI para generar servicios e interfaces Angular a partir de un archivo Swagger/OpenAPI.

Convierte automáticamente un Swagger JSON en un servicio `.ts` que incluye:

- Todas las interfaces del apartado `components.schemas`
- Todos los métodos HTTP (`get`, `post`, `put`, `delete`) del apartado `paths`
- Firma de parámetros y tipos de retorno
- Gestión de errores HTTP
- Uso de `inject(HttpClient)` y entorno compatible con Angular 20+

---

## 📦 Output generado

La herramienta crea una carpeta con el nombre del “slug” del servidor (último segmento de `servers[0].url`) y dentro genera el servicio:

/
/
.service.ts

Ejemplo: si `servers[0].url` termina en `/api`, se generará:

/api/api.service.ts

---

## 🚀 Instalación

### Global (para usarlo como comando en cualquier proyecto)

```bash
npm install -g @osumi/swagger-to-angular

Local (dentro de un proyecto)

npm install --save-dev @osumi/swagger-to-angular

Luego puedes usarlo con npx:

npx swagger-to-angular <opciones>


⸻

🧪 Uso

swagger-to-angular [ -u <url> | -f <archivo> ] -d <directorio>

	•	-u, --url <url>: URL al JSON Swagger
	•	-f, --file <archivo>: Ruta local a un archivo JSON Swagger
	•	-d, --dest <directorio>: Ruta donde se generará el archivo .ts

Es obligatorio indicar -d, y uno de -u o -f (pero no ambos).

⸻

✅ Ejemplos

# Leer desde una URL
swagger-to-angular -u http://localhost:8080/api-docs.json -d src/app/services/api

# Leer desde un archivo local
swagger-to-angular -f ./swagger.json -d src/app/services/api


⸻

🔎 Query params

Los parámetros de query se generan usando HttpParams y solo se omiten cuando el valor es undefined.
Valores como null o "" se envían tal cual (si el backend los acepta como válidos).

⸻

⚙️ Desarrollo local

Para contribuir o probar el proyecto localmente:

# Clona el repositorio o trabaja en tu directorio local
npm install
npm run build

# Ejecutar localmente con tsx
npx tsx bin/cli.ts -f ./swagger.json -d src/api

# O probar como si estuviera instalado globalmente
npm link
swagger-to-angular -f ./swagger.json -d src/api

ℹ️ Nota sobre npm run

Si quieres ejecutar con npm run, usa -- para pasar argumentos correctamente:

npm run start -- -f ./swagger.json -d src/api


⸻

🧪 Tests

Este proyecto usa Vitest y snapshots para validar el código generado.

# Ejecutar tests en modo watch
npm run test

# Ejecutar tests una sola vez
npm run test:run

# Actualizar snapshots (cuando cambie el output del generador de forma intencional)
npm run test:update

# Informe de cobertura
npm run test:coverage

Si cambias el generador y el cambio es intencional, ejecuta npm run test:update para actualizar los snapshots.

⸻

📜 Licencia

MIT

