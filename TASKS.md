# Tasks

## Now
- **Fix data workspace secundario (`5e4de8f3`)**: contacts devuelve 195 filas Zeta sin match en `proto_companies`. Verificar que los `Codigo` Zeta del segundo workspace estén cargados en `proto_companies.Codigo`.

## Next — Pipeline Health Dashboard UI

**Objetivo:** visualizar estado de los 3 pipelines Zeta automatizados en producción.

**Fuentes de datos (ya disponibles, no tocar):**
- `zeta_pipeline_runs` — tabla Supabase con una fila por corrida
- `lib/data/zeta-pipeline-health.ts` — `getAllPipelineHealth()` + `derivePipelineHealth()` (función pura)
- `lib/data/zeta-pipeline-run-repository.ts` — `getLatestRunPerPipeline()`, `getRecentPipelineRuns()`

**Mostrar por pipeline:**
- Estado: `healthy` / `degraded` / `stalled` / `unknown` (con color/icono)
- Última corrida: timestamp relativo + duración (`duration_ms`)
- Métricas: `rows_processed`, `rows_updated`, `rows_failed`
- `consecutive_failures` y `error_summary` cuando `status ≠ succeeded`
- `is_overdue` si superó el intervalo esperado (3h/6h/24h)

**Restricciones:**
- No modificar pipelines, cron routes, reconciliación ni `zeta_pipeline_runs` schema
- Solo lectura: API route GET que llame `getAllPipelineHealth()` + componente UI

## Later
- **UI Recibos refinements** (no bloqueante; pipeline ya funcional):
  - Ordenar por `receipt_date` DESC en la grilla (hoy ordena por `created_at` DESC, con `receipt_date` como tie-breaker).
  - Mostrar `currency_code` (USD / UYU) junto al importe, alineado al patrón de la columna de facturas.
  - Mostrar nombre del cliente: lookup `company_id → proto_companies.name` o, cuando `company_id IS NULL`, fallback a `notes → zeta_collection_receipt_v1.raw_payload.ClienteNombre`.
- **Linking factura↔recibo** (opcional): hoy los recibos se persisten sin `invoice_id`. Si se decide vincular, definir heurística confiable o reglas explícitas (ej.: match por `Serie+Numero`) antes de tocar `proto_receipts.invoice_id` y los balances.
- **Automatizar sync mensual de recibos**: cron diario/mensual que invoque `POST /api/zeta/sync-collection-receipts` con el mes corriente y el anterior, con retención de logs.
- Evaluar cierre de período en facturas: una vez resuelto re-sync abril, revisar si conviene ampliar el alcance reconciliador a mayo–junio.

## Done
- 2026-05-10 — **UX cleanup `/copilot/datos` · botón Sincronizar Zeta de Contactos**: eliminado botón manual + handler `handleContactSync` + estados `contactSyncState/Count/Error` + imports muertos `CheckCircle2`/`RefreshCw` en `app/copilot/datos/datos-client.tsx`. Sincronización automática vía cron `/api/cron/zeta-sync-contacts`. Botón "Ver contactos" y carga automática preservados; tab Contactos ahora usa el ramal genérico de `DATOS_EXPAND_HINT/CTA`. Verificado: no hay botones manuales equivalentes para saldos/vouchers/recibos. 617 tests, tsc limpio, build OK.
- 2026-05-10 — **UX cleanup Pipeline Health Panel · botón Actualizar**: eliminado botón manual + prop `onRefresh` + import `RefreshCw` en `pipeline-health-panel.tsx`. `app/copilot/page.tsx` no pasa más `loadPipelineHealth`. Realtime + fallback polling cubren el refresh. 617 tests, tsc limpio, build OK.
- 2026-05-10 — **FASE 5 — Pipeline Health Dashboard**: `GET /api/copilot/pipeline-health` (auth + `getAllPipelineHealth()`). `PipelineHealthSummary` extendido con `last_run_duration_ms`, `last_run_rows_processed/updated/failed`. Componente `pipeline-health-panel.tsx`: cards por pipeline con ícono de status, métricas reales, tiempo relativo + duración, errores consecutivos, is_overdue, botón Actualizar. Sección "Estado de pipelines Zeta" agregada a `app/copilot/page.tsx`. 568 tests, tsc limpio.
- 2026-05-10 — **FASE 4 — R-03+U-03 (ROW_CAP no silencioso)**: `lib/copilot-data-completeness.ts` (`DataCompletenessWarning`, `buildCapWarning`). `loadFinancialFactsBundle` detecta qué tablas alcanzan cap y puebla `isTruncated`/`tables_at_cap` en meta. `FinancialSnapshotApiV1.diagnostics.dataset_caps` refleja detección real (antes `truncation_unknown: true` hardcoded). Selectores `snapshotIsTruncated`/`snapshotTablesAtCap` en `copilot-financial-snapshot-selectors.ts`. Banner amber en `app/copilot/page.tsx` con copy de `FINANCIAL_UX_COPY.rowCapWarningTitle/Body`. 568 tests, 41 archivos, tsc limpio.
- 2026-05-10 — **ZETA-06 validación end-to-end en producción**: saldos succeeded, vouchers succeeded, contacts partial (ok). Anti-overlap, `zeta_pipeline_runs`, health layer y logs estructurados validados. Fixes: 7bebb30 (saldos multitenancy), 6cce033 (vouchers multitenancy), credencial Vercel `ZETA_DESARROLLADOR_CLAVE` corregida.
- 2026-05-09 — **Pipeline Contactos Zeta (DIV-003 + incremental sync)**: `contracts/zeta-contacts.contract.ts` soporta shape primario `QueryOut.Response[]` (Postman + tenant real) con retrocompat para `QueryOut.Contactos.Contacto[]` y variantes defensivas. `zeta-contact-mapper.ts` mapea a `ZetaContactProtoShape` (external_id, name, document, email/email2, telefono/celular, es_cliente, es_proveedor, raw_payload). `zeta-contacts-fetch.ts` con log estructurado de shape. `zeta-contacts-pipeline.ts`: sync incremental paginado con upsert (por Codigo/Documento/email), resolución de FK a proto_companies, trazabilidad en zeta_sync_*, retry simple 3 intentos, fallback de esquema en primer sync. API route `POST /api/zeta/sync-contacts`. Documentado en `KNOWN-DIVERGENCES.md` (DIV-003) y `NOTE-001`. 521 tests, tsc limpio.
- 2026-05-09 — **Hard Cutoff Pre-2026 (Fases 1–6)**: 2026-01-01 convertido en límite mínimo absoluto del sistema. Fase 2: `zeta-factura-cliente.ts` elimina fallback `new Date()` + rechaza fechas pre-2026 con log `pre_operational_cutoff`; `zeta-saldos-pipeline.ts` skip hard en `persistZetaInvoice`. Fase 3: script `scripts/remove-pre-2026-financial-data.ts` con dry-run/execute, cuenta+montos, respeta FKs. Fase 4: `proto-operational-read-repository.ts` y `proto-analytics-read-repository.ts` tienen `.gte("issue_date"/"receipt_date", COPILOT_OPERATIONAL_START_DATE)` en todas las queries; `buildFinancialDashboardMetrics` filtro in-memory defense-in-depth. Fase 5: `assertOperationalDate()` en `copilot-operational-period.ts`. Fase 6: 8 nuevos tests assertOperationalDate, 8 tests saldos-mapper hard cutoff, 4 tests dashboard-metrics pre-2026. `PROVENANCE_HOME_DASHBOARD` → `operational_2026`. 495 tests, 38 archivos, tsc limpio.
- 2026-05-09 — **Financial Semantic Unification (Fases 2–4+7)**: `lib/copilot-financial-terminology.ts` (vocabulario canónico: FT, AGING_DISPLAY_LABELS, DATA_SOURCES, PERIOD_SCOPES, RECORD_SCOPES, DataProvenanceConfig, 3 provenance presets). `components/copilot/financial-data-provenance.tsx` (`<DataProvenanceBadge>` Fuente · Período · Alcance + tooltip expandible). `copilot-financial-dashboard.tsx`: eliminados `CURRENCY_SYMBOL`/`CURRENCY_LABEL` locales, usa `currencySymbolFor` + `CURRENCY_SHORT_LABELS` del sistema central, badge `PROVENANCE_HOME_DASHBOARD` visible. `app/copilot/page.tsx`: locale `es-AR` → `es-UY`. 23 tests terminología, 475 total, tsc limpio.
- 2026-05-09 — **Período operativo 2026**: constante central `COPILOT_OPERATIONAL_START_DATE = "2026-01-01"` en `lib/copilot-operational-period.ts`. Reconciliación y cartera default a `period_only` 2026-01-01→hoy. Mappers Zeta (vouchers + recibos) rechazan fechas pre-2026 con `reason: "pre_operational_date"`. Reporte agrega `operationalPeriod` y `excludedHistorical`. UI: ControlBar renombrado a "Período operativo" con badge "2026", ExplainabilityPanel diferencia modo operativo vs historial. 452 tests, tsc limpio.
- 2026-05-09 — **Bloque 5**: `agingByCurrency` backend, `AgingAnalytics`, `ClientDebtExplorer`, `ExplainabilityPanel`, efectividad UYU/USD separadas. 416 tests, tsc limpio. Discrepancia de valores investigada y cerrada: 148.691/6.352 son valores del home (`buildFinancialDashboardMetrics`, `getProtoInvoices("all")`); 764.218/15.366 son los valores correctos de cartera (`is_active=true`, modo `all_outstanding`). Sin bug de código.
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
