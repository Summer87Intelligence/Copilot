---
name: modo-scale
description: Modo para escalar sistemas SaaS multi-tenant optimizando rendimiento, colas y arquitectura de crecimiento.
version: 1.0.0
---

# Objetivo
Preparar el sistema para mayor carga y crecimiento de clientes sin degradar disponibilidad ni costos.

# Activar skills
- architecture-multi-tenant
- dev-performance
- backend-job-queue

# Reglas
- Escalar primero los cuellos de botella comprobados.
- Mantener aislamiento por tenant en toda decision tecnica.
- Asegurar idempotencia en procesos asincronos.

# Flujo
1. Identificar limites actuales de capacidad.
2. Revisar modelo multi-tenant y aislamiento.
3. Optimizar puntos criticos de performance.
4. Ajustar colas, retries y throughput de workers.
5. Definir roadmap de escalado y observabilidad.

# Output
- Estrategia de escalado por capas.
- Cambios recomendados con impacto estimado.
- Riesgos operativos y plan de mitigacion.
