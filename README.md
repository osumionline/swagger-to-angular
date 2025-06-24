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
npx swagger-to-angular <url> <directorio>
```

---

## 🧪 Uso

```bash
swagger-to-angular <url_del_swagger> <directorio_destino>
```

-   `url_del_swagger`: URL completa al archivo Swagger/OpenAPI (en formato JSON).
-   `directorio_destino`: Ruta relativa al proyecto donde se generará el archivo `.ts`.

---

### ✅ Ejemplo:

```bash
swagger-to-angular http://localhost:8080/api-docs.json src/app/services/api
```

Esto generará:

```
src/app/services/api/documentacion/documentacion.service.ts
```

---

## ⚙️ Desarrollo local

Para contribuir o probar el proyecto localmente:

```bash
# Clona el repositorio o trabaja en tu directorio local
npm install
npm run build

# Ejecutar localmente usando tsx
npx tsx bin/cli.ts http://localhost:8080/api-docs.json src/api

# O probar como si estuviera instalado globalmente
npm link
swagger-to-angular http://localhost:8080/api-docs.json src/api
```

---

## 📜 Licencia

MIT
