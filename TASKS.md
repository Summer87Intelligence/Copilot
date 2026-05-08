# Tasks

## Now
- (vacío) — etapa Recibos Zeta enero–mayo 2026 cerrada el 2026-05-07.

## Next
- Re-sync seguro de **abril 2026 — 62 facturas faltantes** con `mapCopilotCustomerVoucherToProtoInvoiceInput` ya endurecido (rechaza fechas inválidas en vez de fallback `new Date()`).
- Confirmar con queries §A.2 / §B.3 / §E.1 de `temp-audits/audit-abril-2026-queries.sql` cuántas de las 62 traen `fecha_emision` no parseable y cuáles se persistieron con fecha del re-sync anterior.
- Documentar **`NOTE-001`** (filtro de borradores CFE en reconciliador Excel: `Numero <= 0 OR Emitida = "N"`) en `docs/vendors/z/KNOWN-DIVERGENCES.md`.

## Later
- **UI Recibos refinements** (no bloqueante; pipeline ya funcional):
  - Ordenar por `receipt_date` DESC en la grilla (hoy ordena por `created_at` DESC, con `receipt_date` como tie-breaker).
  - Mostrar `currency_code` (USD / UYU) junto al importe, alineado al patrón de la columna de facturas.
  - Mostrar nombre del cliente: lookup `company_id → proto_companies.name` o, cuando `company_id IS NULL`, fallback a `notes → zeta_collection_receipt_v1.raw_payload.ClienteNombre`.
- **Linking factura↔recibo** (opcional): hoy los recibos se persisten sin `invoice_id`. Si se decide vincular, definir heurística confiable o reglas explícitas (ej.: match por `Serie+Numero`) antes de tocar `proto_receipts.invoice_id` y los balances.
- **Automatizar sync mensual de recibos**: cron diario/mensual que invoque `POST /api/zeta/sync-collection-receipts` con el mes corriente y el anterior, con retención de logs.
- Evaluar cierre de período en facturas: una vez resuelto re-sync abril, revisar si conviene ampliar el alcance reconciliador a mayo–junio.

## Done
- 2026-05-08 — **Salud financiera como centro de decisiones**: nuevo motor `lib/copilot-financial-priority-engine.ts`, componentes `FinancialPriorityAlerts`, `FinancialActionPriorities`, `FinancialRiskSummary` y dashboard reordenado para empezar por atención/acción/riesgo antes de KPIs. Priority score determinístico 0-100 y semáforos auditables.
- 2026-05-08 — **Salud financiera en Hoy**: dashboard ejecutivo movido del sidebar de cliente a `app/copilot/page.tsx` (home), entre "Liquidez y cobertura" y "Próximos vencimientos". Sidebar revertido al alcance client-specific. Datos reales del tenant validados (USD efectividad 93.61%, UYU 95.75%).
- 2026-05-08 — **Executive Financial Dashboard Fase 1**: helper puro `lib/copilot-financial-dashboard-metrics.ts`, tests dedicados, UI `components/copilot/copilot-financial-dashboard.tsx`. Métricas reales por moneda: facturado, cobrado, pendiente, efectividad, counts, top deudores y aging. Reutiliza reglas de deuda actual; no usa recibos ni linking inferido.
- 2026-05-07 — `temp-audits/` creada, ignorada en `.gitignore` (excepto `README.md`); convención de archivos temporales documentada.
- 2026-05-07 — Auditoría reconciliación enero–abril 2026 (read-only): identificada hipótesis H1 (`issue_date` fallback `new Date()`); confirmada fila Excel `Prestis Nº=0` como borrador CFE válidamente excluido del sync.
- 2026-05-07 — **Fix H1**: `mapCopilotCustomerVoucherToProtoInvoiceInput` y pipeline customer-vouchers rechazan fechas no parseables sin caer a fecha actual; tests verdes.
- 2026-05-07 — **Migración `supabase/zeta-05-01-proto-receipts-zeta-sync.sql`** ejecutada (agrega `currency_code`, hace `company_id` nullable, mantiene RLS por `workspace_company_id`).
- 2026-05-07 — **Pipeline Recibos Zeta — Fase 1 y 2** implementadas: tipos, mapper (currency normalizada, prioridad de `payment_method`, rechazo de anulaciones / fechas inválidas / importes ≤ 0), pipeline con métricas extra y `allowUnlinkedCompany`, ruta API `/api/zeta/sync-collection-receipts`. `tsc --noEmit` y `vitest` 144/144 verdes.
- 2026-05-07 — **DIV-001 (request shape)** corregido: `buildQueryInData` omite filtros opcionales vacíos, `Mes` sin `padStart`; log estructurado `kind: "zeta_receipts_payload_shape"`; tests de regresión (6 casos). HTTP 400 resuelto.
- 2026-05-07 — **DIV-002 (response shape)** corregido: contract acepta `QueryComprobantesOut.Response[]` (Postman / real tenant), `QueryOut.Response[]` (legacy), root array y fallback defensivo. `summarizeZetaCollectionReceiptsResponseShape` + log `kind: "zeta_receipts_raw_response"`. Tests (16 casos). Documentado en `KNOWN-DIVERGENCES.md`.
- 2026-05-07 — **Sync recibos enero–mayo 2026** ejecutada: 58 + 55 + 48 + 67 + 6 = **234 recibos** persistidos, 0 errores, 0 unlinked, 0 invalid, 0 negative.
- 2026-05-07 — **Reconciliación Recibos vs Excel maestro `RecibosCobranzaWWExport-67.xlsx`**: paridad 100 % (234 = 234, monedas exactas USD=111 / UYU=123, distribución mensual idéntica, 0 diffs reales). Outputs: `temp-audits/receipts-reconciliation-2026.md` y `temp-audits/receipts-reconciliation-diff.csv` (vacío, solo header). Script reusable: `scripts/audit-receipts-reconciliation-2026.ts`.
