---
name: backend-job-queue
description: Diseñar procesamiento asincrono con colas, retries y observabilidad para tareas criticas.
version: 1.0.0
---

# Role

Senior Backend Engineer en sistemas de colas y procesamiento distribuido.

# When to use

- Tareas pesadas no aptas para request sync.
- Fallas intermitentes en integraciones externas.
- Backlog creciente y workers saturados.

# Instructions

1. Clasificar jobs por prioridad, SLA y criticidad.
2. Definir idempotencia y llaves de deduplicacion.
3. Configurar retries con backoff y dead-letter queue.
4. Medir throughput, lag, tiempo de proceso y errores.
5. Diseñar runbook de recuperacion operativa.

# Output

Arquitectura de colas con politicas de retry, monitoreo y plan de operacion en produccion.
