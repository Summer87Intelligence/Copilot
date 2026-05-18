# ZetaSoftware API Documentation

## Propósito

Este directorio contiene documentación operativa para integrar ZetaSoftware con proyectos Copilot/Summer87.

Debe usarse como fuente de verdad antes de implementar cualquier integración con Zeta.

## Fuentes oficiales usadas

### 1. ZetaSoftware Ayuda

URL:
https://zetasoftware.info/ayuda/

Referencia:
- sección APIs
- datos de conexión
- métodos de la API
- protocolos soportados SOAP/REST
- índice de APIs

### 2. PDF Postman — Uso de API REST en ZetaSoftware

Fuente esperada:
docs/vendors/z/raw/Postman_Ejemplo_de_consultas.pdf

Contiene ejemplos de:
- RESTFacturaClienteV4Agregar
- RESTFacturaClienteV4VentasDetalladas
- RESTQuerySaldoPendienteCliente
- RESTArticuloSave
- pautas de uso responsable de Query

### 3. Postman Collection — ZetaSoftware REST 10-2025

Fuente esperada:
docs/vendors/z/raw/ZetaSoftware_REST_10-2025.json

Contiene:
- endpoints REST
- headers
- payloads
- responses de ejemplo
- estructura Connection
- responses de error

## Regla estricta

Si algo no está documentado en esta carpeta:

- no inventar endpoint
- no inventar campo
- no asumir comportamiento
- marcar como BLOQUEADO o INCERTIDUMBRE
- pedir documentación oficial adicional

## Arquitectura recomendada

Toda integración con Zeta debe separar:

1. Cliente API Zeta
2. Validación de request/response
3. Normalización de datos
4. Persistencia local
5. Jobs/sync
6. Logs/observabilidad
7. Capa de dominio del Copilot

No mezclar cliente HTTP con lógica financiera del producto.

## Índice operativo

- `endpoints.md` — endpoints documentados y estado
- `data-models.md` — mapeos Zeta → modelo interno
- `sync-strategy.md` — estrategia segura de sincronización
- `known-limitations.md` — bloqueos y dudas críticas
