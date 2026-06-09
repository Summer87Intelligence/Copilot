---
title: copilot/datos — Comportamiento operativo
updated: 2026-06-09
---

# copilot/datos — Comportamiento y reglas operativas

## Propósito

`/copilot/datos` es una pantalla de **consulta y auditoría** de datos sincronizados desde Zeta. No es una herramienta de gestión.

---

## Entidades y permisos por entidad

| Entidad | Ver | Crear | Editar | Borrar | Notas |
|---|---|---|---|---|---|
| Clientes | ✅ | ❌ | ✅ | ✅ | Clientes sincronizados desde Zeta |
| Facturas | ✅ | ✅ | ✅ | ✅ | |
| Recibos | ✅ | ✅ | ✅ | ✅ | |
| **Pagos** | ✅ | ❌ | ❌ | ❌ | **Solo lectura.** Crear/editar/borrar pagos: exclusivo de Tesorería → Pagos próximos |
| Obligaciones fiscales | ✅ | ✅ | ✅ | ✅ | |

---

## Moneda no detectada

Cuando `currency_code` es `null` o no puede determinarse:

- **Tablas (Facturas/Recibos):** el importe muestra `1.234 · sin moneda` (no "$").
- **Drawer de cliente (Recibos):** badge naranja `sin moneda` junto al importe.
- **No se asume UYU por defecto** en ninguna vista operativa.

---

## Recibos sin factura asociada (limitación Zeta)

Zeta no expone el vínculo recibo ↔ factura en la API de cobranzas.

- En el drawer de cliente → pestaña Recibos: cuando `invoice_id` es `null`, se muestra `· vinculación no disponible (Zeta)`.
- Esto **no es un bug** — es una limitación conocida de la integración.
- No se intenta inferir ni inventar la asociación.

---

## Clientes inactivos

Un cliente puede aparecer en `copilot/datos` si se filtra por "Inactivos" o "Todos".

- El enlace "Ver ficha completa" funciona también para clientes inactivos.
- La ficha `/copilot/clientes/{id}` muestra un banner amarillo: **"Este cliente está inactivo (archivado). La ficha es de solo lectura."**
- Los datos se cargan normalmente; la ficha no bloquea la navegación.

---

## Filtros disponibles

### Facturas
- Período: mes/año, rango de fechas, o todos
- Estado: chips de estado
- Moneda: UYU / USD / Todas
- Vencimiento: Vencidas / Pagadas / Con saldo / Todas
- Cliente: selector por empresa

### Recibos
- Período: mes/año, rango de fechas, o todos
- Moneda: UYU / USD / Todas
- Cliente: selector por empresa

### Pagos
- Fecha: rango desde/hasta (payment_date)
- Estado: filtro por estado

### Obligaciones fiscales
- Fecha de vencimiento: rango desde/hasta (due_date)
- Estado: filtro por estado

---

## Dónde gestionar cada entidad

| Acción | Lugar correcto |
|---|---|
| Crear pago | Tesorería → Pagos próximos |
| Editar pago | Tesorería |
| Crear factura | copilot/datos o flujo rápido |
| Cobros (recibos) | copilot/datos |
| Gestión de clientes | Cartera / Clientes |
