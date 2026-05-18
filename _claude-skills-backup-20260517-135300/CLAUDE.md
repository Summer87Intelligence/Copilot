## Activación por defecto

Este proyecto usa automáticamente:
- system-orchestrator
- project-context-manager
- skills/
- modes/

El usuario NO necesita indicar:
- "usar CLAUDE.md"
- "modo-build"
- "modo-audit"
- "guardar contexto"

Reglas:
- Detectar automáticamente la intención del usuario
- Seleccionar el modo adecuado
- Activar las skills correspondientes
- Ejecutar como equipo senior
- Mantener continuidad de contexto del proyecto

# Claude Skills Operating System

## Contexto
Sistema profesional de skills + modes para desarrollo full stack, SaaS, IA, APIs, Supabase, Vercel, marketing y producto.

## Reglas globales
- Responder como equipo senior
- Priorizar produccion, seguridad, performance y mantenibilidad
- Evitar teoria innecesaria
- Dar outputs accionables
- Pensar en proyectos con multiples clientes
- No proponer cambios destructivos sin avisar

## Modos operativos
- modo-build
- modo-audit
- modo-scale
- modo-ai-copilot
- modo-frontend-premium
- modo-growth

## Flujo de respuesta
1. Detectar contexto
2. Seleccionar modo
3. Activar skills relacionadas
4. Responder con plan, codigo o checklist segun corresponda
5. Senalar riesgos relevantes

## Prioridades tecnicas
1. Seguridad
2. Performance
3. Escalabilidad
4. Mantenibilidad
5. UX
6. Conversion

## Legacy Notes
- Version anterior consolidaba dos bloques: "Claude System Context" y "Claude System".
- Se mantenia enfoque en respuestas tecnicas, contexto SaaS multi-tenant y prioridad en seguridad/performance.

## Persistencia automática de contexto

Usar siempre la skill project-context-manager.

Reglas:
- Al iniciar una sesión, leer PROJECT_CONTEXT.md, TASKS.md y ROADMAP.md si existen.
- Al finalizar una tarea importante, actualizar PROJECT_CONTEXT.md.
- Si hubo cambios de planificación, actualizar TASKS.md.
- Si cambió dirección estratégica, actualizar ROADMAP.md.
- No guardar secretos ni información sensible.
- Mantener contexto breve, útil y accionable.

## Orquestación automática

El sistema utiliza la skill system-orchestrator como capa principal.

Reglas:

* Detectar automáticamente la intención del usuario
* Seleccionar el modo adecuado sin intervención del usuario
* Activar las skills correspondientes
* Ejecutar como equipo senior
* Actualizar PROJECT_CONTEXT.md automáticamente al finalizar cada tarea importante

El usuario NO debe indicar modo manualmente.

## Reglas de paths

* Nunca usar rutas absolutas (C:, D:, E:)
* Usar siempre rutas relativas al proyecto actual

## Hooks de sesión

Al iniciar una sesión:
- Leer PROJECT_CONTEXT.md si existe
- Leer TASKS.md si existe
- Leer ROADMAP.md si existe
- Resumir brevemente el estado actual
- Proponer el siguiente paso útil

Durante cada tarea:
- Usar system-orchestrator para detectar intención y modo
- Usar las skills relevantes sin pedirle al usuario que las indique
- No explicar el sistema interno salvo que el usuario pregunte

Al finalizar cada tarea importante:
- Actualizar PROJECT_CONTEXT.md
- Actualizar TASKS.md si cambió el estado
- Actualizar ROADMAP.md solo si cambió la dirección estratégica
- Mantener el contexto breve, accionable y sin ruido

Reglas:
- No guardar secretos, claves, tokens ni credenciales
- No duplicar contenido innecesario
- No crear logs infinitos
- Priorizar continuidad real del proyecto

## Enterprise AI Operating System

Este sistema no solo usa skills. Opera con:

- Skill Registry
- Project Profiles
- Quality Gates
- ADRs
- Evals
- Governance
- Incident Mode

Reglas:

- Detectar perfil del proyecto cuando sea posible
- Aplicar quality gates antes de cerrar tareas importantes
- Usar dev-governance para features críticas
- Crear ADRs cuando haya decisiones técnicas relevantes
- Evaluar respuestas importantes contra EVALS.md
- Mantener PROJECT_CONTEXT.md, TASKS.md y ROADMAP.md actualizados

## Quality Flow

Toda implementación importante debe pasar por:

1. Build
2. Self-audit
3. Fix de problemas críticos
4. Quality gate aplicable
5. Actualización de contexto

No considerar una tarea importante como terminada si no fue auditada.

## Skill System Development

Cuando el usuario quiera evolucionar este sistema:
- usar skill-factory
- decidir si corresponde skill, mode, profile, quality gate, prompt pack, starter o template
- evitar duplicados
- mantener SKILL_REGISTRY.md actualizado
- validar con auditoría

## Vendor API Documentation

Para integraciones con APIs externas:

usar documentación ubicada en docs/vendors/
no inventar endpoints, campos ni protocolos
si falta documentación, declararlo como bloqueo o incertidumbre
separar cliente API, normalización, persistencia y lógica de negocio
proteger credenciales server-side
aplicar idempotencia y logs en sincronizaciones

Para ZetaSoftware:

usar siempre la skill api-z-integration
revisar docs/vendors/z/ antes de implementar
respetar query-guidelines.md
no consultar Zeta en vivo para cada request de usuario
diseñar base local + sincronización incremental

## Zeta Integration Governance

### Source of Truth obligatoria

Antes de cualquier implementación, modificación o diagnóstico relacionado con Zeta, Claude DEBE leer:

- docs/vendors/z/          — contratos, modelos, estrategia, limitaciones conocidas
- docs/vendors/z/KNOWN-DIVERGENCES.md  — divergencias reales validadas del tenant
- docs/vendors/z/INTEGRATION-CHECKLIST.md — checklist previa obligatoria
- docs/zeta/               — documentación oficial descargada de ZetaSoftware

Estas carpetas son "Vendor Integration Source of Truth".
No son opcionales. No son sugerencias.

### Prohibido sin documentación

- Inventar endpoints Zeta
- Asumir payloads o shapes sin validación
- Hardcodear campos no documentados
- Inferir estructuras JSON sin compararlas contra payload real
- Marcar como completo si hay divergencias sin documentar

### Workflow obligatorio para toda integración Zeta

1. Leer docs/vendors/z/ y docs/zeta/ relevantes
2. Comparar contra payload real observado (logs con kind:*_shape_detected)
3. Detectar y documentar divergencias en KNOWN-DIVERGENCES.md
4. Adaptar parser de forma segura y compatible con shapes anteriores
5. Verificar con npx tsc --noEmit

### Estado BLOCKED

Si la documentación falta o el payload real no se pudo observar:
- Declarar BLOCKED explícitamente
- No inventar ni asumir
- Proponer plan para obtener el dato real
