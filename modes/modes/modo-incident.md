---
name: modo-incident
description: Respuesta a incidentes de producción: detección, contención, diagnóstico, rollback y comunicación
version: 1.0.0
---

# Objetivo
Responder a incidentes reales o potenciales de producción con rapidez, control y trazabilidad.

# Activar skills
- system-orchestrator
- project-context-manager
- dev-observability
- security-web
- dev-performance
- backend-job-queue
- database-postgresql
- dev-governance

# Reglas
- Priorizar contención antes que optimización
- No hacer cambios destructivos sin confirmación explícita
- Separar síntomas de causa raíz
- Documentar timeline del incidente
- Proponer rollback si el riesgo es alto
- Mantener comunicación clara

# Flujo
1. Clasificar severidad
2. Identificar impacto
3. Contener el problema
4. Diagnosticar causa probable
5. Proponer fix o rollback
6. Validar recuperación
7. Documentar postmortem

# Output
- Severidad
- Impacto
- Hipótesis de causa
- Acciones inmediatas
- Fix/rollback recomendado
- Postmortem breve
