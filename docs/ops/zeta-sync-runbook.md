# Zeta Sync Runbook

Operational guide for diagnosing and recovering the Zeta ERP sync layer.

---

## Architecture overview

```
Zeta ERP ──→ Sync crons ──→ Supabase (proto_invoices, proto_receipts, …)
                                    ↑
                            Completeness audit (daily)
                            Integrity check (daily)
                            Resync worker (every 30 min)
```

Copilot is **read-only** with respect to Zeta. The local DB is a replica. Never write to Zeta. Never delete Copilot records manually — mark them inactive or trigger a resync.

---

## Cron schedule

| Cron | Schedule | Purpose |
|------|----------|---------|
| `zeta-sync-saldos` | every 3h | Balance updates per workspace |
| `zeta-sync-vouchers` | every 6h | Invoice fetch from Zeta |
| `zeta-sync-contacts` | 02:00 UTC daily | Contact sync |
| `zeta-sync-cuotas` | every 6h | Installment sync |
| `zeta-completeness-audit` | 03:30 UTC daily | Count comparison Zeta vs local |
| `zeta-integrity-check` | 04:00 UTC daily | Local data integrity checks |
| `zeta-resync-worker` | every 30 min | Process queued resync jobs |

---

## Health gate

Before any production deploy, run:

```
node scripts/zeta-production-readiness-check.mjs
```

Exits 0 = safe to deploy. Exits 1 = block deploy, fix FAIL items.

---

## Diagnosing a completeness audit alert

### Symptom: `severity=critical` on invoices

1. Check recent audit:
```sql
SELECT entity, severity, zeta_count, local_count, drift, drift_pct,
       metadata, audited_at
FROM zeta_completeness_audits
WHERE workspace_company_id = '<workspace_id>'
  AND entity = 'invoices'
ORDER BY audited_at DESC
LIMIT 5;
```

2. Check `metadata.zeta_skipped_count` — if non-zero, the classifier discarded rows (CFETipo=0 or recibo_text). This is NOT a data loss — it's expected behavior. `zeta_count` already excludes skipped rows.

3. If `drift` is negative (missing locally), check `missing_registro_ids`:
```sql
SELECT missing_registro_ids
FROM zeta_completeness_audits
WHERE workspace_company_id = '<workspace_id>'
  AND entity = 'invoices'
ORDER BY audited_at DESC
LIMIT 1;
```

4. Verify the invoices are actually in Zeta but not in Copilot:
```sql
SELECT id, invoice_number, created_at
FROM proto_invoices
WHERE workspace_company_id = '<workspace_id>'
  AND invoice_number LIKE 'ZETA:%'
  AND is_active = true
ORDER BY created_at DESC
LIMIT 20;
```

5. If invoices are genuinely missing, queue a resync:
```
POST /api/zeta/resync
{ "entity": "invoices", "mes": <M>, "anio": <YYYY> }
Authorization: Bearer <user_session>
```

---

## Diagnosing a resync job stuck in running

### Symptom: `zeta_resync_jobs.status = 'running'` for >30 min

The resync worker auto-recovers stale jobs at the start of each run (marks them `failed` with `stale_timeout` reason). This happens every 30 min automatically.

To manually force recovery:
```sql
UPDATE zeta_resync_jobs
SET status = 'failed',
    error_summary = 'manual_admin_recovery',
    completed_at = now()
WHERE status = 'running'
  AND started_at < now() - interval '30 minutes';
```

Then re-queue the job via the API or create a new entry:
```sql
INSERT INTO zeta_resync_jobs (workspace_company_id, entity, scope, triggered_by, status)
VALUES ('<workspace_id>', 'invoices', 'period:2026-05', 'manual', 'pending');
```

---

## Diagnosing integrity violations

### View all open critical violations:
```sql
SELECT check_name, entity, record_key, description, detected_at
FROM zeta_integrity_violations
WHERE workspace_company_id = '<workspace_id>'
  AND status = 'open'
  AND severity = 'critical'
ORDER BY detected_at DESC;
```

### Common violations and remediation:

| Check | Cause | Action |
|-------|-------|--------|
| `invoice_balance_exceeds_total` | Saldos cron set wrong balance | Trigger resync for that invoice's month |
| `invoice_duplicate_number` | Race condition in upsert | Check if both records are active; deactivate the stale one if confirmed |
| `invoice_null_balance_pending` | Saldos cron never ran for this client | Trigger `zeta-sync-saldos` manually for that workspace |
| `invoice_null_currency` | Enrichment failed | Re-run the voucher sync for that period |
| `invoice_invalid_issue_date` | Field mapping failure in Zeta payload | Check Zeta API response shape for that invoice |
| `receipt_invalid_date` | Field mapping failure | Check Zeta API response for `FechaRecibo` field |

### Resolve a violation after fixing:
```sql
UPDATE zeta_integrity_violations
SET status = 'resolved', resolved_at = now()
WHERE id = '<violation_id>';
```

---

## Resync jobs: manual trigger

### Queue an invoice resync for a specific month:
```
POST /api/zeta/resync
Content-Type: application/json
Authorization: Bearer <session>

{ "entity": "invoices", "mes": 5, "anio": 2026 }
```

### Queue a receipt resync:
```
{ "entity": "receipts", "mes": 5, "anio": 2026 }
```

### Queue installments or saldos (no period required — workspace-wide):
```
{ "entity": "installments" }
{ "entity": "saldos" }
```

The job enters `status=pending` and runs within 30 min when the resync worker cron fires.

---

## Checking pipeline run health

### View recent pipeline runs:
```sql
SELECT pipeline_name, status, started_at, finished_at, duration_ms,
       rows_processed, rows_updated, metadata
FROM zeta_pipeline_runs
ORDER BY started_at DESC
LIMIT 20;
```

### Identify stuck runs:
```sql
SELECT id, pipeline_name, started_at
FROM zeta_pipeline_runs
WHERE status = 'running'
  AND started_at < now() - interval '45 minutes';
```

Stuck runs can be force-closed:
```sql
UPDATE zeta_pipeline_runs
SET status = 'failed', finished_at = now()
WHERE id = '<run_id>';
```

---

## What NOT to do

- **Do not delete records** from `proto_invoices`, `proto_receipts`, or `proto_invoice_installments`. Set `is_active = false` if you must hide a record.
- **Do not mutate Zeta** — Copilot has no write access to Zeta ERP by design.
- **Do not run sync crons manually in production concurrently** — the anti-overlap guard uses `zeta_pipeline_runs`. If you force a second instance, you may get duplicate pipeline runs.
- **Do not skip the CRON_SECRET check** when hitting cron endpoints — all cron routes require `Authorization: Bearer $CRON_SECRET`.
- **Do not interpret a non-zero `zeta_skipped_count`** in the completeness audit metadata as data loss. It reflects the classifier filtering CFETipo=0 (non-DGI) and recibo_text rows, which is intentional.

---

## Key tables reference

| Table | Purpose |
|-------|---------|
| `zeta_completeness_audits` | Daily count comparison results |
| `zeta_sync_divergences` | Field-level differences between Zeta and local |
| `zeta_integrity_violations` | Local data integrity issues |
| `zeta_resync_jobs` | Queued and completed resync operations |
| `zeta_pipeline_runs` | Execution log for all cron pipelines |

---

## Escalation

If the drift is > 20% and a resync does not resolve it within 2 hours, escalate to the backend team. Check Supabase logs for edge function errors, and Vercel logs for cron execution failures.
