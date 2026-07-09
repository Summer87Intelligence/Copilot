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
