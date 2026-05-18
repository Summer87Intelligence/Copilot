# ZetaSoftware API — Data Models (Zeta -> Interno)

## Factura / Venta Detallada

### Campos observados en documentación

- FacturaId
- FacturaFecha
- FacturaNumero
- FacturaSerie
- FacturaSerieNumero
- FacturaSigno
- ClienteCodigo
- ClienteNombre
- ClienteRazonSocial
- ComprobanteCodigo
- ComprobanteNombre
- ComprobanteTipo
- MonedaCodigo
- MonedaSimbolo
- LineaCantidad
- LineaConcepto
- LineaPrecio
- LineaSubtotal
- LineaIVA
- LineaTotal
- IVACodigo
- IVANombre
- IVATasa
- ArticuloCodigo
- ArticuloNombre
- VendedorCodigo
- VendedorNombre
- LocalCodigo
- LocalNombre

### Mapeo interno sugerido (operativo)

- `external_id` -> `FacturaId` (si existe en response) / `PENDIENTE` cuando no venga informado.
- `tenant_id` -> contexto interno del sistema (no proviene de Zeta, obligatorio interno).
- `customer_external_id` -> `ClienteCodigo`.
- `issue_date` -> `FacturaFecha`.
- `invoice_number` -> derivado de `FacturaNumero` y/o `FacturaSerieNumero` (`PENDIENTE` definición final de concatenación).
- `currency_code` -> `MonedaCodigo`.
- `total_amount` -> `LineaTotal` agregado por comprobante (`PENDIENTE` regla de agregación exacta).
- `tax_amount` -> `LineaIVA` agregado por comprobante (`PENDIENTE` regla de agregación exacta).
- `raw_payload` -> response bruto de Zeta para trazabilidad.
- `synced_at` -> timestamp interno de sincronización.

## Saldo Pendiente

### Campos observados en documentación

- ClienteCodigo
- ClienteNombre
- ClienteRazonSocial
- ComprobanteCodigo
- ComprobanteNombre
- ComprobanteTipo
- Fecha
- MonedaCodigo
- MonedaNombre
- MonedaSimbolo
- RegistroId
- Saldo
- SaldoSigno
- Serie
- Numero
- Total
- TotalSigno

### Mapeo interno sugerido (operativo)

- `external_id` -> `RegistroId` (`PENDIENTE` confirmar unicidad global por tenant).
- `tenant_id` -> contexto interno del sistema.
- `customer_external_id` -> `ClienteCodigo`.
- `document_type` -> `ComprobanteTipo`.
- `issue_date` -> `Fecha`.
- `due_date` -> `PENDIENTE` (no documentado en fuentes actuales).
- `balance_amount` -> `Saldo`.
- `total_amount` -> `Total`.
- `currency_code` -> `MonedaCodigo`.
- `raw_payload` -> response bruto de Zeta.
- `synced_at` -> timestamp interno de sincronización.

## Cliente

### Campos observados

- ClienteCodigo
- ClienteNombre
- ClienteRazonSocial

### Estado

`PARCIAL` — se observa indirectamente en ventas/saldos, pero no existe endpoint completo de clientes documentado en esta carpeta.

## Pago/Cobro

### Estado

`BLOQUEADO` — no existe endpoint documentado completo para pagos/cobros en la documentación operativa actual.
