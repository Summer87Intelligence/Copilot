# Skill Registry

Este archivo funciona como catálogo maestro de skills. Mantenerlo actualizado cuando se agreguen, eliminen o cambien skills.

## Estados
- Activa: se usa normalmente
- Experimental: se prueba en proyectos puntuales
- Deprecated: no usar en proyectos nuevos

## Prioridades
- Crítica: afecta el comportamiento global del sistema
- Alta: importante para producción
- Media: útil por contexto
- Baja: soporte o especialización puntual

## Core Skills

| Skill | Uso principal | Prioridad | Estado |
|---|---|---:|---|
| system-orchestrator | Detecta intención, selecciona modo y skills | Crítica | Activa |
| project-context-manager | Mantiene PROJECT_CONTEXT.md, TASKS.md y ROADMAP.md | Crítica | Activa |
| skill-factory | Diseña, crea y audita artefactos del sistema de skills | Alta | Activa |
| dev-observability | Logs, métricas, tracing, alertas | Alta | Activa |
| dev-performance | Optimización full-stack | Alta | Activa |
| security-web | Seguridad web SaaS | Alta | Activa |
| architecture-system-design | Diseño de sistemas escalables | Alta | Activa |
| architecture-multi-tenant | SaaS multi-tenant | Alta | Activa |
| database-postgresql | PostgreSQL, índices y queries | Alta | Activa |
| backend-realtime | Sistemas realtime | Media | Activa |
| api-z-integration | Integra ZetaSoftware respetando documentación oficial, seguridad, sync incremental e idempotencia | Alta | Activa |

## Product / Business Skills

| Skill | Uso principal | Prioridad | Estado |
|---|---|---:|---|
| product-saas-strategy | Estrategia SaaS | Alta | Activa |
| product-pricing | Pricing y monetización | Media | Activa |
| marketing-cro | Conversión y growth | Alta | Activa |

## Frontend / UX Skills

| Skill | Uso principal | Prioridad | Estado |
|---|---|---:|---|
| frontend-ui-ux | UX/UI orientado a conversión | Alta | Activa |
| frontend-motion | Motion y microinteracciones | Media | Activa |
| premium-frontend-motion | Motion premium | Media | Activa |

## AI Skills

| Skill | Uso principal | Prioridad | Estado |
|---|---|---:|---|
| ai-agent-design | Copilots y agentes inteligentes | Alta | Activa |
| ai-context-engineering | Contexto, memoria y control de alucinaciones | Alta | Activa |
| ai-copilot-systems | Sistemas de copilots | Alta | Activa |

## Integration Skills

| Skill | Uso principal | Prioridad | Estado |
|---|---|---:|---|
| integration-webhooks | Webhooks robustos | Alta | Activa |
| api-integrations-enterprise | Integraciones enterprise | Alta | Activa |

## Specialized Skills

| Skill | Uso principal | Prioridad | Estado |
|---|---|---:|---|
| financial-ai-products | Productos financieros con IA | Alta | Activa |
| supabase-vercel-production | Supabase + Vercel production-ready | Alta | Activa |
| web-analyzer-pro | Análisis web con fetch controlado | Media | Activa |
| web-production-engineering | Producción web | Alta | Activa |

## Reglas de mantenimiento

- Toda nueva skill debe registrarse acá.
- Toda skill crítica debe tener sección `# Limits`.
- Las skills core deben ser estables y reutilizables.
- Las skills experimentales deben vivir en external o external-disabled hasta validarse.

