# Motores de liquidez Copilot (dominio interno)

## Dos especializaciones

| Motor | Archivo | Pregunta de negocio |
|-------|-----------|---------------------|
| **Snapshot / liquidez global** | `copilot-financial-engine.ts` | ¿Cómo está la empresa en una **fecha de corte** con horizonte fiscal fijo? |
| **Cobertura por obligación** | `copilot-cashflow-engine.ts` | ¿Alcanza la caja + cobros esperados **hasta el vencimiento de esta obligación** para cubrir su monto? |

No comparar 1:1 los campos homónimos `expected_inflows` / `expected_outflows` entre ambos: miden conjuntos temporales y reglas distintas (ver JSDoc en cada archivo).

## Datos y primitivas compartidas

- **`FinancialFactsBundle`** (`proto-analytics-read-repository`): misma carga base de hechos; cada motor consume proyecciones o rutas acordes (snapshot con impuestos vía repo; cashflow vía dataset HTTP enriquecido).
- **`copilot-financial-primitives`**: coerción numérica, caja histórica positiva, probabilidades de cobro, parseo de fechas (`ymdFromIsoLocal` vs `ymdFromIsoUtcDate`), aritmética de calendario.

Los motores **no** se fusionan mientras las reglas de negocio sigan diferenciadas por producto; este documento solo fija el lenguaje de dominio.
