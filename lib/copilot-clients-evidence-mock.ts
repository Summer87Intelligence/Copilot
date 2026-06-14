import type { CopilotDocumentItem, CopilotMovementItem, CopilotSeverity } from "@/lib/copilot-alerts-evidence-mock";

/** Clave estable alineada con filas de `MOCK_CLIENTS` (por nombre). */
export const CLIENT_EVIDENCE_ID_BY_NAME: Record<string, string> = {
  "Metalúrgica Delta": "metalurgica-delta",
  "Distribuidora Sur": "distribuidora-sur",
  "Comercial Andina": "comercial-andina",
  "Retail Express": "retail-express",
  "Logística Oeste": "logistica-oeste",
};

export type CopilotClientAccountState = {
  invoicesIssued: string;
  overdue: string;
  partialPayments: string;
  pendingBalance: string;
  balanceSeverity: CopilotSeverity;
};

export type CopilotClientEvidenceCase = {
  clientId: string;
  clientName: string;
  subtitle: string;
  updatedAt: string;
  primarySeverity: CopilotSeverity;
  summary: {
    billingTotal: string;
    debtTotal: string;
    share: string;
    riskLabel: string;
    riskSeverity: CopilotSeverity;
    narrative: string;
  };
  accountState: CopilotClientAccountState;
  movements: CopilotMovementItem[];
  documents: CopilotDocumentItem[];
  aiRead: {
    priority: string;
    pattern: string;
    recommend: string;
  };
};

export const COPILOT_CLIENTS_EVIDENCE_MOCK: Record<string, CopilotClientEvidenceCase> = {
  "metalurgica-delta": {
    clientId: "metalurgica-delta",
    clientName: "Metalúrgica Delta",
    subtitle: "Alto ticket y mora concentrada: prioridad de cobranza y seguimiento diario.",
    updatedAt: "01 abr 2026 · 11:20",
    primarySeverity: "critical",
    summary: {
      billingTotal: "$ 4.200.000",
      debtTotal: "$ 340.000",
      share: "23%",
      riskLabel: "Alto",
      riskSeverity: "high",
      narrative:
        "Cliente estratégico por volumen; el vencido impacta de forma desproporcionada en la cartera total y en el flujo de caja proyectado.",
    },
    accountState: {
      invoicesIssued: "12 comprobantes · $ 4.200.000",
      overdue: "2 facturas · $ 340.000 vencidas",
      partialPayments: "3 pagos parciales en el período",
      pendingBalance: "$ 340.000 pendiente (vencido)",
      balanceSeverity: "critical",
    },
    movements: [
      {
        id: "md-m1",
        label: "Emisión",
        detail: "FAC-000412 — venta con plazo 30 días.",
        date: "28 feb 2026",
        severity: "medium",
      },
      {
        id: "md-m2",
        label: "Vencimiento",
        detail: "Sin acreditación total en fecha.",
        date: "30 mar 2026",
        severity: "critical",
      },
      {
        id: "md-m3",
        label: "Pago parcial",
        detail: "Ingreso parcial acreditado.",
        date: "02 abr 2026",
        severity: "high",
      },
      {
        id: "md-m4",
        label: "Recibo",
        detail: "REC-00918 — aplicación a factura vencida.",
        date: "03 abr 2026",
        severity: "medium",
      },
      {
        id: "md-m5",
        label: "Transferencia",
        detail: "TRX-55102 — en conciliación bancaria.",
        date: "04 abr 2026",
        severity: "high",
      },
      {
        id: "md-m6",
        label: "Nota de crédito",
        detail: "NC-00044 — ajuste comercial menor.",
        date: "05 abr 2026",
        severity: "low",
      },
    ],
    documents: [
      {
        id: "md-d1",
        name: "FAC-000412",
        type: "Factura",
        status: "Atrasada",
        severity: "critical",
      },
      {
        id: "md-d2",
        name: "REC-00918",
        type: "Recibo",
        status: "Aplicado parcial",
        severity: "high",
      },
      {
        id: "md-d3",
        name: "TRX-55102",
        type: "Transferencia",
        status: "Pendiente de conciliación",
        severity: "high",
      },
      {
        id: "md-d4",
        name: "NC-00044",
        type: "Nota de crédito",
        status: "Emitida",
        severity: "low",
      },
    ],
    aiRead: {
      priority:
        "Cliente prioritario por monto vencido y peso en cartera: conviene cerrar fecha de pago antes que ampliar plazo.",
      pattern:
        "Historial de promesas cumplidas a medias y nuevos vencimientos en la misma ventana de cobro.",
      recommend:
        "Llamada ejecutiva, acuerdo por escrito y seguimiento diario hasta acreditación; evitar envíos sin confirmación de pago.",
    },
  },
  "retail-express": {
    clientId: "retail-express",
    clientName: "Retail Express",
    subtitle: "Alta facturación con dependencia relevante: vigilar concentración y plazos.",
    updatedAt: "01 abr 2026 · 10:05",
    primarySeverity: "high",
    summary: {
      billingTotal: "$ 1.980.000",
      debtTotal: "$ 430.000",
      share: "11%",
      riskLabel: "Medio",
      riskSeverity: "medium",
      narrative:
        "Participación relevante en ventas con saldo vencido moderado; el riesgo principal es exposición conjunta con otros canales retail.",
    },
    accountState: {
      invoicesIssued: "18 comprobantes · $ 1.980.000",
      overdue: "1 factura · $ 180.000 vencida (resto en plazo)",
      partialPayments: "6 pagos parciales",
      pendingBalance: "$ 430.000 total pendiente",
      balanceSeverity: "high",
    },
    movements: [
      {
        id: "re-m1",
        label: "Emisión",
        detail: "FAC-VTA-881 — pedido retail pico.",
        date: "15 mar 2026",
        severity: "medium",
      },
      {
        id: "re-m2",
        label: "Vencimiento",
        detail: "Plazo neto 15 días — saldo parcial.",
        date: "31 mar 2026",
        severity: "high",
      },
      {
        id: "re-m3",
        label: "Pago",
        detail: "Acreditación mayoritaria.",
        date: "01 abr 2026",
        severity: "medium",
      },
      {
        id: "re-m4",
        label: "Recibo",
        detail: "REC-VTA-210.",
        date: "02 abr 2026",
        severity: "low",
      },
      {
        id: "re-m5",
        label: "Transferencia",
        detail: "TRX-VTA-517 — acreditada.",
        date: "02 abr 2026",
        severity: "low",
      },
    ],
    documents: [
      {
        id: "re-d1",
        name: "FAC-VTA-881",
        type: "Factura",
        status: "Parcialmente pagada",
        severity: "high",
      },
      {
        id: "re-d2",
        name: "REC-VTA-210",
        type: "Recibo",
        status: "Aplicado",
        severity: "medium",
      },
      {
        id: "re-d3",
        name: "TRX-VTA-517",
        type: "Transferencia",
        status: "Acreditada",
        severity: "low",
      },
      {
        id: "re-d4",
        name: "NC-VTA-039",
        type: "Nota de crédito",
        status: "Emitida",
        severity: "medium",
      },
    ],
    aiRead: {
      priority:
        "Cuenta a vigilar por concentración sectorial: no es la deuda máxima, pero sí el acoplamiento con el canal retail.",
      pattern:
        "Facturación alta con rotación de stock y pagos fraccionados; el vencido aparece en ciclos cortos.",
      recommend:
        "Condiciones comerciales acotadas y cupo revisado trimestral; alinear promociones con calendario de cobro.",
    },
  },
  "distribuidora-sur": {
    clientId: "distribuidora-sur",
    clientName: "Distribuidora Sur",
    subtitle: "Comportamiento de pago sólido: bajo riesgo operativo y relación estable.",
    updatedAt: "31 mar 2026 · 16:40",
    primarySeverity: "low",
    summary: {
      billingTotal: "$ 3.100.000",
      debtTotal: "$ 0",
      share: "17%",
      riskLabel: "Medio",
      riskSeverity: "medium",
      narrative:
        "Sin saldo vencido y pagos al día; la etiqueta de riesgo refleja exposición por volumen, no por mora.",
    },
    accountState: {
      invoicesIssued: "14 comprobantes · $ 3.100.000",
      overdue: "Sin facturas vencidas",
      partialPayments: "2 pagos parciales puntuales (cerrados)",
      pendingBalance: "$ 0 pendiente",
      balanceSeverity: "low",
    },
    movements: [
      {
        id: "ds-m1",
        label: "Emisión",
        detail: "FAC-DS-302 — término estándar.",
        date: "20 mar 2026",
        severity: "low",
      },
      {
        id: "ds-m2",
        label: "Vencimiento",
        detail: "Cumplimiento en fecha.",
        date: "05 abr 2026",
        severity: "low",
      },
      {
        id: "ds-m3",
        label: "Pago",
        detail: "Pago total acreditado.",
        date: "05 abr 2026",
        severity: "low",
      },
      {
        id: "ds-m4",
        label: "Recibo",
        detail: "REC-DS-088.",
        date: "05 abr 2026",
        severity: "low",
      },
      {
        id: "ds-m5",
        label: "Transferencia",
        detail: "TRX-DS-901.",
        date: "05 abr 2026",
        severity: "low",
      },
    ],
    documents: [
      {
        id: "ds-d1",
        name: "FAC-DS-302",
        type: "Factura",
        status: "Pagada",
        severity: "low",
      },
      {
        id: "ds-d2",
        name: "REC-DS-088",
        type: "Recibo",
        status: "Cerrado",
        severity: "low",
      },
      {
        id: "ds-d3",
        name: "TRX-DS-901",
        type: "Transferencia",
        status: "Acreditada",
        severity: "low",
      },
      {
        id: "ds-d4",
        name: "NC-DS-011",
        type: "Nota de crédito",
        status: "No aplica en período",
        severity: "low",
      },
    ],
    aiRead: {
      priority:
        "Cliente saludable para priorizar en expansión comercial y referencias; bajo costo de gestión de cobranza.",
      pattern:
        "Pagos recurrentes dentro de plazo y sin renegociaciones forzadas en los últimos 90 días.",
      recommend:
        "Mantener condiciones actuales y explorar upsell; usar como contrapeso en cartera frente a cuentas tensionadas.",
    },
  },
  "comercial-andina": {
    clientId: "comercial-andina",
    clientName: "Comercial Andina",
    subtitle: "Cartera estable con mora acotada y buen historial de regularización.",
    updatedAt: "30 mar 2026 · 14:00",
    primarySeverity: "medium",
    summary: {
      billingTotal: "$ 2.450.000",
      debtTotal: "$ 120.000",
      share: "14%",
      riskLabel: "Bajo",
      riskSeverity: "low",
      narrative:
        "Deuda acotada y en seguimiento; el foco es cerrar el saldo menor sin tensionar la relación comercial.",
    },
    accountState: {
      invoicesIssued: "10 comprobantes · $ 2.450.000",
      overdue: "1 factura · $ 120.000 próxima a vencer",
      partialPayments: "1 pago parcial reciente",
      pendingBalance: "$ 120.000 pendiente",
      balanceSeverity: "medium",
    },
    movements: [
      {
        id: "ca-m1",
        label: "Emisión",
        detail: "FAC-CA-210.",
        date: "22 mar 2026",
        severity: "low",
      },
      {
        id: "ca-m2",
        label: "Vencimiento",
        detail: "Próximo vencimiento en 5 días.",
        date: "06 abr 2026",
        severity: "medium",
      },
      {
        id: "ca-m3",
        label: "Pago parcial",
        detail: "Anticipo registrado.",
        date: "28 mar 2026",
        severity: "low",
      },
      {
        id: "ca-m4",
        label: "Recibo",
        detail: "REC-CA-055.",
        date: "28 mar 2026",
        severity: "low",
      },
      {
        id: "ca-m5",
        label: "Transferencia",
        detail: "TRX-CA-330.",
        date: "28 mar 2026",
        severity: "low",
      },
    ],
    documents: [
      {
        id: "ca-d1",
        name: "FAC-CA-210",
        type: "Factura",
        status: "En término",
        severity: "medium",
      },
      {
        id: "ca-d2",
        name: "REC-CA-055",
        type: "Recibo",
        status: "Parcial",
        severity: "low",
      },
      {
        id: "ca-d3",
        name: "TRX-CA-330",
        type: "Transferencia",
        status: "Acreditada",
        severity: "low",
      },
      {
        id: "ca-d4",
        name: "NC-CA-002",
        type: "Nota de crédito",
        status: "—",
        severity: "low",
      },
    ],
    aiRead: {
      priority:
        "Seguimiento estándar: evitar que un saldo chico pase a mora por omisión administrativa.",
      pattern:
        "Cliente con buen historial; la alerta es preventiva por proximidad de vencimiento.",
      recommend:
        "Recordatorio amable y confirmación de fecha; sin necesidad de escalar si se acredita en ventana acordada.",
    },
  },
  "logistica-oeste": {
    clientId: "logistica-oeste",
    clientName: "Logística Oeste",
    subtitle: "Cuenta al día y volumen moderado: perfil de bajo mantenimiento.",
    updatedAt: "29 mar 2026 · 09:10",
    primarySeverity: "low",
    summary: {
      billingTotal: "$ 1.650.000",
      debtTotal: "$ 0",
      share: "9%",
      riskLabel: "Bajo",
      riskSeverity: "low",
      narrative:
        "Sin exposición vencida; adecuado como ancla de diversificación frente a clientes de mayor ticket.",
    },
    accountState: {
      invoicesIssued: "9 comprobantes · $ 1.650.000",
      overdue: "Sin vencidos",
      partialPayments: "Ninguno abierto",
      pendingBalance: "$ 0",
      balanceSeverity: "low",
    },
    movements: [
      {
        id: "lo-m1",
        label: "Emisión",
        detail: "FAC-LO-140.",
        date: "18 mar 2026",
        severity: "low",
      },
      {
        id: "lo-m2",
        label: "Pago",
        detail: "Pago según condición.",
        date: "02 abr 2026",
        severity: "low",
      },
      {
        id: "lo-m3",
        label: "Recibo",
        detail: "REC-LO-041.",
        date: "02 abr 2026",
        severity: "low",
      },
      {
        id: "lo-m4",
        label: "Transferencia",
        detail: "TRX-LO-220.",
        date: "02 abr 2026",
        severity: "low",
      },
    ],
    documents: [
      {
        id: "lo-d1",
        name: "FAC-LO-140",
        type: "Factura",
        status: "Pagada",
        severity: "low",
      },
      {
        id: "lo-d2",
        name: "REC-LO-041",
        type: "Recibo",
        status: "Cerrado",
        severity: "low",
      },
      {
        id: "lo-d3",
        name: "TRX-LO-220",
        type: "Transferencia",
        status: "Acreditada",
        severity: "low",
      },
      {
        id: "lo-d4",
        name: "NC-LO-004",
        type: "Nota de crédito",
        status: "—",
        severity: "low",
      },
    ],
    aiRead: {
      priority:
        "Cliente estable; útil como diversificador de ingresos sin cargar gestión de cobranza.",
      pattern:
        "Ciclos de pago predecibles y sin incidentes en los últimos movimientos registrados.",
      recommend:
        "Mantener relación y evaluar oportunidades de volumen incremental sin relajar controles de crédito.",
    },
  },
};

export function getClientEvidenceCaseByName(name: string): CopilotClientEvidenceCase | null {
  const id = CLIENT_EVIDENCE_ID_BY_NAME[name];
  if (!id) return null;
  return COPILOT_CLIENTS_EVIDENCE_MOCK[id] ?? null;
}
