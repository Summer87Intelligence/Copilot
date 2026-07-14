# Capa bancaria canónica (`lib/bank/canonical`)

FASE-3. Resuelve la ambigüedad entre los dos sistemas bancarios y aplica una
política temporal explícita para movimientos históricos.

## Fuentes

| Fuente | Tabla | Rol |
| --- | --- | --- |
| Canónica | `bank_movements` | Sistema operativo: importación Santander, conciliación, ingresos, alias, dedupe. |
| Legacy | `bank_reconciliation_movements` | Read-only durante la transición (histórico de Tesorería). |

La decisión está respaldada por auditoría real: `bank_movements` = 951 filas con
todo el surface operativo; `bank_reconciliation_movements` = 1 fila huérfana sin
duplicado cross-source. Ver `docs/technical/canonical-bank-movements.md`.

## Política temporal

`BANK_OPERATIONAL_START_DATE = "2026-07-01"` (centralizada en `historical-policy.ts`).

- `fecha < corte` ⇒ **histórico**: visible y buscable, pero no genera tareas ni
  alertas, no aparece como pendiente reciente ni afecta métricas operativas.
- `fecha >= corte` ⇒ **operativo**.

`isHistorical` es **derivado**, no persistido (no requiere migración).

## Contrato

`CanonicalBankMovement` usa **`direction` + importe absoluto** (nunca importe con
signo ambiguo). UYU y USD se mantienen siempre separados. El `net` del snapshot es
**neto bancario**, no "caja".

## API

```ts
import {
  toCanonicalFromBankMovement,   // adapter fuente canónica
  toCanonicalFromLegacy,         // adapter legacy read-only
  buildCanonicalBankSnapshot,    // snapshot por moneda, operativo vs histórico
  buildBankActivityReportModel,  // modelo reusable de reporte
  detectCrossSourceDuplicates,   // dedupe cross-source (nunca borra)
  isBankMovementHistorical,      // guard central de la política temporal
  BANK_OPERATIONAL_START_DATE,
} from "@/lib/bank/canonical";
```

## No hace (en esta fase)

- No fusiona físicamente ambas tablas ni migra datos.
- No suma indiscriminadamente ambas fuentes: el snapshot excluye del total los
  duplicados legacy (confianza exact/high) para no doble contar.
- No toca caja de Tesorería.
