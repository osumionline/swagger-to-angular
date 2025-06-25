# @osumi/swagger-to-angular

Herramienta CLI para generar servicios e interfaces Angular a partir de un archivo Swagger/OpenAPI.

Convierte automáticamente un Swagger JSON en un servicio `.ts` que incluye:

-   Todas las interfaces del apartado `components.schemas`
-   Todos los métodos HTTP (`get`, `post`, `put`, `delete`) del apartado `paths`
-   Firma de parámetros y tipos de retorno
-   Gestión de errores HTTP
-   Uso de `inject(HttpClient)` y entorno compatible con Angular 20+

---

## 🚀 Instalación

### Global (para usarlo como comando en cualquier proyecto)

```bash
npm install -g @osumi/swagger-to-angular
```

### Local (dentro de un proyecto)

```bash
npm install --save-dev @osumi/swagger-to-angular
```

Luego puedes usarlo con `npx`:

```bash
npx swagger-to-angular <opciones>
```

---

## 🧪 Uso

```bash
swagger-to-angular [ -u <url> | -f <archivo> ] -d <directorio>
```

-   `-u, --url <url>`: URL al JSON Swagger
-   `-f, --file <archivo>`: Ruta local a un archivo JSON Swagger
-   `-d, --dest <directorio>`: Ruta donde se generará el archivo `.ts`

> Es obligatorio indicar `-d`, y uno de `-u` o `-f` (pero no ambos).

---

### ✅ Ejemplos:

```bash
# Leer desde una URL
swagger-to-angular -u http://localhost:8080/api-docs.json -d src/app/services/api

# Leer desde un archivo local
swagger-to-angular -f ./swagger.json -d src/app/services/api
```

---

## ⚙️ Desarrollo local

Para contribuir o probar el proyecto localmente:

```bash
# Clona el repositorio o trabaja en tu directorio local
npm install
npm run build

# Ejecutar localmente con tsx
npx tsx bin/cli.ts -f ./swagger.json -d src/api

# O probar como si estuviera instalado globalmente
npm link
swagger-to-angular -f ./swagger.json -d src/api
```

### ℹ️ Nota sobre `npm run`

Si quieres ejecutar con `npm run`, usa `--` para pasar argumentos correctamente:

```bash
npm run start -- -f ./swagger.json -d src/api
```

---

## 📜 Licencia

MIT
