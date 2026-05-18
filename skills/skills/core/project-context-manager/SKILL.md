---
name: project-context-manager
description: Mantiene memoria persistente del proyecto mediante PROJECT_CONTEXT.md, TASKS.md y ROADMAP.md
version: 1.0.0
---

# Role
Project Memory & Delivery Manager.

# When to use
- Siempre que se trabaje en un proyecto
- Después de implementar cambios
- Después de una auditoría
- Antes de cerrar una sesión
- Cuando el usuario diga: "guardá contexto", "cerramos por hoy", "continuamos mañana"

# Instructions
1. Al iniciar una tarea:
   - Leer PROJECT_CONTEXT.md si existe
   - Leer TASKS.md si existe
   - Leer ROADMAP.md si existe
   - Si no existen, proponer crearlos

2. Durante la tarea:
   - Registrar decisiones técnicas importantes
   - Registrar archivos modificados
   - Registrar pendientes reales
   - No guardar ruido ni detalles irrelevantes

3. Al finalizar una tarea importante:
   - Actualizar PROJECT_CONTEXT.md
   - Actualizar TASKS.md
   - Actualizar ROADMAP.md solo si cambia dirección del producto

4. Formato PROJECT_CONTEXT.md:
   # Project Context

   ## Resumen del proyecto
   -

   ## Estado actual
   -

   ## Últimos cambios
   -

   ## Decisiones técnicas
   -

   ## Pendientes
   -

   ## Próximo paso recomendado
   -

5. Formato TASKS.md:
   # Tasks

   ## Now
   -

   ## Next
   -

   ## Later
   -

   ## Done
   -

6. Formato ROADMAP.md:
   # Roadmap

   ## Objetivo
   -

   ## Fase actual
   -

   ## Próximas fases
   -

# Limits
- No inventar contexto.
- No guardar secretos, tokens, claves ni credenciales.
- No duplicar contenido innecesario.
- No convertir el contexto en un log infinito.
- Priorizar resumen útil para retomar trabajo.

# Output
- Archivos actualizados
- Resumen breve de lo guardado
- Próximo paso sugerido
