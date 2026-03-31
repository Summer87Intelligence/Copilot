import {
  getSnapshotSignals,
  type DashboardSnapshot,
} from "@/lib/dashboard-data";

export function getTodayActions(snapshot: DashboardSnapshot): string[] {
  const sig = getSnapshotSignals(snapshot);
  const actions: string[] = [];

  if (sig.cashStress) {
    actions.push(
      "Acordá con finanzas el saldo disponible hoy y programá cobros pendientes antes de autorizar nuevos pagos."
    );
  }
  if (sig.collectionDrag) {
    actions.push(
      "Llamá o escribí a los clientes con mayor saldo vencido y cerrá fecha de pago para esta semana."
    );
  }
  if (sig.concentrationRisk) {
    actions.push(
      "Pedí un listado del top 3 de clientes por facturación y anotá una acción concreta para ampliar base en cada caso."
    );
  }
  if (sig.expensePressure) {
    actions.push(
      "Revisá dos cuentas de gastos que hayan subido este mes y decidí si congelás, bajás o postergás."
    );
  }

  if (actions.length === 0 && sig.isCalmPeriod) {
    return [
      "Actualizá la proyección de caja a 30–45 días y guardala para la review semanal.",
      "Repasá vencimientos de la semana y asigná responsable de seguimiento a cada cobro relevante.",
      "Mirá presupuesto vs. ejecutado y marcá un solo ajuste preventivo si aparece algún desvío leve.",
    ];
  }

  if (actions.length === 0) {
    return [
      "Definí tres contactos de cobranza prioritarios para hoy y dejá registro del resultado al cierre.",
      "Cruzá gastos acumulados con presupuesto y elevá cualquier desvío sostenido a decisión.",
    ];
  }

  if (actions.length === 1) {
    actions.push(
      "Reservá 15 minutos al final del día para revisar movimientos de caja y confirmar cobros esperados."
    );
  }

  return actions.slice(0, 3);
}
