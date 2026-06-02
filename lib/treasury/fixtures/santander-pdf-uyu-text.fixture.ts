/**
 * Texto extraído de un extracto Santander UYU (tabla sin columna Referencia).
 * Tab-separado, con texto "Santander" extraíble.
 */
export const SANTANDER_PDF_UYU_FIXTURE = `
Santander
Movimientos de cuenta

Cliente: Empresa Test SAS
Cuenta: Cta. Corriente, 001234567890
Moneda: UYU
Período: 01/05/2026 - 31/05/2026

Fecha	Tipo Movimiento	Descripción	Débito	Crédito	Saldo
16/05/2026		TRANSFERENCIA RECIBIDA GJORGJI		3.335,00	125.482,00
14/05/2026		TRANSFERENCIA RECIBIDA MARIA EVA POSE		3.519,00	128.817,00
10/05/2026		PAGO A CARDONA	-976,00		125.298,00
08/05/2026		CREDITO LANCER SRL		21.472,00	126.274,00
05/05/2026		PAGO AREVALO	-7.320,00		104.802,00
02/05/2026		COMPRA ALKITODO	-14.640,00		112.122,00

El saldo informado no incluye movimientos en tránsito.
`.trim();

/**
 * Texto extraído de un extracto Santander UYU usando pdf-parse real:
 * sin tabs, sin columna Referencia, sin texto "Santander" extraíble,
 * y montos sin parte decimal (simulando artefacto de extracción PDF).
 */
export const SANTANDER_PDF_UYU_REAL_TEXT_FIXTURE = `
Movimientos de cuenta

Cliente
Empresa Test SAS
Cuenta Moneda Sucursal
Cta. Corriente, 001234567890 UYU 05 - Montevideo
Movimientos
01/05/2026 - 31/05/2026

Fecha Tipo Movimiento Descripción Débito Crédito Saldo
16/05/2026 TRANSFERENCIA RECIBIDA GJORGJI 3.335 125.482
14/05/2026 TRANSFERENCIA RECIBIDA MARIA EVA POSE 3.519 128.817
10/05/2026 PAGO A CARDONA -976,00 125.298
08/05/2026 CREDITO LANCER SRL 21.472 126.274
05/05/2026 PAGO AREVALO -7.320 104.802
02/05/2026 COMPRA ALKITODO -14.640 112.122

El saldo informado no incluye movimientos en tránsito.
`.trim();
