# Cron Reliability — Summer87 Copilot

## Pipelines activos

| Pipeline | Frecuencia | Tabla de tracking | Staleness umbral |
|----------|-----------|-------------------|-----------------|
| `zeta-sync-saldos` | cada 3h | `zeta_pipeline_runs` | 3h (warn) / 24h (critical) |
| `zeta-sync-vouchers` | cada 6h | `zeta_pipeline_runs` | 6h (warn) / 24h (critical) |
| `zeta-sync-cuotas` | cada 6h | `zeta_pipeline_runs` | 6h (warn) / 24h (critical) |
| `zeta-daily-snapshot` | 02:00 UTC | `zeta_pipeline_runs` | 26h (critical) |
| `zeta-completeness-audit` | 03:30 UTC | `zeta_pipeline_runs` | 26h (critical) |
| `zeta-integrity-check` | 04:00 UTC | `zeta_pipeline_runs` | 26h (critical) |

## Cómo verificar si un pipeline está stale

**Query directa en Supabase SQL Editor:**

```sql
-- Última corrida exitosa de cada pipeline
SELECT
  pipeline_name,
  MAX(finished_at) AS last_success_at,
  EXTRACT(EPOCH FROM (now() - MAX(finished_at))) / 3600 AS age_hours
FROM zeta_pipeline_runs
WHERE status = 'succeeded'
GROUP BY pipeline_name
ORDER BY last_success_at DESC;
```

**Stale > 6h:**

```sql
SELECT pipeline_name, last_success_at, age_hours
FROM (
  SELECT
    pipeline_name,
    MAX(finished_at) AS last_success_at,
    EXTRACT(EPOCH FROM (now() - MAX(finished_at))) / 3600 AS age_hours
  FROM zeta_pipeline_runs
  WHERE status = 'succeeded'
  GROUP BY pipeline_name
) t
WHERE age_hours > 6;
```

## Sistema de alertas

Las alertas de staleness se disparan automáticamente al inicio de cada cron run si la última
corrida exitosa supera el umbral (`alertIfStale` en `lib/cron/cron-stale-check.ts`).

**Proveedores habilitados por env vars:**

| Proveedor | Env var | Descripción |
|-----------|---------|-------------|
| Slack | `SLACK_WEBHOOK_URL` | Incoming Webhook |
| Discord | `DISCORD_WEBHOOK_URL` | Embed de alerta |
| Email | `ALERT_EMAIL_ENDPOINT` | POST a endpoint o Resend |
| Webhook | `CRON_ALERT_WEBHOOK_URL` | POST JSON genérico |

Si ningún proveedor está configurado, las alertas se logean a `console.info` como
`no_providers_enabled` y no bloquean el cron.

## Comportamiento ante fallos

1. **Staleness check falla** → log `staleness_check_error`, cron continúa.
2. **Alerting falla** → error silenciado, cron continúa.
3. **Pipeline run log falla** → log `pipeline_run_create_error`, cron continúa.
4. **Workspace page falla** → log `workspace_page_error`, cron retorna HTTP 500 (Vercel reintenta).
5. **Un workspace falla** → log por workspace, el resto continúa procesándose.
6. **Zeta API down** → retry 3x backoff exponencial por pipeline, errores sumados a `total_failed`.

## Anti-overlap

Cada cron usa `findActivePipelineRun` para detectar si hay un run activo reciente.
Si hay overlap, la segunda invocación retorna `skipped: true, reason: "already_running"`.

Los runs colgados (sin heartbeat por >45min) son expirados por `expireStaleFleetPipelineRuns`
al inicio de cada cron run.

## Agregar un nuevo cron

1. Crear route en `app/api/cron/<nombre>/route.ts` siguiendo el patrón de `zeta-sync-saldos`.
2. Registrar en `vercel.json` con la expresión cron correspondiente.
3. Agregar el pipeline name en `ZETA_PIPELINE_NAMES` en `lib/data/zeta-pipeline-run-types.ts`.
4. Usar `alertIfStale` al inicio del handler si corresponde.

## Limitaciones conocidas

- Vercel Cron es best-effort: puede no dispararse si Vercel tiene un incidente.
  El staleness check detecta esto CUANDO el cron eventualmente se ejecuta, pero no antes.
  Para detección proactiva (el cron nunca se ejecuta), se requiere un servicio externo
  (UptimeRobot, Cronitor, etc.) que haga ping a la route del cron.
- El tenant actual (`Summer87`) tiene 183 clientes; el cap por workspace es 200.
  Si supera 200 clientes, ajustar `ZETA_SALDOS_CRON_MAX_CLIENTS_PER_WORKSPACE`.
