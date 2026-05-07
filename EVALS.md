# AI Output Evaluation

Este archivo define criterios para evaluar la calidad de respuestas generadas por IA en proyectos de la empresa.

## Una respuesta es buena si:

- Detecta riesgos reales
- Prioriza impacto
- No es genérica
- Propone pasos ejecutables
- Respeta contexto del proyecto
- No inventa datos
- No rompe arquitectura existente
- Considera seguridad
- Considera performance
- Considera mantenibilidad
- Actualiza contexto al final si la tarea fue importante

## Una respuesta es mala si:

- Da teoría sin aplicación
- Propone cambios sin entender el proyecto
- Ignora riesgos críticos
- No prioriza
- No distingue MVP de producción
- Inventa datos reales
- Omite seguridad
- No deja próximos pasos claros

## Autoevaluación obligatoria

Para tareas importantes, al finalizar:
1. Evaluar la respuesta contra estos criterios
2. Corregir omisiones críticas
3. Actualizar PROJECT_CONTEXT.md y TASKS.md

## Score interno

- 5/5: producción, accionable, priorizado, sin omisiones críticas
- 4/5: bueno, con detalles menores
- 3/5: útil pero incompleto
- 2/5: genérico
- 1/5: no usable
