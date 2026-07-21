/**
 * Texto mínimo extraído de extractos Santander (sin PDF binario).
 * Datos anonimizados / sintéticos para tests del módulo bank-movements.
 */

/** Santander UYU julio 2026 — formato auszug (fecha partida en dos líneas). */
export const SANTANDER_UYU_JULY_AUSZUG_FIXTURE = `
Santander
Movimientos de cuenta

Cliente: Empresa Demo SAS
Cuenta: Cta. Pyme Básica, 000001211749
Moneda: UYU
Período: 01/07/2026 - 31/07/2026

Fecha	Referencia	Tipo Movimiento	Descripción	Débito	Crédito	Saldo
Saldo inicial			531.696,06
01/07/20
26	ZETA001		PAGO ZETA	-3.721,00		527.975,06
15/07/2026	MOV001		PAGO MOVISTAR	-3.548,00		524.427,06
20/07/2026	ING001		TRANSFERENCIA RECIBIDA CLIENTE		6.000,00	530.427,06
Saldo final			530.427,06

El saldo informado no incluye movimientos en tránsito.
`.trim();

/** Santander USD julio 2026 — formato auszug (fecha completa). */
export const SANTANDER_USD_JULY_AUSZUG_FIXTURE = `
Santander
Movimientos de cuenta

Cliente: Easy Digital Agencysas
Cuenta: Cta. Pyme Básica, 005101107711
Moneda: USD
Período: 01/07/2026 - 31/07/2026

Fecha	Referencia	Tipo Movimiento	Descripción	Débito	Crédito	Saldo
10/07/2026	RET001		RETIRO EN CAJA	-1.000,00		4.000,00
15/07/2026	ING427		CREDITO CLIENTE EXTERNO		427,00	4.427,00

El saldo informado no incluye movimientos en tránsito.
`.trim();

/** Santander USD junio 2026 — formato umsatz (fecha completa en una línea). */
export const SANTANDER_USD_JUNE_UMSATZ_FIXTURE = `
Movimientos de cuenta

Cliente
Easy Digital Agencysas
Cuenta Moneda Sucursal
Cta. Pyme Básica, 005101107711 USD 17 - Ciudad De La Costa
Movimientos
01/06/2026 - 30/06/2026

Fecha Referencia Tipo Movimiento Descripción Débito Crédito Saldo
05/06/2026 614822990282 COMPRA CON TARJETA DEBITO EXT. OPENAI -90,91 1.000,00
05/06/2026 614822990282 COMISION COMPRA INTERNACIONAL OPENAI -2,73 909,09

El saldo informado no incluye movimientos en tránsito.
`.trim();

/** Descripción multilínea (auszug). */
export const SANTANDER_MULTILINE_DESCRIPTION_FIXTURE = `
Santander
Movimientos de cuenta

Cliente: Empresa Demo SAS
Cuenta: Cta. Pyme Básica, 000001211749
Moneda: UYU
Período: 01/07/2026 - 31/07/2026

Fecha	Referencia	Tipo Movimiento	Descripción	Débito	Crédito	Saldo
22/07/2026	REFML1		TRANSFERENCIA ENVIADA
A PROVEEDOR LARGO NOMBRE SA	-1.250,50		100.000,00

El saldo informado no incluye movimientos en tránsito.
`.trim();

export const NON_SANTANDER_BANK_PDF_FIXTURE = `
Banco Demo
Resumen de cuenta
Moneda: USD
01/07/2026 compra supermercado -100,00
`.trim();

/**
 * BANK-V3-APPLY-PDF-IMPORT-FIX-AND-DEMO-READY-001, secciones 6-15 — reproduce, con montos y
 * cuenta sintéticos (no son los del extracto real), la GEOMETRÍA real de `pdf-parse` sobre
 * los extractos Santander "auszug" multipágina: encabezado partido en varias líneas ("Fecha
 * Referen" / "cia" / "Tipo Movimiento..."), fecha partida ("01/08/20" + "26"), referencia
 * partida en dos líneas (ej. "LE66102" + "33645"), el marcador de salto de página que
 * `pdf-parse` intercala entre páginas ("-- N of M --") tanto en medio del extracto como
 * INMEDIATAMENTE DESPUÉS del último movimiento real (antes de "Saldo final") — ese último
 * caso es la reproducción exacta del bug real encontrado en los dos extractos de julio 2026:
 * sin el fix, el último movimiento quedaba fusionado con "Saldo final" y se descartaba en
 * silencio por `isBalanceRow`. También incluye los 3 pares principal+comisión pedidos por la
 * fase (ZETASOFTWARE por NRR, MICAELA NAVARRA por referencia TT, PETROVIC SOLUTIONS como
 * crédito+comisión por referencia TR).
 */
export const SANTANDER_REALWORLD_MULTIPAGE_FIXTURE = `
Cliente
Empresa Demo SAS
Cuenta Moneda Sucursal
Cta. Pyme Básica, 000009999999 UYU 17 - Ciudad De La Costa
Movimientos
01/08/2026 - 31/08/2026
Fecha Referen
cia
Tipo Movimiento Descripción Débito Crédito Saldo
Saldo inicial 100.000,00
01/08/20
26
6182125
45773
COMPRA CON
TARJETA DEBITO
COMERCIO DEMO,
MONTEVIDEO
-500,00 99.500,00

-- 1 of 2 --

03/08/2026
LE66102
33645
TRANSF
INSTANTANEA
ENVIADA 779244LE
NRR:201870170
ZETASOFTWARE
S.A.
-3.000,00 96.500,00
03/08/2026
LE66102
33645
COMISION TRANSF
INSTANTANEA
779249LE
NRR:201870170
ZETASOFTWARE
S.A.
-60,00 96.440,00
06/08/2026
TT99887
766
DEBITO
OPERACION EN
BANCA DIGITAL
528896TT9988776
6 TRF. PLAZA-
MICAELA NAVARRA
-700,00 95.740,00
06/08/2026
TT99887
766
TRANSFERENCIA
ENVIADA
528900TT9988776
6 TRF. PLAZA-
MICAELA NAVARRA
-2,00 95.738,00
17/08/2026
TR00900
11111
TRANSFERENCIA
RECIBIDA
680345TT
RECIBIDA
PETROVIC
SOLUTIONS
400,00 96.138,00
17/08/2026
TR00900
11111
TRANSFERENCIA
RECIBIDA
680351TT
RECIBIDA
COMISION -
PETROVIC
SOLUTIONS
-25,00 96.113,00
20/08/2026
362629 DEBITO
OPERACION EN
BANCA DIGITAL
TFCG DEMOCORP
-113,00 96.000,00
Saldo final 96.000,00

-- 2 of 2 --

El saldo informado no incluye movimientos en tránsito.
`.trim();

/**
 * Misma cuenta/mes que SANTANDER_REALWORLD_MULTIPAGE_FIXTURE pero con un saldo de fila
 * deliberadamente inconsistente (sección 10: la validación de saldo no debe ocultar esto).
 */
export const SANTANDER_BALANCE_MISMATCH_FIXTURE = `
Cliente
Empresa Demo SAS
Cuenta Moneda Sucursal
Cta. Pyme Básica, 000009999998 UYU 17 - Ciudad De La Costa
Movimientos
01/08/2026 - 31/08/2026
Fecha Referen
cia
Tipo Movimiento Descripción Débito Crédito Saldo
Saldo inicial 10.000,00
01/08/2026
REF001
DEBITO
OPERACION EN
BANCA DIGITAL
DEMO
-500,00 8.000,00
Saldo final 8.000,00

El saldo informado no incluye movimientos en tránsito.
`.trim();

/** Dos filas idénticas (misma fecha/referencia/monto/descripción) — deben distinguirse por ocurrencia (sección 13). */
export const SANTANDER_EXACT_DUPLICATE_ROWS_FIXTURE = `
Cliente
Empresa Demo SAS
Cuenta Moneda Sucursal
Cta. Pyme Básica, 000009999997 UYU 17 - Ciudad De La Costa
Movimientos
01/08/2026 - 31/08/2026
Fecha Referen
cia
Tipo Movimiento Descripción Débito Crédito Saldo
Saldo inicial 1.000,00
05/08/2026
REF777
COMISION
MANTENIMIENTO
CUENTA
-10,00 990,00
05/08/2026
REF777
COMISION
MANTENIMIENTO
CUENTA
-10,00 980,00
Saldo final 980,00

El saldo informado no incluye movimientos en tránsito.
`.trim();
