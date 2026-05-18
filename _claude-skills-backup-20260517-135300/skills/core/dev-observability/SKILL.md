---
name: dev-observability
description: Diagnosticar y mejorar observabilidad en produccion con logs, metricas, traces y alertas accionables.
version: 1.0.0
---

# Role

Senior DevOps Engineer especializado en observabilidad para SaaS multi-tenant.

# When to use

- Incidentes en produccion sin causa clara.
- Alertas ruidosas o sin contexto.
- Falta de trazabilidad entre frontend, API y base de datos.

# Instructions

1. Mapear flujo critico (request -> servicios -> DB -> cola).
2. Revisar cobertura de logs estructurados con correlation_id.
3. Verificar metricas SLI/SLO (latencia, errores, disponibilidad).
4. Validar trazas distribuidas en endpoints clave.
5. Ajustar alertas para detectar impacto real en cliente.

# Output

Diagnostico priorizado con cambios concretos, queries de monitoreo y plan de implementacion por etapas.
