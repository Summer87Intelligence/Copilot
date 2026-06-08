# Zeta — Runbook de Auditorías

**Última actualización:** 2026-06-08

Este runbook define los tres niveles de auditoría Zeta, cuándo ejecutar cada uno
y cómo interpretar los resultados. Leer antes de ejecutar cualquier script de auditoría.

---

## Resumen de niveles

| Nivel | Script | Frecuencia | Fuente de datos | Propósito |
|---|---|---|---|---|
| 1 · Contract drift | `npm run audit:zeta-contract` | Diaria / ante incidente | proto_* vivo | Zeta cambió formato, códigos o campos |
| 2 · Sync health | `npm run audit:zeta-sync-health` | Diaria | proto_* + zeta_pipeline_runs | Estado actual de sincronización |
| 3 · PDF parity | `npm run audit:zeta-pdf-parity` | Mensual / cierre | PDFs nuevos exportados de Zeta | Paridad exacta contra estado de cuenta oficial |

---

## Nivel 1 — Contract Drift Audit

**Script:** `npm run audit:zeta-contract`
**Output:** `tmp/zeta-api-contract-drift.csv`

### Cuándo ejecutar

- Diariamente como parte del ciclo de operaciones.
- Cuando un pipeline falla con `zeta_shape` o `zeta_contract` en los logs.
- Cuando Zeta anuncia actualizaciones en `zetasoftware.info/ayuda/apis/actualizaciones-recientes-apis/`.
- Tras cualquier actualización de la librería Zeta o cambio en los pipelines de sync.

### Qué detecta

| Código de drift | Significado |
|---|---|
| `UNKNOWN_CFE_TIPO` | CFETipo fuera del catálogo DGI — Zeta puede haber introducido un nuevo tipo |
| `UNKNOWN_COMPROBANTE_CODIGO` | ComprobanteCodigo no reconocido para este tenant |
| `UNKNOWN_MONEDA_CODIGO` | MonedaCodigo distinto de 1 (UYU) / 2 (USD) |
| `RECEIPT_VARIOS_USD` | Recibos con cliente genérico VARIOS — requieren asignación manual |
| `INVOICE_MISSING_REGISTRO_ID` | Factura sin RegistroId — no puede deduplicarse ni linkear cuotas |
| `SALDO_MISSING_REGISTRO_ID` | Fila de saldo pendiente sin identidad |
| `SHADOW_DUPLICATE_REGISTRO_ID` | Pipeline de saldos duplicó un CCV1 existente |
| `CLIENTE_CODIGO_NO_MATCH_COMPANY` | ClienteCodigo Zeta sin empresa local — ejecutar sync de contactos |

### Acciones ante resultados

- **UNKNOWN_CFE_TIPO**: revisar `CFE_TIPOS_DGI_ALL` en `zeta-api-contract.ts`. Si el código
  es un nuevo tipo DGI oficial, agregarlo al catálogo y actualizar `KNOWN-DIVERGENCES.md`.
- **UNKNOWN_COMPROBANTE_CODIGO**: verificar con la contadora si es un tipo nuevo del tenant.
  Si es válido, agregar a `KNOWN_COMPROBANTE_CODIGOS`.
- **SHADOW_DUPLICATE_REGISTRO_ID**: investigar el guard `buildSaldosDueDatePatch` en
  `zeta-saldos-pipeline.ts`. Documentar como nueva divergencia si persiste.
- **CLIENTE_CODIGO_NO_MATCH_COMPANY**: ejecutar sync de contactos (`/api/cron/zeta-sync-contacts`).

---

## Nivel 2 — Sync Health Audit

**Script:** `npm run audit:zeta-sync-health`
**Output:** `tmp/zeta-current-sync-health.csv`

### Cuándo ejecutar

- Diariamente como primera línea de diagnóstico.
- Cuando el equipo reporta datos desactualizados o saldos incorrectos.
- Antes de exportar un PDF de estado de cuenta para un cliente.
- Tras un incidente de sincronización (pipeline fallido, downtime Vercel/Zeta).

### Checks realizados

| Categoría | Check | Umbral de alerta |
|---|---|---|
| `pipeline_health` | Estado por pipeline (healthy/degraded/stalled) | stalled → error, degraded → warning |
| `completeness_audit` | Drift Zeta vs local por entidad y período | missing_registro_ids > 0 → error |
| `proto_counts` | Totales de invoices / receipts / companies / installments | informativo |
| `proto_counts` | Recibos VARIOS / pending_review | > 0 → warning |
| `proto_counts` | Shadows duplicados por RegistroId | > 0 → warning |
| `proto_counts` | ClienteCodigos sin empresa local | > 0 → warning |
| `currency_breakdown` | Facturas sin currency_code | > 0 → warning |
| `voucher_classifier` | Vouchers skippeados por clasificador (recibo/no-DGI) | informativo |
| `cron_errors` | Últimos runs fallidos / parciales | cualquier fallo → error/warning |

### Acciones ante resultados

- **pipeline stalled**: verificar logs de Vercel para el cron correspondiente. Puede ser
  downtime temporal de Zeta o error de credenciales.
- **completeness drift**: el cron `zeta-resync-worker` debería resolverlo automáticamente.
  Si persiste >24h, ejecutar resync manual vía `/api/zeta/sync-installments-backfill`.
- **currency_code = null**: ejecutar currency enrichment pipeline.
- **ClienteCodigo sin match**: ejecutar sync de contactos.
- **VARIOS receipts**: revisar manualmente e imputar al cliente real si es posible.

### Nota sobre divergencia de datos

Los datos en proto_* reflejan el **estado al momento del último sync** (cada ~2-3h).
Un desfase de hasta 3h entre Zeta y Copilot es **normal y esperado**.
No interpretar como error si la diferencia es reciente.

---

## Nivel 3 — PDF Parity Audit (SNAPSHOT)

**Script:** `npm run audit:zeta-pdf-parity`
**Output:** `tmp/zeta-pdf-parity-*.json` (o CSV según config)

### ⚠️ Restricción crítica: solo usar con PDFs del mismo corte temporal

Este script compara el modelo de estado de cuenta de Copilot contra PDFs exportados
directamente desde Zeta. **Solo es válido cuando el corte temporal coincide.**

**NO ejecutar** este script:
- Contra PDFs de una semana o un mes atrás mientras Copilot tiene datos más recientes.
- Como gate diario automático (los PDFs envejecen y el modelo Copilot avanza).
- Para confirmar que "todo está bien" sin PDFs del mismo día.

**SÍ ejecutar** este script:
- Al final del mes, después de exportar PDFs frescos desde Zeta del mismo período.
- Cuando la contadora reporta una diferencia específica en un cliente determinado.
- Para validar que un fix de estado de cuenta fue correcto (exportar PDF nuevo después del fix).

### Workflow correcto

```
1. Exportar PDFs desde Zeta:
   Contabilidad > Clientes > Estado de Cuenta > Exportar PDF
   (mismo período, misma fecha de corte)

2. Copiar PDFs a: audits/zeta/

3. Actualizar ZETA_PDFS en:
   scripts/audit-zeta-pdf-vs-copilot-account-statements.ts

4. Ejecutar:
   npm run audit:zeta-pdf-parity

5. Si hay diferencias:
   a. Verificar que el período del PDF coincide con el filtro del script (PERIOD_FROM / PERIOD_TO)
   b. Verificar opening balance — puede ser diferencia de recibos pre-período (ver DIV-CONT-004)
   c. Verificar notas de crédito — el motor las maneja en ledgerMode pero pueden divergir
   d. Si la diferencia es aceptable (<= AMOUNT_TOL = 0.02): marcar como OK
   e. Si no: documentar en KNOWN-DIVERGENCES.md como nueva divergencia
```

### Cuando PDF parity falla — checklist de diagnóstico

1. **¿El PDF es del mismo período?** El script usa `PERIOD_FROM` / `PERIOD_TO` hardcodeados.
   Si el PDF es de otro período, el resultado no es comparable.

2. **¿Hubo pagos o facturas cargados entre la exportación del PDF y el run del script?**
   Zeta es vivo. Un pago cargado por la contadora 5 minutos después del PDF ya no coincidirá.

3. **¿El cliente tiene opening balance sin recibos pre-período?** Ver DIV-CONT-004.
   Solución: setear `proto_companies.ledger_opening_balance_uyu/usd`.

4. **¿Hay notas de crédito (CFETipo 181/182)?** Verificar que el ledger las descuenta.

5. **¿Hay clientes VARIOS USD en recibos?** Pueden estar imputados diferente en Zeta.

---

## Cadencia recomendada

### Diaria (operador o CI)

```bash
npm run audit:zeta-contract       # ~30s — detecta drift de formato
npm run audit:zeta-sync-health    # ~60s — health de pipelines y datos
```

### Mensual (cierre, con PDFs nuevos)

```bash
# 1. Exportar PDFs frescos desde Zeta del período cerrado
# 2. Copiar a audits/zeta/ y actualizar lista en script
npm run audit:zeta-pdf-parity     # comparación snapshot
```

### Ante incidente

```bash
npm run audit:zeta-contract       # 1. ¿cambió el formato de Zeta?
npm run audit:zeta-sync-health    # 2. ¿están los pipelines andando?
# Si los pipelines están ok pero los datos difieren:
npx tsx scripts/audit-zeta-live-pending-vs-db.ts   # 3. saldos live vs DB
npx tsx scripts/audit-zeta-receipts-divergence.ts  # 4. recibos por mes
```

---

## Archivos relacionados

| Archivo | Propósito |
|---|---|
| `docs/integrations/zeta-api-contract.md` | Contrato técnico de la API Zeta |
| `docs/vendors/z/KNOWN-DIVERGENCES.md` | Divergencias confirmadas entre API y tenant real |
| `docs/vendors/z/INTEGRATION-CHECKLIST.md` | Checklist previa a cualquier implementación Zeta |
| `lib/integrations/zeta/zeta-api-contract.ts` | Schemas y validadores del contrato |
| `lib/data/zeta-pipeline-health.ts` | Lógica de salud de pipelines |
| `lib/data/zeta-pipeline-run-types.ts` | Nombres y tipos de pipelines |
