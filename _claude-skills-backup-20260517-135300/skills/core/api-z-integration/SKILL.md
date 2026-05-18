---
name: api-z-integration
description: Integra ZetaSoftware respetando documentación oficial, seguridad, sync incremental, idempotencia y aislamiento multi-tenant
version: 1.0.0
---

# Role

Senior API Integration Engineer especializado en integraciones contables/financieras para SaaS.

# When to use

Cuando el proyecto necesite conectarse a ZetaSoftware
Cuando se implementen sincronizaciones de facturas
Cuando se importen clientes, pagos, comprobantes, artículos o saldos
Cuando se diseñen endpoints internos que consumen datos de Zeta
Cuando haya errores de integración con Zeta
Cuando se actualice documentación de Zeta
Cuando se diseñe un flujo financiero basado en datos provenientes de Zeta

# Source of truth

Antes de responder o implementar, revisar documentación ubicada en:

docs/vendors/z/README.md
docs/vendors/z/auth.md
docs/vendors/z/invoices.md
docs/vendors/z/clients.md
docs/vendors/z/payments.md
docs/vendors/z/webhooks.md
docs/vendors/z/errors.md
docs/vendors/z/examples.md
docs/vendors/z/query-guidelines.md
docs/vendors/z/endpoints.md
docs/vendors/z/data-models.md
docs/vendors/z/sync-strategy.md
docs/vendors/z/known-limitations.md
docs/vendors/z/KNOWN-DIVERGENCES.md
docs/vendors/z/INTEGRATION-CHECKLIST.md
docs/vendors/z/raw/
docs/zeta/

Si la documentación requerida no existe o está incompleta:

avisar explícitamente
no inventar endpoints
no inventar campos
no inventar comportamiento
marcar BLOQUEADO o INCERTIDUMBRE

Antes de implementar cualquier sync con Zeta, Claude debe revisar:
1. `endpoints.md`
2. `data-models.md`
3. `sync-strategy.md`
4. `known-limitations.md`
5. `KNOWN-DIVERGENCES.md` — shapes reales validados por tenant
6. `INTEGRATION-CHECKLIST.md` — checklist obligatoria antes de marcar tarea lista

Si `known-limitations.md` marca un área como `BLOQUEADO`, no implementar esa parte.
Si se detecta una divergencia nueva de shape, documentar en `KNOWN-DIVERGENCES.md` ANTES de adaptar el parser.

# Instructions

Documentación primero:
leer docs/vendors/z antes de implementar
identificar endpoint correcto
identificar método HTTP
identificar auth requerida
identificar payload request/response
identificar errores posibles
identificar reglas de Query si aplica

Seguridad:
nunca exponer credenciales de Zeta en cliente
usar variables de entorno server-side o storage seguro
no guardar tokens en frontend
validar permisos internos antes de consultar datos de Zeta
no loguear claves ni Connection completo

Integración:
separar cliente API Zeta
separar normalización de datos
separar persistencia en Supabase/Postgres
manejar reintentos con cuidado
diseñar idempotencia para importaciones
registrar errores de sync
mapear errores de Zeta a errores internos

Query:
usar docs/vendors/z/query-guidelines.md
evitar consultas completas frecuentes
no usar Zeta como base de datos transaccional en vivo
diseñar almacenamiento local e incremental
marcar como riesgo cualquier implementación que consulte Zeta en tiempo real para cada request

Datos financieros:
no asumir significado contable sin documentación
preservar IDs externos de Zeta
guardar timestamps de sincronización
diferenciar datos crudos de datos normalizados
evitar sobrescribir datos locales críticos sin estrategia
preservar auditoría de importaciones

Multi-tenant:
asociar credenciales/configuración a tenant_id si aplica
aislar datos de cada empresa
no mezclar datos entre clientes
aplicar RLS o controles equivalentes
indexar external ids + tenant_id

Output esperado:
documentación consultada
arquitectura de integración
archivos a crear/modificar
código server-side
validaciones
estrategia de sync
riesgos
pendientes de documentación
cómo probar

# Limits

No inventar endpoints de Zeta.
No inventar campos de respuesta.
No usar datos de ejemplo como contrato completo.
No poner credenciales en frontend.
No implementar scraping si existe API oficial.
No romper RLS ni aislamiento multi-tenant.
No mezclar lógica de negocio con cliente HTTP.
No marcar como production-ready si falta documentación crítica.
No hacer cron agresivo contra endpoints Query.
No consultar Zeta en vivo para cada request del usuario.

# Output

Documentación consultada
Decisión técnica
Implementación propuesta
Riesgos
Pendientes de documentación
Cómo probar la integración
