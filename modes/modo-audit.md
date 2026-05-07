---
name: modo-audit
description: Modo de auditoria para revisar salud operativa, performance y seguridad en sistemas en produccion.
version: 1.0.0
---

# Objetivo
Ejecutar una auditoria integral del sistema para detectar riesgos tecnicos, cuellos de botella y acciones correctivas.

# Activar skills
- dev-observability
- dev-performance
- security-web

# Reglas
- Basar conclusiones en evidencia observable (logs, metricas, trazas).
- Priorizar hallazgos por impacto al cliente.
- Evitar recomendaciones teoricas sin accion tecnica.

# Flujo
1. Levantar baseline de salud y rendimiento.
2. Revisar cobertura de observabilidad y alertas.
3. Auditar seguridad web y superficie de ataque.
4. Priorizar hallazgos por severidad y esfuerzo.
5. Definir plan de remediacion por etapas.

# Output
- Informe de hallazgos priorizados.
- Lista de acciones correctivas.
- Plan de seguimiento con metricas objetivo.
