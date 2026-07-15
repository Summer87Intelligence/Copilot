# Capa de transición canónica de Tesorería (`lib/treasury/canonical`)

FASE-4. Encapsula la dependencia de Tesorería sobre `bank_reconciliation_movements`
en un **único punto de transición**.

## Regla

La lógica de **caja/proyección** de Tesorería NO debe importar
`bank-reconciliation-movement-repository` directamente. Debe leer el banco a través de
`loadTreasuryCashflowBankMovements`.

## Separación conceptual

| Módulo | Representa | No representa |
| --- | --- | --- |
| Banco | movimientos importados (`bank_movements`, capa canónica) | caja |
| Tesorería | posición y proyección de caja | el extracto bancario |
| Finanzas | KPIs financieros | — |
| Cobranza | facturas, recibos, deuda | — |

## Resultado idéntico

El adaptador devuelve las filas legacy **sin transformar**, así la proyección y las
alertas dan exactamente el mismo resultado. El cambio es de **origen** (una sola
puerta encapsulada), no de **resultado**. La única fila legacy real está en estado
`ignored`, por lo que su aporte al cashflow es **0** (ver `shouldCountBankInCashflow`).

## API

```ts
import {
  loadTreasuryCashflowBankMovements, // única lectura legacy para cashflow
  buildTreasuryLegacyBankSnapshot,   // vista canónica read-only (no se suma a caja)
} from "@/lib/treasury/canonical";
```

## Retiro

Cuando la proyección deje de mezclar banco en caja (Banco ≠ Caja), este adaptador se
elimina junto con la dependencia legacy. Ver
`docs/technical/treasury-canonical-migration.md`.
