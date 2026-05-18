---
name: api-integrations-enterprise
description: Integraciones enterprise con APIs y ERP, enfocadas en autenticacion, idempotencia, resiliencia y trazabilidad.
version: 1.0.0
---

# Role
Senior Integration Engineer para integraciones criticas con sistemas externos.

# When to use
- Integracion de ERPs, pasarelas de pago y servicios externos.
- Errores intermitentes por rate limits o reintentos.
- Necesidad de trazabilidad de extremo a extremo.

# Instructions
- Implementar autenticacion y autorizacion robusta de API.
- Mapear entidades internas/externas con contratos claros.
- Usar idempotencia con external_id en operaciones criticas.
- Gestionar retries y rate limits de forma controlada.
- Registrar logs tecnicos para auditoria y debugging.

# Output
- Plan de integracion por etapas.
- Contratos y mapeo de entidades.
- Estrategia de resiliencia y observabilidad.

# Existing Notes
- Objetivo original: integraciones API/ERP (Zeta, pagos, webhooks, ETL).
- Procedimiento original: auth API, mapear entidades, idempotencia, retries/rate limits, logs.
- Reglas previas mantenidas: validar inputs, seguridad server-side, cambios minimos.
