# Copilot — Arquitectura de Información por Dominios (FASE DOMAIN-IA-BANK-001)

Última actualización: 2026-07-17. Estado: **diseño** (sin cambios de navegación aplicados).

## Principio central: no duplicar entidades

Una entidad canónica existe **una sola vez**; los módulos la leen o proyectan de
forma trazable. Ninguna segunda tabla paralela de facturas/clientes/movimientos.

| Entidad | Fuente canónica | Aparece en |
|---|---|---|
| Cliente/empresa | `proto_companies` (Zeta) | Ventas, Cobranza, Cliente 360, Banco, Finanzas |
| Factura | `proto_invoices` (Zeta) | Ventas (emitida), Cobranza (pendiente/atraso), Cliente 360, Banco (destino), Finanzas, Reportes |
| Recibo/cobro | `proto_receipts` (Zeta) | Cobranza, Cliente 360, Banco, Finanzas |
| Movimiento bancario | `bank_movements` (canónico, FASE E) | Banco, Tesorería (lectura), Cliente 360 (conciliado) |
| Conciliación (financiera) | `bank_movement_reconciliation_links` (canónica) + `bank_reconciliation_suggestions` (propuesta) | Banco, Cobranza, Cliente 360 |
| Comercial / asignación | `sales_salespersons` / `sales_client_salespersons` | Ventas, Cliente 360 |
| Pagador bancario | (nuevo) `bank_payer_identities` + `client_payer_links` | Banco, Cliente 360 |

## Mapa de dominios (qué responde cada uno)

- **Hoy** — qué requiere atención hoy: prioridades, próximos pagos/cobros, tareas, excepciones bancarias. No duplica módulos completos.
- **Ventas** — qué se vendió, a quién, cuánto, cuándo, por qué comercial, en qué moneda, qué documento.
- **Cobranza** — quién debe, cuánto, cuánto atrasado, qué se cobró, qué falta, qué gestión, próximo paso. (Cartera = subconjunto de Cobranza.)
- **Clientes / Cliente 360** — toda la relación con un cliente (identidad, contactos, ventas, facturas, recibos, deuda, aging, pagos, banco conciliado, **cuentas y pagadores habituales**, tareas, actividad).
- **Banco** — qué dinero entró/salió realmente, de dónde vino, con qué quedó conciliado, qué falta revisar.
- **Tesorería** — caja, ingresos/egresos, programados, recurrentes, proyección. No duplica la conciliación bancaria.
- **Finanzas** — resultado del período (ventas, cobrado, pendiente, deuda, caja, proyección, comparación).
- **Reportes** — salida analítica y exportable.
- **Integridad** — calidad/consistencia de datos (FASE F).
- **Administración** — usuarios, permisos, workspace, integraciones, auditoría.

## Fuentes de verdad (SoT)

- **Zeta**: cliente, factura, recibo, saldo, documentos comerciales.
- **Banco**: entrada/salida efectiva, pagador, cuenta origen, referencia, fecha e importe bancarios.
- **Copilot**: conciliación, sugerencias, confirmaciones, relación pagador↔cliente, confianza, eventos, tareas, notas, excepciones, trazabilidad.

## Navegación propuesta (diseño; **no aplicada** — preserva URLs y permisos)

Agrupación por dominio operativo (los `moduleKey`/rutas/permite se conservan):

- **Operación diaria**: Hoy · Tareas
- **Comercial**: Ventas · Clientes
- **Cobranza y dinero**: Cobranza · Banco · Tesorería · Finanzas
- **Análisis y control**: Reportes · Integridad
- **Sistema**: Administración

`/copilot/hoy` sigue siendo la ruta inicial. La adopción de esta agrupación es una
vertical separada (requiere revisar `copilot-nav-config.tsx` + tests de nav/permisos).

## Subnavegación por dominio (solo lo que existe / se implemente)

- **Ventas**: Resumen · Facturas · Clientes · Servicios · Comerciales · Tendencias (ya existente).
- **Cobranza**: Resumen · Prioridades · Clientes con atraso · Recibos y cobros · Gestiones · Compromisos · Sin aplicar · Excepciones.
- **Banco**: Resumen · Para revisar · Conciliados · Sin identificar · Diferencias · Importaciones · Pagadores.
- **Cliente 360**: Resumen · Ventas · Facturas · Cobranza · Pagos · Banco · Contactos · Actividad (ya en 10 tabs).

No crear pestañas vacías: solo navegación para datos existentes o implementados.

## Enlaces contextuales (patrón)

Deep links que preservan filtros por query param, respetando permisos y sin fetch por link:

```
/copilot/ventas?clientId=<id>
/copilot/cobranza?clientId=<id>
/copilot/banco?clientId=<id>
/copilot/clientes/<id>?tab=payments
```

Desde una factura → cliente / estado de cuenta / recibos / conciliación / comercial.
Desde un movimiento → cliente / recibo / factura / pagador / lote de importación.
Desde Cliente 360 → ventas / facturas / movimientos conciliados / pagadores habituales.

## Cambios de navegación (matriz)

| Área | Antes | Después (propuesto) | Estado |
|---|---|---|---|
| Navegación global | lista plana | grupos por dominio | DISEÑO (no aplicado) |
| Cartera | módulo aparte | subsección de Cobranza | DISEÑO (URL conservada) |
| Banco | lista + conciliación | centro operativo con subsecciones | DISEÑO / parcial FASE E |
| Cliente 360 | 10 tabs | + "Cuentas y pagadores" | DISEÑO (depende de migración) |

## Pendiente (verticales separadas, requieren autorización)

- Aplicar la agrupación de navegación (revisar tests de nav/permisos).
- Aplicar migraciones de pagadores/conciliación (ver `bank-intelligent-reconciliation.md`).
- Sección "Cuentas y pagadores" en Cliente 360 (necesita datos persistidos).
