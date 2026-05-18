# ZetaSoftware API — Errors

## Error 400 — Bad Request

El PDF indica que puede deberse a problemas en el body.

Verificar:

JSON correctamente estructurado
campos obligatorios presentes
formato esperado
eliminar campos no obligatorios sin información
en métodos específicos, evitar arrays incorrectos

## Error 404 — Not Found

La colección Postman incluye responses 404 Not Found para varios endpoints.

## Patrón de error observado

En colección Postman se observan responses con:

{
  "Error": {
    "Code": "<string>",
    "Message": "<string>",
    "Detail": [
      {
        "Id": "<string>",
        "Tipo": "<string>",
        "Descripcion": "<string>"
      }
    ]
  }
}

## Reglas internas

Mapear errores de Zeta a errores internos.
Registrar método, tenant_id y external_id si aplica.
No loguear credenciales.

Distinguir:
error de autenticación
error de validación
error por body malformado
error por endpoint/baseUrl incorrecta
error de abuso de Query
error server-side

Retentar solo cuando sea seguro.
No retentar errores de validación sin cambiar payload.
