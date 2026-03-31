/**
 * Agregación conceptual: NormalizedFinancePayload → DashboardSnapshot.
 * Sin persistencia ni UI: puente entre datos contables normalizados y el Copilot.
 *
 * Limitaciones explícitas (ver comentarios en cuerpo):
 * - Período "mensual" = todo el lote recibido; el job de sync debe acotar fechas.
 * - Moneda: se suma en bruto; multi-moneda real exige FX y moneda funcional.
 * - Crecimiento de gastos exige serie histórica (no disponible en un solo payload).
 */

import type { DashboardSnapshot } from "@/lib/dashboard-data";
import type {
  NormalizedCashMovement,
  NormalizedExpense,
  NormalizedFinancePayload,
  NormalizedInvoice,
} from "@/types/normalized-finance";

// ---------------------------------------------------------------------------
// Filtro de tenant (defensa en profundidad si el lote mezcla datos por error)
// ---------------------------------------------------------------------------

function invoicesForCompany(
  payload: NormalizedFinancePayload,
): NormalizedInvoice[] {
  return payload.invoices.filter((i) => i.companyId === payload.companyId);
}

function expensesForCompany(
  payload: NormalizedFinancePayload,
): NormalizedExpense[] {
  return payload.expenses.filter((e) => e.companyId === payload.companyId);
}

function cashMovementsForCompany(
  payload: NormalizedFinancePayload,
): NormalizedCashMovement[] {
  return payload.cashMovements.filter((m) => m.companyId === payload.companyId);
}

// ---------------------------------------------------------------------------
// Helpers solicitados
// ---------------------------------------------------------------------------

/**
 * Facturas que cuentan como ventas facturadas en el lote (período implícito del sync).
 * Excluye borrador y anuladas. No filtra por issueDate aquí: el contrato de ventana
 * temporal debe aplicarse al armar el payload o en una capa previa.
 */
function invoicesCountedAsBilledSales(
  invoices: NormalizedInvoice[],
): NormalizedInvoice[] {
  return invoices.filter(
    (inv) => inv.status !== "draft" && inv.status !== "cancelled",
  );
}

/**
 * Suma de importes de factura (`totalAmount`) para KPI de ventas del mes.
 * Usa solo facturas emitidas/en cobro/pagadas según `invoicesCountedAsBilledSales`.
 * Pendiente: neto de IVA, notas de crédito y moneda única — ver contrato contable real.
 */
export function sumInvoices(invoices: NormalizedInvoice[]): number {
  const rows = invoicesCountedAsBilledSales(invoices);
  let sum = 0;
  for (const inv of rows) {
    if (Number.isFinite(inv.totalAmount)) sum += inv.totalAmount;
  }
  return sum;
}

/**
 * Suma de gastos del lote (período implícito). `amount` se asume positivo como egreso.
 * Pendiente: signo contable, gastos revertidos, prorrateos.
 */
export function sumExpenses(expenses: NormalizedExpense[]): number {
  let sum = 0;
  for (const e of expenses) {
    if (Number.isFinite(e.amount)) sum += Math.abs(e.amount);
  }
  return sum;
}

/**
 * Posición de caja simplificada: entradas menos salidas explícitas.
 * - inflow: suma `amount`
 * - outflow: resta `amount`
 * - transfer: 0 neto (es movimiento entre cuentas; modelo de una sola caja agregada)
 * - adjustment: suma `amount` con signo (convención del ERP; documentar al integrar)
 * - unknown: ignorado (evita doble conteo sin reglas)
 */
export function calculateCash(movements: NormalizedCashMovement[]): number {
  let net = 0;
  for (const m of movements) {
    if (!Number.isFinite(m.amount)) continue;
    switch (m.kind) {
      case "inflow":
        net += m.amount;
        break;
      case "outflow":
        net -= m.amount;
        break;
      case "transfer":
        break;
      case "adjustment":
        net += m.amount;
        break;
      default:
        break;
    }
  }
  return net;
}

/**
 * Concentración del cliente con mayor facturación sobre el total facturado del lote.
 * Devuelve porcentaje 0–100 alineado a `topClientsConcentration` del dashboard.
 * Facturas sin `clientExternalId` van a un bucket anónimo (sigue siendo un "cliente" agregado).
 * Pendiente: ventas por rubro, grupo económico, NC.
 */
export function calculateTopClientConcentration(
  invoices: NormalizedInvoice[],
): number {
  const billed = invoicesCountedAsBilledSales(invoices);
  const byClient = new Map<string, number>();
  let total = 0;
  for (const inv of billed) {
    if (!Number.isFinite(inv.totalAmount) || inv.totalAmount <= 0) continue;
    const key = inv.clientExternalId ?? "__no_client__";
    byClient.set(key, (byClient.get(key) ?? 0) + inv.totalAmount);
    total += inv.totalAmount;
  }
  if (total <= 0) return 0;
  let max = 0;
  for (const v of byClient.values()) {
    if (v > max) max = v;
  }
  return (max / total) * 100;
}

// ---------------------------------------------------------------------------
// Cobranzas pendientes
// ---------------------------------------------------------------------------

/**
 * Estimación de cartera pendiente a partir de facturas.
 * Prioriza `outstandingAmount` del ERP. Si falta, usa `totalAmount` para emitidas
 * y parcialmente pagadas; pagadas y borrador/anuladas → 0.
 */
function sumPendingCollectionsFromInvoices(
  invoices: NormalizedInvoice[],
): number {
  let sum = 0;
  for (const inv of invoices) {
    if (inv.status === "cancelled" || inv.status === "draft") continue;
    if (inv.status === "paid") continue;

    if (
      inv.outstandingAmount != null &&
      Number.isFinite(inv.outstandingAmount)
    ) {
      sum += Math.max(0, inv.outstandingAmount);
      continue;
    }

    if (inv.status === "issued" || inv.status === "partially_paid") {
      if (Number.isFinite(inv.totalAmount)) sum += Math.max(0, inv.totalAmount);
    } else if (inv.status === "unknown" && Number.isFinite(inv.totalAmount)) {
      sum += Math.max(0, inv.totalAmount);
    }
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Riesgo de caja en días (proxy de runway)
// ---------------------------------------------------------------------------

/**
 * Días de cobertura aproximados: caja / (gasto diario medio del mes).
 * Si no hay gastos, devuelve un techo alto si hay caja, si no 0 (evita Inf/NaN).
 */
function estimateCashRiskDays(
  cashAvailable: number,
  monthlyExpenses: number,
): number {
  const daily = monthlyExpenses / 30;
  if (daily <= 0) {
    return cashAvailable > 0 ? 999 : 0;
  }
  const raw = cashAvailable / daily;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.round(raw));
}

function toFiniteSnapshotNumber(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Construye un `DashboardSnapshot` a partir de un lote normalizado.
 * No persiste ni llama al dashboard: uso futuro desde jobs de sync o pruebas.
 */
export function buildDashboardSnapshotFromNormalized(
  payload: NormalizedFinancePayload,
): DashboardSnapshot {
  const invoices = invoicesForCompany(payload);
  const expenses = expensesForCompany(payload);
  const movements = cashMovementsForCompany(payload);

  const cashAvailable = toFiniteSnapshotNumber(calculateCash(movements), 0);
  const monthlySales = toFiniteSnapshotNumber(sumInvoices(invoices), 0);
  const pendingCollections = toFiniteSnapshotNumber(
    sumPendingCollectionsFromInvoices(invoices),
    0,
  );
  const monthlyExpenses = toFiniteSnapshotNumber(sumExpenses(expenses), 0);
  const cashRiskDays = estimateCashRiskDays(cashAvailable, monthlyExpenses);
  const topClientsConcentration = toFiniteSnapshotNumber(
    calculateTopClientConcentration(invoices),
    0,
  );

  /**
   * Requiere comparar contra gastos del período anterior (snapshot previo o serie).
   * Valor neutro para no disparar alertas de "presión de gastos" hasta tener histórico.
   */
  const expensesGrowthPercent = 0;

  return {
    cashAvailable,
    monthlySales,
    pendingCollections,
    monthlyExpenses,
    cashRiskDays,
    topClientsConcentration,
    expensesGrowthPercent,
  };
}
