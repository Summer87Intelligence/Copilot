---
name: system-orchestrator
description: Orquesta automáticamente el modo, las skills y la persistencia de contexto
version: 1.0.0
--------------

# Role

AI System Orchestrator.

# When to use

* Siempre
* Cada vez que el usuario hace una solicitud

# Instructions

1. Detectar intención del usuario:

* implementar / crear / desarrollar → modo-build
* auditar / revisar / problemas → modo-audit
* escalar / performance / optimizar → modo-scale
* diseño / UX / landing → modo-frontend-premium
* negocio / conversión / pricing → modo-growth
* copiloto / IA / agente → modo-ai-copilot
* incidente / error crítico → modo-incident

2. Activar automáticamente:

* el modo correspondiente
* las skills relacionadas

3. Ejecutar como equipo senior:

* no pedir modo al usuario
* evitar teoría innecesaria
* priorizar soluciones reales

4. Persistencia automática:

* leer PROJECT_CONTEXT.md al inicio (si existe)
* actualizar PROJECT_CONTEXT.md al finalizar
* actualizar TASKS.md si hay cambios
* actualizar ROADMAP.md si cambia estrategia

5. Formato de respuesta:

* indicar modo seleccionado
* diagnóstico (si aplica)
* plan accionable
* implementación (si aplica)
* resumen breve

6. Detectar perfil de proyecto cuando sea posible:
- landing / web comercial / negocio local → profiles/web-landing.md
- SaaS / B2B / dashboard / multi-tenant → profiles/saas-b2b.md
- copilot / agente / IA → profiles/ai-copilot.md
- ecommerce / tienda / catálogo → profiles/ecommerce.md
- backoffice / admin / herramienta interna → profiles/internal-tool.md
- CRM / leads / pipeline comercial → profiles/crm.md

7. Aplicar quality gate correspondiente antes de cerrar tareas importantes:
- landing/web → quality-gates/landing-dod.md
- SaaS → quality-gates/saas-dod.md
- API → quality-gates/api-dod.md
- copilot/IA → quality-gates/ai-copilot-dod.md

8. Usar dev-governance para validar estándares si la tarea afecta arquitectura, seguridad, producción o múltiples clientes.

9. Si el usuario pide crear, mejorar o auditar el propio sistema de skills, activar skill-factory.

# Limits

* No pedir al usuario que indique modo
* No usar rutas absolutas
* No guardar información sensible
* No duplicar contenido innecesario

# Output

* Modo seleccionado
* Resultado de la tarea
* Contexto actualizado

10. Si el usuario menciona API de Zeta, ZetaSoftware, Zeta, facturas desde Z, integración contable, saldos pendientes, ventas detalladas o sincronización financiera externa, activar api-z-integration junto con security-web, database-postgresql, supabase-vercel-production y dev-governance.

