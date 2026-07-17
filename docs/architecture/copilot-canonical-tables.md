# Sistema Canónico de Tablas de Copilot (FASE UI-TABLES-001)

Última actualización: 2026-07-17.

## Problema anterior

La tabla "Clientes con deuda" de `/copilot/hoy` mantenía una implementación
propia (`<table>` a medida con expand-on-row): encabezados diminutos, filas
compactas, acciones apretadas, paginación poco legible y responsive limitado,
divergente de las tablas más nuevas.

## Decisión arquitectónica (por evidencia)

**Base canónica: `components/copilot/ui/copilot-responsive-table.tsx`
(`CopilotResponsiveTable`).** No se creó una segunda arquitectura.

Evidencia de que ya era el estándar (mayor adopción + mejor arquitectura):
consumida por Ventas (todos los tabs), Clientes (portfolio), Banco y Tesorería
(4 paneles). Aporta: columnas declarativas (`key/header/render/sortKey`),
`getRowKey`, `emptyState`, `onRowClick`, `mobileCard` (cards en <640px),
`rowClassName`, `ariaLabel`, `stickyHeader`, `sort` controlado (`aria-sort`),
y accesibilidad (colspan vacío, teclado en cards mobile).

`components/copilot/copilot-data-table.tsx` es específico de **Datos** (entidades
CRUD) y queda como implementación propia de esa superficie (no se fuerza a migrar).

### Extensión aplicada (aditiva, retrocompatible)

`CopilotResponsiveTable` no soportaba **filas expandibles** (que Hoy necesita).
Se añadieron props opcionales — sin cambiar el comportamiento de los 12 consumers
existentes:

- `expandedRow?: (row) => ReactNode` — detalle a ancho completo (solo desktop/tablet).
- `getRowExpanded?: (row) => boolean` — expansión CONTROLADA por el consumer.

La expansión es accesible: `aria-expanded` + `aria-controls` en la fila; el toggle
lo maneja el consumer vía `onRowClick`. En mobile las cards no expanden.

## API del componente

```ts
type CopilotResponsiveTableColumn<T> = {
  key: string;
  header: ReactNode;            // admite <span title> para tooltips
  className?: string;           // th (alineación)
  cellClassName?: string;       // td (p.ej. "text-right tabular-nums")
  render: (row: T) => ReactNode;
  sortKey?: string;             // header ordenable si hay `sort`
};

type CopilotResponsiveTableProps<T> = {
  rows; columns; getRowKey;
  minWidth?; emptyState?; onRowClick?; mobileCard?;
  rowClassName?; ariaLabel?; stickyHeader?; sort?;
  expandedRow?; getRowExpanded?;   // FASE UI-TABLES-001
};
```

Separación estricta: **la lógica financiera NO vive en la tabla**. La tabla solo
presenta filas ya calculadas/ordenadas/paginadas por el consumer.

## Sistema visual / lenguaje canónico

- Numérico: `text-right` + `tabular-nums`; `—` para ausencia (nunca 0 si el dato
  no está disponible); UYU y USD **siempre separados**.
- Estados/lenguaje: "atrasado" / "días de atraso" (nunca "vencido"/"vencida";
  "fecha de vencimiento" solo para la fecha). Buckets: al día / 1–7 / 8–14 /
  15–30 / +30 días de atraso.
- Severidad por badge + color de monto, no tiñendo la fila entera.

El formato de celdas de negocio de Hoy se extrajo a `lib/hoy-debtor-cell-format.ts`
(puro, testeado): `debtorHasOverdueAmount`, `formatDebtorDaysCell`, `debtorRiskBadge`.

## Hoy — Clientes con deuda (migrado)

| Aspecto | Antes | Después |
|---|---|---|
| Desktop | `<table>` a medida | `CopilotResponsiveTable` + `expandedRow` |
| Mobile | cards propias | cards propias (sin cambios) |
| Columnas | Cliente/Moneda/Deuda/Atrasado/Días/Acción | idénticas |
| Numérico | sin alinear | right + tabular-nums |
| Expansión | `<tr>` detalle manual | `expandedRow` canónico (aria-expanded/controls) |
| Paginación/totales/orden | — | **sin cambios** (`ClientsWithDebtSection` intacto) |

**Lógica NO tocada:** dedupe (`dedupeDebtorRows`), orden (`sortDebtorRowsByAging`),
totales por moneda / `canonicalTotals`, `deuda`/`vencido`/`overdueDays`, `deepLink`,
acciones (Ver ficha / WA / Mail), paginación server-agnóstica del section.

## Matriz — inventario global de tablas

| Módulo | Ruta | Archivo | Implementación | Estado |
|---|---|---|---|---|
| Hoy · Clientes con deuda | /copilot/hoy | hoy-clients-with-debt-section.tsx | CopilotResponsiveTable + expand | **MIGRATED** |
| Ventas · Clientes | /copilot/ventas | ventas-clientes-tab.tsx | CopilotResponsiveTable | CANONICAL |
| Ventas · Servicios/Detalle/Comparativo/Comerciales | /copilot/ventas | ventas-*-tab.tsx | CopilotResponsiveTable | CANONICAL |
| Clientes · Portfolio | /copilot/clientes | clientes-portfolio-table.tsx | CopilotResponsiveTable | CANONICAL |
| Banco · Movimientos | /copilot/movimientos-bancarios | bank-movements-page-client.tsx | CopilotResponsiveTable | CANONICAL |
| Tesorería · Cuentas/Obligaciones/Recibos/Recurrentes | /copilot/tesoreria | treasury-*-panel.tsx | CopilotResponsiveTable | CANONICAL |
| Datos · Entidades | /copilot/datos | copilot-data-table.tsx | CopilotDataTable (propio de Datos) | REUSABLE (no migrar) |
| Integridad · Hallazgos | /copilot/integridad | integridad-client.tsx | `<table>` inline (FASE F) | MIGRATION_PENDING |
| Cartera · explorer / aging | /copilot/cartera | client-debt-explorer.tsx, aging-analytics.tsx | mixto | MIGRATION_PENDING |
| Reportes · deudores | /copilot/reportes | debtors-*-dialog.tsx | `<table>` inline | MIGRATION_PENDING |
| Admin · usuarios/permisos | /copilot/admin | (varios) | mixto | MIGRATION_PENDING (bajo riesgo/beneficio) |

## Tablas pendientes

| Módulo | Archivo | Razón | Prioridad | Próximo paso |
|---|---|---|---|---|
| Integridad | integridad-client.tsx | evitar bloquear FASE F.1 | media | migrar presentación tras F.1 |
| Cartera | client-debt-explorer.tsx | superficie compleja, riesgo financiero | media | migrar con guard de totales |
| Reportes deudores | debtors-report-dialog.tsx | tabla en diálogo/preview | baja | migrar a variante compacta |
| Admin/usuarios | admin | bajo beneficio, alto detalle | baja | documentado |

## Variantes (comparten tokens/base; no duplican HTML)

| Variante | Uso | Densidad | Responsive | Acciones |
|---|---|---|---|---|
| Estándar | Ventas/Clientes/Banco/Tesorería | media | cards mobile | fila |
| Financiera + expand | Hoy · deuda | media | cards mobile / expand desktop | fila + detalle |
| Datos (propia) | /copilot/datos | compacta | sidebar | CRUD |

## Qué NUNCA debe ponerse en la tabla base

- Cálculos financieros, queries, resolución de moneda, reglas de atraso/aging.
- Estado de datos (fetch/paginación server) — el consumer lo controla.
- Reglas de negocio específicas de un módulo.
