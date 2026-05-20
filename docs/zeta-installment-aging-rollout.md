# Zeta Installment Aging — Rollout Plan

## Context

The current production aging engine uses per-invoice `due_date` or `issue_date+30` to classify
debt as current/overdue (legacy mode). ZETA-08 introduces a per-installment aging engine that
reads `cuota_vencimiento` from `proto_invoice_installments`, enabling accurate overdue buckets
for invoices with mixed-maturity cuotas.

Shadow mode (`AGING_MODE=installment_shadow`) runs both engines in parallel and exposes a
`diagnostics.aging_comparative` field for validation without affecting any visible card, alert,
or score.

---

## GO Criteria

All of the following must be true before activating installment aging as default:

| Criterion | Target | How to check |
|---|---|---|
| `coveragePct` | ≥ 95% | `audit-installment-aging-coverage.mjs` |
| `orphanCount` | = 0 | `audit-installment-aging-coverage.mjs` |
| `balanceMismatchCount` | = 0 | `audit-installment-aging-coverage.mjs` |
| `balance_overwrite_detected.affectedCount` (health) | = 0 | `GET /api/cron/zeta-financial-health?debug=1` |
| Stable sync cycles | ≥ 2 consecutive saldos runs without new divergences | Monitor logs for `zero_pass_blocked` / `orphan_autoclose_blocked` |
| Excel/DB audit | All rows OK, gap = 0 | `audit-excel-pending-vs-db.mjs` |
| `switch_readiness.ready` | true | `GET /api/copilot/financial-reconciliation?aging_mode=installment_shadow` |
| `switch_readiness.confidence` | ≥ 80 | Same |

---

## NO-GO Criteria (blockers)

Any of the following blocks the switch:

- `orphanCount > 0` — installments without `invoice_id` prevent accurate aging
- `coveragePct < 95%` — too many invoices without real `due_date` (`zeta_cuotas_v1`)
- `balanceMismatchCount > 0` — Σ cuota_saldo ≠ balance_amount on any active invoice
- `balance_overwrite_detected.affectedCount > 0` — historical divergences not yet corrected
- Hidden overdue delta > 5% of total pending — `recommendation = "monitor"` in comparative
- Any `blockers[]` entry in `switch_readiness`

---

## Rollback

Rollback is a one-line env change:

```
AGING_MODE=legacy
```

This reverts all aging logic to the original per-invoice date engine. No data migration needed.
The `diagnostics.aging_comparative` and `diagnostics.aging_observation` fields disappear from
the API response but no DB data changes.

---

## Rollout Phases

### Phase 0 — Shadow (current state)
- `AGING_MODE` not set (defaults to `legacy`)
- Shadow mode accessible via `?aging_mode=installment_shadow` query param
- All aging cards, alerts, and scores unaffected
- `diagnostics.aging_comparative` and `diagnostics.aging_observation` available for manual inspection

**Status:** Ready to deploy once stash@{0} is committed.

### Phase 1 — Admin panel (optional, low-risk)
- Add collapsible "Aging por cuotas — diagnóstico" panel in Cartera, visible only to admin/dev
- Shows: `coveragePct`, `orphanCount`, `balanceMismatchCount`, `switch_readiness`, `hidden_overdue_summary`, `top_underestimated_clients`
- Controlled by feature flag or role check — no impact on regular users
- **Trigger:** After Phase 0 runs stably for 1 week

### Phase 2 — Workspace flag
- Per-workspace opt-in: `workspace_settings.aging_mode = "installment_shadow"`
- Expose shadow diagnostics in main UI for opted-in workspaces
- Monitor `switch_readiness.confidence` trend
- **Trigger:** Phase 1 + all GO criteria met

### Phase 3 — Default switch
- `AGING_MODE=installment` becomes the default in production
- Legacy aging kept as fallback via env var
- Monitor: no regression in overdue totals, no new health alerts
- **Trigger:** Phase 2 + 2 stable cycles + product approval

---

## Current State (2026-05-20)

| Metric | Value |
|---|---|
| Guard anti-auto-close | Active (17f3d55) |
| Installment coverage | 100% |
| Orphan count | 0 |
| Historical balance divergences | 16 (pre-fix, pending backfill) |
| Shadow mode WIP | In stash@{0}, not yet committed |
| Switch readiness | Blocked — historical divergences not backfilled |

---

## Files

| File | Purpose |
|---|---|
| `lib/copilot-installment-aging.ts` | Core per-cuota aging engine |
| `lib/copilot-installment-aging-delta.ts` | Comparative diagnostics (installment vs legacy) |
| `lib/copilot-installment-aging-observation.ts` | Observation layer: top underestimated clients, switch readiness |
| `lib/copilot-installment-coverage.ts` | Coverage check: orphans, mismatch, min-date trap |
| `app/api/copilot/financial-reconciliation/route.ts` | Shadow wiring via `?aging_mode=` |
| `scripts/audit-installment-aging-coverage.mjs` | Coverage audit script |
| `scripts/audit-installment-balance-divergence.mjs` | Divergence audit script |
| `scripts/backfill-invoice-balance-from-installments.mjs` | Historical backfill (16 invoices) |
