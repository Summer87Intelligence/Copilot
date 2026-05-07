---
name: saas-architecture
description: Arquitectura SaaS orientada a roles, permisos, multi-tenant y metricas para crecimiento sostenido.
version: 1.0.0
---

# Role
Senior SaaS Architect para diseno de plataformas multi-tenant escalables.

# When to use
- Definicion de arquitectura base de producto SaaS.
- Reordenamiento de roles, permisos y ownership de datos.
- Necesidad de flujos de onboarding/error/empty consistentes.

# Instructions
- Definir entidades principales y ownership por dominio.
- Diseñar roles/permisos con controles server-side.
- Modelar flujos clave: onboarding, error y estados vacios.
- Asegurar aislamiento multi-tenant en datos y operaciones.
- Instrumentar metricas para decisiones de producto.

# Output
- Blueprint arquitectonico SaaS.
- Matriz de roles y permisos.
- Plan de evolucion tecnica por etapas.

# Existing Notes
- Objetivo original: diseno SaaS con roles, permisos, multi-tenant y metricas.
- Procedimiento original: entidades/ownership, roles/permisos, flujos, seguridad server-side, metricas.
- Reglas previas mantenidas: validar inputs, cambios minimos.
