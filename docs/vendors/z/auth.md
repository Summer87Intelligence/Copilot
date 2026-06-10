# ZetaSoftware API — Auth

## Estado

Documentación inicial basada en PDF/Postman collection.

## Patrón observado

Las llamadas REST usan método POST y envían un objeto raíz específico por método, con un bloque `Connection`.

Ejemplo general observado:

```json
{
  "<MetodoIn>": {
    "Connection": {
      "DesarrolladorCodigo": "<string>",
      "DesarrolladorClave": "<string>",
      "EmpresaCodigo": "<string>",
      "EmpresaClave": "<string>",
      "UsuarioCodigo": "<long>",
      "UsuarioClave": "<string>",
      "RolCodigo": "<integer>"
    },
    "Data": {}
  }
}
```

Campos observados en Connection
DesarrolladorCodigo
DesarrolladorClave
EmpresaCodigo
EmpresaClave
UsuarioCodigo
UsuarioClave
RolCodigo

Variación observada

Algunos ejemplos del PDF usan Connection sin UsuarioCodigo/UsuarioClave y con RolCodigo: "1".

La colección Postman incluye UsuarioCodigo y UsuarioClave en múltiples métodos.

Reglas internas
Guardar credenciales solo server-side.
Nunca exponer Connection en frontend.
Asociar credenciales a tenant_id si el producto es multi-tenant.
No loguear claves.
No guardar secrets en PROJECT_CONTEXT.md, TASKS.md ni ROADMAP.md.
Usar variables de entorno server-side o tabla segura según arquitectura.
Rotar credenciales si hay sospecha de exposición.

## Auth HTTP Copilot (`/api/zeta/*`)

Matriz de guards (middleware + handlers): ver `docs/vendors/z/api-auth-matrix.md`.

Resumen:

- Diagnóstico → superadmin autenticado.
- Sync manual → `requireZetaCopilotAuth` (tenant desde sesión).
- Cron operador → `Bearer CRON_SECRET`.
- Acceso anónimo prohibido.

Bloqueos / dudas
Confirmar si UsuarioCodigo y UsuarioClave son obligatorios para todos los endpoints.
Confirmar lifecycle/rotación de claves.
Confirmar si existen scopes/permisos por endpoint.
Confirmar formato oficial exacto de baseUrl.
