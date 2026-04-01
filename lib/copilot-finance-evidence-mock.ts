import type {
  CopilotMovementItem,
  CopilotSeverity,
} from "@/lib/copilot-alerts-evidence-mock";

export type CopilotFinanceIndicatorId =
  | "ingresos_operativos"
  | "gastos_totales"
  | "margen_estimado"
  | "flujo_caja";

export type CopilotFinanceCompositionItem = {
  id: string;
  category: string;
  subtotal: string;
  detail: string;
  severity: CopilotSeverity;
};

export type CopilotFinanceMovementItem = CopilotMovementItem & {
  amount: string;
};

export type CopilotFinanceDocumentItem = {
  id: string;
  name: string;
  type:
    | "Factura"
    | "Recibo"
    | "Transferencia"
    | "Orden de pago"
    | "Nota de crédito"
    | "Nota de débito";
  status: string;
  severity: CopilotSeverity;
};

export type CopilotFinanceEvidenceCase = {
  indicatorId: CopilotFinanceIndicatorId;
  title: string;
  subtitle: string;
  updatedAt: string;
  primarySeverity: CopilotSeverity;
  summary: {
    executive: string;
    represents: string;
    importance: string;
  };
  composition: CopilotFinanceCompositionItem[];
  movements: CopilotFinanceMovementItem[];
  documents: CopilotFinanceDocumentItem[];
  aiRead: {
    pattern: string;
    why: string;
    recommend: string;
  };
};

export const COPILOT_FINANCE_EVIDENCE_MOCK: Record<
  CopilotFinanceIndicatorId,
  CopilotFinanceEvidenceCase
> = {
  ingresos_operativos: {
    indicatorId: "ingresos_operativos",
    title: "Ingresos operativos",
    subtitle: "Facturacion confirmada del mes con foco en calidad de cobro.",
    updatedAt: "01 abr 2026 · 11:45",
    primarySeverity: "medium",
    summary: {
      executive:
        "Los ingresos sostienen el objetivo mensual, pero una fraccion relevante llega por cobranzas parciales.",
      represents:
        "Representa ventas y cobranzas de operacion corriente, sin incluir ingresos extraordinarios.",
      importance:
        "Impacta directamente en caja disponible y en la capacidad de cubrir egresos fijos sin tension.",
    },
    composition: [
      {
        id: "io-c1",
        category: "Canal mayorista",
        subtotal: "$ 9.8 M",
        detail: "Ticket alto con buen ritmo de cobranza.",
        severity: "low",
      },
      {
        id: "io-c2",
        category: "Canal retail",
        subtotal: "$ 5.2 M",
        detail: "Buen volumen, pero mas pagos fraccionados.",
        severity: "medium",
      },
      {
        id: "io-c3",
        category: "Servicios anexos",
        subtotal: "$ 3.2 M",
        detail: "Complementa ingresos con baja volatilidad.",
        severity: "low",
      },
    ],
    movements: [
      {
        id: "io-m1",
        label: "Factura emitida",
        detail: "FAC-ING-902 para cuenta mayorista.",
        amount: "$ 1.240.000",
        date: "27 mar 2026",
        severity: "low",
      },
      {
        id: "io-m2",
        label: "Pago recibido",
        detail: "Cobranza parcial sobre factura de retail.",
        amount: "$ 380.000",
        date: "29 mar 2026",
        severity: "medium",
      },
      {
        id: "io-m3",
        label: "Transferencia enviada",
        detail: "Comision bancaria por acreditacion express.",
        amount: "$ 24.000",
        date: "30 mar 2026",
        severity: "low",
      },
      {
        id: "io-m4",
        label: "Gasto administrativo",
        detail: "Costo de procesamiento comercial asociado.",
        amount: "$ 58.000",
        date: "31 mar 2026",
        severity: "medium",
      },
      {
        id: "io-m5",
        label: "Obligacion proxima",
        detail: "Liquidacion de impuestos sobre ventas del periodo.",
        amount: "$ 210.000",
        date: "04 abr 2026",
        severity: "high",
      },
    ],
    documents: [
      {
        id: "io-d1",
        name: "FAC-ING-902",
        type: "Factura",
        status: "Emitida",
        severity: "low",
      },
      {
        id: "io-d2",
        name: "REC-ING-331",
        type: "Recibo",
        status: "Aplicado parcial",
        severity: "medium",
      },
      {
        id: "io-d3",
        name: "TRX-ING-8181",
        type: "Transferencia",
        status: "Acreditada",
        severity: "low",
      },
      {
        id: "io-d4",
        name: "OP-ING-118",
        type: "Orden de pago",
        status: "Registrada",
        severity: "medium",
      },
      {
        id: "io-d5",
        name: "NC-ING-021",
        type: "Nota de crédito",
        status: "Emitida",
        severity: "low",
      },
    ],
    aiRead: {
      pattern:
        "Se detecta crecimiento de ingresos con aumento en la proporcion de cobranzas parciales sobre retail.",
      why:
        "El indicador esta sano, aunque con tension moderada por calidad de cobro y tiempos de acreditacion.",
      recommend:
        "Fortalecer acuerdos de pago en clientes retail para reducir dispersion de ingreso y mejorar previsibilidad semanal.",
    },
  },
  gastos_totales: {
    indicatorId: "gastos_totales",
    title: "Gastos totales",
    subtitle: "Egresos acumulados del periodo, con foco en control de rubros de mayor peso.",
    updatedAt: "01 abr 2026 · 11:12",
    primarySeverity: "high",
    summary: {
      executive:
        "Los gastos suben por encima del ritmo de ventas en componentes administrativos y de terceros.",
      represents:
        "Incluye costos operativos, administrativos y obligaciones corrientes del mes.",
      importance:
        "Define la presion sobre margen y caja, especialmente cuando se combina con cobranza demorada.",
    },
    composition: [
      {
        id: "gt-c1",
        category: "Operativos",
        subtotal: "$ 6.9 M",
        detail: "Logistica, insumos y costos de distribucion.",
        severity: "medium",
      },
      {
        id: "gt-c2",
        category: "Administrativos",
        subtotal: "$ 3.4 M",
        detail: "Servicios, software y soporte externo.",
        severity: "high",
      },
      {
        id: "gt-c3",
        category: "Financieros e impuestos",
        subtotal: "$ 2.15 M",
        detail: "Impuestos corrientes y cargos bancarios.",
        severity: "high",
      },
    ],
    movements: [
      {
        id: "gt-m1",
        label: "Factura emitida",
        detail: "Proveedor de servicios administrativos.",
        amount: "$ 410.000",
        date: "26 mar 2026",
        severity: "high",
      },
      {
        id: "gt-m2",
        label: "Pago recibido",
        detail: "Reintegro menor por ajuste de proveedor.",
        amount: "$ 42.000",
        date: "28 mar 2026",
        severity: "low",
      },
      {
        id: "gt-m3",
        label: "Transferencia enviada",
        detail: "Pago de nomina y cargas sociales.",
        amount: "$ 1.120.000",
        date: "30 mar 2026",
        severity: "critical",
      },
      {
        id: "gt-m4",
        label: "Gasto administrativo",
        detail: "Renovacion de licencias anuales.",
        amount: "$ 190.000",
        date: "31 mar 2026",
        severity: "high",
      },
      {
        id: "gt-m5",
        label: "Obligacion proxima",
        detail: "Vencimiento de proveedor clave.",
        amount: "$ 530.000",
        date: "03 abr 2026",
        severity: "high",
      },
    ],
    documents: [
      {
        id: "gt-d1",
        name: "FAC-GAS-744",
        type: "Factura",
        status: "Pendiente de pago",
        severity: "high",
      },
      {
        id: "gt-d2",
        name: "REC-GAS-103",
        type: "Recibo",
        status: "Aplicado",
        severity: "low",
      },
      {
        id: "gt-d3",
        name: "TRX-GAS-9182",
        type: "Transferencia",
        status: "Acreditada",
        severity: "critical",
      },
      {
        id: "gt-d4",
        name: "OP-GAS-288",
        type: "Orden de pago",
        status: "Programada",
        severity: "high",
      },
      {
        id: "gt-d5",
        name: "ND-GAS-011",
        type: "Nota de crédito",
        status: "No aplica",
        severity: "low",
      },
    ],
    aiRead: {
      pattern:
        "Se observa incremento sostenido en gastos administrativos y pagos concentrados en la misma ventana semanal.",
      why:
        "El indicador esta tensionado por montos altos de salida que reducen flexibilidad de caja en el corto plazo.",
      recommend:
        "Escalonar pagos no criticos y renegociar dos contratos administrativos para recuperar margen operativo.",
    },
  },
  margen_estimado: {
    indicatorId: "margen_estimado",
    title: "Margen estimado del mes",
    subtitle: "Relacion entre ingresos y gastos para medir eficiencia financiera.",
    updatedAt: "01 abr 2026 · 10:56",
    primarySeverity: "medium",
    summary: {
      executive:
        "El margen se mantiene positivo, aunque con presion por aumento de costos y cobranza parcialmente diferida.",
      represents:
        "Es el porcentaje estimado de resultado operativo respecto de ingresos del mes.",
      importance:
        "Permite anticipar si la operacion gana o pierde aire financiero antes del cierre contable.",
    },
    composition: [
      {
        id: "me-c1",
        category: "Ingresos netos",
        subtotal: "$ 18.2 M",
        detail: "Base de facturacion operativa.",
        severity: "low",
      },
      {
        id: "me-c2",
        category: "Gastos directos",
        subtotal: "$ 8.7 M",
        detail: "Costos vinculados a produccion y entrega.",
        severity: "medium",
      },
      {
        id: "me-c3",
        category: "Gastos indirectos",
        subtotal: "$ 3.75 M",
        detail: "Administrativos y financieros.",
        severity: "high",
      },
    ],
    movements: [
      {
        id: "me-m1",
        label: "Factura emitida",
        detail: "Venta mayorista de cierre de mes.",
        amount: "$ 980.000",
        date: "29 mar 2026",
        severity: "low",
      },
      {
        id: "me-m2",
        label: "Pago recibido",
        detail: "Ingreso parcial sobre cartera vencida.",
        amount: "$ 260.000",
        date: "30 mar 2026",
        severity: "medium",
      },
      {
        id: "me-m3",
        label: "Transferencia enviada",
        detail: "Pago de proveedor de insumos criticos.",
        amount: "$ 470.000",
        date: "31 mar 2026",
        severity: "high",
      },
      {
        id: "me-m4",
        label: "Gasto administrativo",
        detail: "Ajuste por servicios de terceros.",
        amount: "$ 130.000",
        date: "31 mar 2026",
        severity: "high",
      },
      {
        id: "me-m5",
        label: "Obligacion proxima",
        detail: "Cuota impositiva de primera semana.",
        amount: "$ 210.000",
        date: "04 abr 2026",
        severity: "medium",
      },
    ],
    documents: [
      {
        id: "me-d1",
        name: "FAC-MAR-511",
        type: "Factura",
        status: "Emitida",
        severity: "low",
      },
      {
        id: "me-d2",
        name: "REC-MAR-077",
        type: "Recibo",
        status: "Aplicado",
        severity: "medium",
      },
      {
        id: "me-d3",
        name: "TRX-MAR-9003",
        type: "Transferencia",
        status: "Acreditada",
        severity: "high",
      },
      {
        id: "me-d4",
        name: "OP-MAR-129",
        type: "Orden de pago",
        status: "Programada",
        severity: "medium",
      },
      {
        id: "me-d5",
        name: "NC-MAR-014",
        type: "Nota de crédito",
        status: "Emitida",
        severity: "low",
      },
    ],
    aiRead: {
      pattern:
        "El margen mejora por volumen comercial, pero pierde traccion por crecimiento de costos indirectos.",
      why:
        "Se considera en observacion media: no hay deterioro critico, pero si señales de compresion gradual.",
      recommend:
        "Atacar costos indirectos de bajo retorno y reforzar cobranza temprana para sostener el margen en proximo ciclo.",
    },
  },
  flujo_caja: {
    indicatorId: "flujo_caja",
    title: "Flujo de caja semanal",
    subtitle: "Entradas y salidas por semana para anticipar tension operativa.",
    updatedAt: "01 abr 2026 · 12:02",
    primarySeverity: "critical",
    summary: {
      executive:
        "La caja muestra semanas con salida superior a entrada, elevando riesgo de bache de liquidez de corto plazo.",
      represents:
        "Describe movimiento real de efectivo semana a semana, no solo resultado contable.",
      importance:
        "Es clave para asegurar pagos criticos y evitar decisiones reactivas de ultimo minuto.",
    },
    composition: [
      {
        id: "fc-c1",
        category: "Entradas confirmadas",
        subtotal: "$ 16.7 M",
        detail: "Cobros ya acreditados o con alta probabilidad.",
        severity: "medium",
      },
      {
        id: "fc-c2",
        category: "Salidas obligatorias",
        subtotal: "$ 15.5 M",
        detail: "Nomina, impuestos y proveedores clave.",
        severity: "critical",
      },
      {
        id: "fc-c3",
        category: "Salidas diferibles",
        subtotal: "$ 1.8 M",
        detail: "Gastos con margen de reprogramacion.",
        severity: "high",
      },
    ],
    movements: [
      {
        id: "fc-m1",
        label: "Factura emitida",
        detail: "Cuenta clave con plazo extendido.",
        amount: "$ 720.000",
        date: "27 mar 2026",
        severity: "medium",
      },
      {
        id: "fc-m2",
        label: "Pago recibido",
        detail: "Cobro parcial de cartera vencida.",
        amount: "$ 290.000",
        date: "29 mar 2026",
        severity: "high",
      },
      {
        id: "fc-m3",
        label: "Transferencia enviada",
        detail: "Pago de sueldos y cargas.",
        amount: "$ 1.120.000",
        date: "30 mar 2026",
        severity: "critical",
      },
      {
        id: "fc-m4",
        label: "Gasto administrativo",
        detail: "Servicios recurrentes de plataforma.",
        amount: "$ 95.000",
        date: "31 mar 2026",
        severity: "medium",
      },
      {
        id: "fc-m5",
        label: "Obligacion proxima",
        detail: "Impuesto mensual con vencimiento inmediato.",
        amount: "$ 430.000",
        date: "03 abr 2026",
        severity: "critical",
      },
    ],
    documents: [
      {
        id: "fc-d1",
        name: "FAC-CAJ-390",
        type: "Factura",
        status: "Emitida",
        severity: "medium",
      },
      {
        id: "fc-d2",
        name: "REC-CAJ-062",
        type: "Recibo",
        status: "Aplicado parcial",
        severity: "high",
      },
      {
        id: "fc-d3",
        name: "TRX-CAJ-7720",
        type: "Transferencia",
        status: "Acreditada",
        severity: "critical",
      },
      {
        id: "fc-d4",
        name: "OP-CAJ-411",
        type: "Orden de pago",
        status: "Pendiente",
        severity: "critical",
      },
      {
        id: "fc-d5",
        name: "ND-CAJ-007",
        type: "Nota de crédito",
        status: "No aplica",
        severity: "low",
      },
    ],
    aiRead: {
      pattern:
        "El sistema detecta concentracion de egresos criticos dentro de dos semanas con entrada de caja fragmentada.",
      why:
        "Indicador en riesgo por descalce temporal entre cobranzas y obligaciones inmediatas.",
      recommend:
        "Adelantar cobros de dos cuentas prioritarias y reprogramar gastos diferibles para proteger la liquidez semanal.",
    },
  },
};
