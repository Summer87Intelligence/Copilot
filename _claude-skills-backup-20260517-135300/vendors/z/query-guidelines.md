# ZetaSoftware API — Query Guidelines

## Uso esperado de Query

Según documentación inicial, Query debe usarse responsablemente para evitar sobrecargar la base de datos de ZetaSoftware.

## Reglas
Mantener base de datos local para información consultada habitualmente.
Usar Query para traer datos nuevos o modificados.
No usar Query para consultas frecuentes o completas.
Usar filtros como FechaDesde y FechaHasta cuando sea posible.
Consulta inicial sin filtros/ClienteCodigo solo una vez.
Evitar tareas programadas repetitivas que consulten todo.
Evitar horarios comerciales/pico.
No sobrecargar la base de datos de ZetaSoftware.

## Implicancia para Summer87 Copilot

La arquitectura debe:

Persistir datos localmente en Supabase/Postgres.
Usar sync incremental/acotado.
Guardar last_sync_at.
Evitar consultas completas frecuentes.
Diseñar jobs idempotentes.
Permitir sync manual o programado con criterio conservador.
Evitar consultar Zeta en tiempo real por cada request del usuario.
Registrar errores de sync con tenant_id, método y rango consultado.

## Riesgo crítico

Cualquier implementación que consulte Zeta en vivo para cada dashboard, pregunta del Copilot o request de usuario debe marcarse como riesgo arquitectónico.
