export type CopilotSeverity = "critical" | "high" | "medium" | "low";

export type CopilotEvidenceRecord = {
  id: string;
  type: string;
  description: string;
  amount?: string;
  date: string;
  severity: CopilotSeverity;
};

export type CopilotMovementItem = {
  id: string;
  label: string;
  detail: string;
  date: string;
  severity: CopilotSeverity;
};

export type CopilotDocumentItem = {
  id: string;
  name: string;
  type: "Factura" | "Recibo" | "Transferencia" | "Nota de crédito";
  status: string;
  severity: CopilotSeverity;
};

export type CopilotEvidenceCase = {
  alertId: string;
  title: string;
  subtitle: string;
  updatedAt: string;
  primarySeverity: CopilotSeverity;
  summary: {
    executive: string;
    trigger: string;
    impact: string;
    recommendation: string;
  };
  evidence: CopilotEvidenceRecord[];
  movements: CopilotMovementItem[];
  documents: CopilotDocumentItem[];
  aiRead: {
    pattern: string;
    why: string;
    suggest: string;
  };
};

export const COPILOT_ALERTS_EVIDENCE_MOCK: Record<string, CopilotEvidenceCase> = {
  a1: {
    alertId: "a1",
    title: "Flujo de caja tensionado por cobranza lenta",
    subtitle: "Se proyecta una ventana de 10 días con caja por debajo del piso operativo.",
    updatedAt: "01 abr 2026 · 09:42",
    primarySeverity: "critical",
    summary: {
      executive:
        "La empresa mantiene actividad, pero el calendario de cobros no acompaña la salida de pagos fijos de la próxima quincena.",
      trigger:
        "Se combinan facturas vencidas con compromisos de pago ya calendarizados para proveedores y nómina.",
      impact:
        "Sin ajuste, la caja operativa cae bajo el umbral mínimo y aumenta riesgo de incumplir pagos críticos.",
      recommendation:
        "Acelerar recupero de 2 cuentas prioritarias y diferir egresos no esenciales en los próximos 7 días.",
    },
    evidence: [
      {
        id: "a1-e1",
        type: "Cuenta corriente cliente",
        description: "Saldo vencido consolidado en clientes top.",
        amount: "$ 890.000",
        date: "31 mar 2026",
        severity: "critical",
      },
      {
        id: "a1-e2",
        type: "Agenda de pagos",
        description: "Compromisos de proveedores confirmados para la semana.",
        amount: "$ 740.000",
        date: "02 abr 2026",
        severity: "high",
      },
      {
        id: "a1-e3",
        type: "Nómina",
        description: "Pago de sueldos y cargas sociales programado.",
        amount: "$ 1.120.000",
        date: "05 abr 2026",
        severity: "high",
      },
    ],
    movements: [
      {
        id: "a1-m1",
        label: "Factura emitida",
        detail: "Venta a Metalúrgica Delta con plazo 30 días.",
        date: "03 mar 2026",
        severity: "medium",
      },
      {
        id: "a1-m2",
        label: "Vencimiento",
        detail: "Factura supera fecha límite sin acreditación.",
        date: "02 abr 2026",
        severity: "critical",
      },
      {
        id: "a1-m3",
        label: "Pago parcial",
        detail: "Ingreso parcial comprometido por el cliente.",
        date: "04 abr 2026",
        severity: "high",
      },
      {
        id: "a1-m4",
        label: "Diferencia pendiente",
        detail: "Resta pendiente con promesa de pago sin validar.",
        date: "07 abr 2026",
        severity: "high",
      },
      {
        id: "a1-m5",
        label: "Transferencia / recibo",
        detail: "Transferencia en revisión documental.",
        date: "08 abr 2026",
        severity: "medium",
      },
    ],
    documents: [
      {
        id: "a1-d1",
        name: "FAC-000381 Delta",
        type: "Factura",
        status: "Atrasada",
        severity: "critical",
      },
      {
        id: "a1-d2",
        name: "REC-00912 Cobro parcial",
        type: "Recibo",
        status: "Aplicado parcialmente",
        severity: "high",
      },
      {
        id: "a1-d3",
        name: "TRX-445101 Banco Patagonia",
        type: "Transferencia",
        status: "Pendiente de conciliación",
        severity: "medium",
      },
      {
        id: "a1-d4",
        name: "NC-00077 Ajuste comercial",
        type: "Nota de crédito",
        status: "Emitida",
        severity: "low",
      },
    ],
    aiRead: {
      pattern:
        "El sistema detectó una secuencia repetida de cobro tardío en clientes de alto ticket dentro de la misma semana de pagos críticos.",
      why:
        "Clasifica como crítica porque la brecha temporal entre ingresos y egresos deja a la operación sin colchón de caja.",
      suggest:
        "Negociar anticipo con clientes top y reprogramar dos egresos administrativos de menor impacto operativo.",
    },
  },
  a2: {
    alertId: "a2",
    title: "Deuda vencida concentrada en 3 clientes",
    subtitle: "El 62% del vencido total está en cuentas con alto impacto de caja.",
    updatedAt: "01 abr 2026 · 08:55",
    primarySeverity: "critical",
    summary: {
      executive:
        "La mora no está distribuida: se concentra en pocas cuentas y aumenta la dependencia del resultado de pocas gestiones.",
      trigger:
        "Tres facturas superaron vencimiento sin pago total y dos promesas previas no fueron cumplidas.",
      impact:
        "Cada día de retraso incrementa la tensión de liquidez y reduce margen para sostener pagos clave.",
      recommendation:
        "Activar gestión escalonada por prioridad de impacto y cerrar acuerdos de pago con fecha confirmada.",
    },
    evidence: [
      {
        id: "a2-e1",
        type: "Factura vencida",
        description: "Metalúrgica Delta con 29 días de atraso.",
        amount: "$ 340.000",
        date: "31 mar 2026",
        severity: "critical",
      },
      {
        id: "a2-e2",
        type: "Factura vencida",
        description: "Retail Express con mora en dos comprobantes.",
        amount: "$ 430.000",
        date: "30 mar 2026",
        severity: "high",
      },
      {
        id: "a2-e3",
        type: "Promesa incumplida",
        description: "Compromiso de pago parcial no acreditado.",
        amount: "$ 120.000",
        date: "29 mar 2026",
        severity: "high",
      },
    ],
    movements: [
      {
        id: "a2-m1",
        label: "Factura emitida",
        detail: "Comprobante enviado con acuse de recepción.",
        date: "01 mar 2026",
        severity: "low",
      },
      {
        id: "a2-m2",
        label: "Vencimiento",
        detail: "No se recibió pago en fecha pactada.",
        date: "31 mar 2026",
        severity: "critical",
      },
      {
        id: "a2-m3",
        label: "Pago parcial",
        detail: "Ingreso menor al saldo esperado.",
        date: "02 abr 2026",
        severity: "high",
      },
      {
        id: "a2-m4",
        label: "Diferencia pendiente",
        detail: "Saldo restante sin fecha confirmada.",
        date: "04 abr 2026",
        severity: "high",
      },
      {
        id: "a2-m5",
        label: "Transferencia / recibo",
        detail: "Recibo emitido por parcialidad cobrada.",
        date: "04 abr 2026",
        severity: "medium",
      },
    ],
    documents: [
      {
        id: "a2-d1",
        name: "FAC-000377 Retail Express",
        type: "Factura",
        status: "Vencida 19 días",
        severity: "critical",
      },
      {
        id: "a2-d2",
        name: "REC-00901 Pago parcial",
        type: "Recibo",
        status: "Aplicado",
        severity: "medium",
      },
      {
        id: "a2-d3",
        name: "TRX-445077 Santander",
        type: "Transferencia",
        status: "Acreditada",
        severity: "low",
      },
      {
        id: "a2-d4",
        name: "NC-00073 Diferencia comercial",
        type: "Nota de crédito",
        status: "Pendiente de aprobación",
        severity: "high",
      },
    ],
    aiRead: {
      pattern:
        "Patrón de cobranza tardía repetida en clientes de ticket alto con desvío de más de 15 días sobre su comportamiento histórico.",
      why:
        "Se considera crítico por concentración: pocas cuentas explican la mayoría del vencido y elevan el riesgo sistémico.",
      suggest:
        "Priorizar contacto ejecutivo sobre los dos mayores saldos y fijar fecha cierta de regularización con seguimiento diario.",
    },
  },
  a3: {
    alertId: "a3",
    title: "Suba anormal de gastos administrativos",
    subtitle: "Incremento sostenido fuera de la banda histórica trimestral.",
    updatedAt: "31 mar 2026 · 18:12",
    primarySeverity: "high",
    summary: {
      executive:
        "El gasto administrativo crece más rápido que las ventas, lo que comprime margen operativo.",
      trigger:
        "Aumentaron contratos de software, servicios tercerizados y costos de soporte en el último mes.",
      impact:
        "Si persiste la tendencia, se reduce capacidad de inversión y flexibilidad para absorber shocks de caja.",
      recommendation:
        "Revisar contratos recurrentes de menor retorno y definir tope temporal de gasto discrecional.",
    },
    evidence: [
      {
        id: "a3-e1",
        type: "Suscripciones",
        description: "Renovaciones automáticas no consolidadas.",
        amount: "$ 190.000",
        date: "30 mar 2026",
        severity: "high",
      },
      {
        id: "a3-e2",
        type: "Servicios externos",
        description: "Honorarios por encima del promedio mensual.",
        amount: "$ 270.000",
        date: "29 mar 2026",
        severity: "medium",
      },
      {
        id: "a3-e3",
        type: "Backoffice",
        description: "Gasto operativo incremental no presupuestado.",
        amount: "$ 95.000",
        date: "28 mar 2026",
        severity: "medium",
      },
    ],
    movements: [
      {
        id: "a3-m1",
        label: "Factura emitida",
        detail: "Proveedor SaaS factura mensual.",
        date: "05 mar 2026",
        severity: "low",
      },
      {
        id: "a3-m2",
        label: "Vencimiento",
        detail: "Renovación automática sin revisión previa.",
        date: "20 mar 2026",
        severity: "medium",
      },
      {
        id: "a3-m3",
        label: "Pago parcial",
        detail: "Pago en dos tramos por ajuste presupuestario.",
        date: "22 mar 2026",
        severity: "medium",
      },
      {
        id: "a3-m4",
        label: "Diferencia pendiente",
        detail: "Diferencia menor pendiente de conciliación.",
        date: "24 mar 2026",
        severity: "low",
      },
      {
        id: "a3-m5",
        label: "Transferencia / recibo",
        detail: "Transferencia confirmada y recibo emitido.",
        date: "25 mar 2026",
        severity: "low",
      },
    ],
    documents: [
      {
        id: "a3-d1",
        name: "FAC-ADM-120 Suite herramientas",
        type: "Factura",
        status: "Pagada",
        severity: "medium",
      },
      {
        id: "a3-d2",
        name: "REC-ADM-052 Abono soporte",
        type: "Recibo",
        status: "Pagado",
        severity: "low",
      },
      {
        id: "a3-d3",
        name: "TRX-ADM-881",
        type: "Transferencia",
        status: "Acreditada",
        severity: "low",
      },
      {
        id: "a3-d4",
        name: "NC-ADM-010 Ajuste licencias",
        type: "Nota de crédito",
        status: "Pendiente",
        severity: "medium",
      },
    ],
    aiRead: {
      pattern:
        "El algoritmo detectó una deriva de gasto en rubros administrativos no correlacionada con crecimiento comercial.",
      why:
        "La severidad es alta porque afecta margen de forma progresiva aunque no compromete caja inmediata.",
      suggest:
        "Consolidar herramientas duplicadas y renegociar dos contratos de terceros antes del próximo cierre.",
    },
  },
  a4: {
    alertId: "a4",
    title: "Concentración alta en pocos clientes",
    subtitle: "Dos cuentas explican casi la mitad de la facturación del período.",
    updatedAt: "01 abr 2026 · 10:04",
    primarySeverity: "high",
    summary: {
      executive:
        "El negocio muestra dependencia comercial elevada en dos clientes, lo que incrementa exposición ante desvíos puntuales.",
      trigger:
        "La participación conjunta del top 2 superó el umbral interno de concentración definido para el trimestre.",
      impact:
        "Una caída de compra en una cuenta clave impacta en ventas, caja y previsibilidad financiera.",
      recommendation:
        "Lanzar plan de diversificación del pipeline y ajustar condiciones de crédito en clientes altamente concentrados.",
    },
    evidence: [
      {
        id: "a4-e1",
        type: "Participación ventas",
        description: "Metalúrgica Delta + Distribuidora Sur.",
        amount: "48% de ventas",
        date: "31 mar 2026",
        severity: "high",
      },
      {
        id: "a4-e2",
        type: "Dependencia margen",
        description: "Margen bruto concentrado en los mismos clientes.",
        amount: "44%",
        date: "31 mar 2026",
        severity: "high",
      },
      {
        id: "a4-e3",
        type: "Pipeline nuevo",
        description: "Baja participación de nuevos clientes en cierre mensual.",
        amount: "12%",
        date: "30 mar 2026",
        severity: "medium",
      },
    ],
    movements: [
      {
        id: "a4-m1",
        label: "Factura emitida",
        detail: "Pico de facturación concentrado en dos cuentas.",
        date: "26 mar 2026",
        severity: "high",
      },
      {
        id: "a4-m2",
        label: "Vencimiento",
        detail: "Una de las cuentas solicita extensión de plazo.",
        date: "31 mar 2026",
        severity: "high",
      },
      {
        id: "a4-m3",
        label: "Pago parcial",
        detail: "Ingreso parcial dentro del plazo extendido.",
        date: "02 abr 2026",
        severity: "medium",
      },
      {
        id: "a4-m4",
        label: "Diferencia pendiente",
        detail: "Saldo restante sujeto a validación comercial.",
        date: "05 abr 2026",
        severity: "medium",
      },
      {
        id: "a4-m5",
        label: "Transferencia / recibo",
        detail: "Transferencia cursada en proceso de conciliación.",
        date: "06 abr 2026",
        severity: "low",
      },
    ],
    documents: [
      {
        id: "a4-d1",
        name: "FAC-RIES-221 Delta",
        type: "Factura",
        status: "Emitida",
        severity: "medium",
      },
      {
        id: "a4-d2",
        name: "REC-RIES-093 Parcial",
        type: "Recibo",
        status: "Aplicado",
        severity: "low",
      },
      {
        id: "a4-d3",
        name: "TRX-RIES-433",
        type: "Transferencia",
        status: "Pendiente de confirmación",
        severity: "medium",
      },
      {
        id: "a4-d4",
        name: "NC-RIES-019 Ajuste acuerdo",
        type: "Nota de crédito",
        status: "En revisión",
        severity: "high",
      },
    ],
    aiRead: {
      pattern:
        "La IA detectó concentración persistente en clientes top durante 3 ciclos mensuales consecutivos.",
      why:
        "Se clasifica alta porque amplifica riesgo de ventas y caja ante cualquier cambio de demanda o plazo de pago.",
      suggest:
        "Activar objetivo comercial de captación en cuentas medianas y reducir dependencia del top 2 en el próximo trimestre.",
    },
  },
  a5: {
    alertId: "a5",
    title: "Caída de ventas en canal retail",
    subtitle: "Descenso mensual en un canal sensible a promociones y stock.",
    updatedAt: "31 mar 2026 · 17:36",
    primarySeverity: "medium",
    summary: {
      executive:
        "La caída en retail recorta volumen, pero aún no compromete la operación total de la compañía.",
      trigger:
        "Se observan menos órdenes en puntos clave y menor tracción promocional frente a competencia directa.",
      impact:
        "Sostener la tendencia 2 ciclos más puede afectar objetivos trimestrales de facturación.",
      recommendation:
        "Revisar mix de producto y activar prueba comercial de recuperación en clientes retail de mayor rotación.",
    },
    evidence: [
      {
        id: "a5-e1",
        type: "Ventas por canal",
        description: "Variación intermensual retail.",
        amount: "-11%",
        date: "31 mar 2026",
        severity: "medium",
      },
      {
        id: "a5-e2",
        type: "Stock disponible",
        description: "Quiebre puntual en referencias de alta salida.",
        date: "29 mar 2026",
        severity: "medium",
      },
      {
        id: "a5-e3",
        type: "Competencia",
        description: "Promociones agresivas en la misma plaza.",
        date: "28 mar 2026",
        severity: "low",
      },
    ],
    movements: [
      {
        id: "a5-m1",
        label: "Factura emitida",
        detail: "Menor ticket promedio en canal retail.",
        date: "10 mar 2026",
        severity: "medium",
      },
      {
        id: "a5-m2",
        label: "Vencimiento",
        detail: "Cobranza en plazo regular.",
        date: "25 mar 2026",
        severity: "low",
      },
      {
        id: "a5-m3",
        label: "Pago parcial",
        detail: "Parcialidad habitual por acuerdos comerciales.",
        date: "27 mar 2026",
        severity: "low",
      },
      {
        id: "a5-m4",
        label: "Diferencia pendiente",
        detail: "Saldo menor pendiente de cierre.",
        date: "30 mar 2026",
        severity: "low",
      },
      {
        id: "a5-m5",
        label: "Transferencia / recibo",
        detail: "Transferencia confirmada sin desvíos.",
        date: "31 mar 2026",
        severity: "low",
      },
    ],
    documents: [
      {
        id: "a5-d1",
        name: "FAC-VTA-941 Canal retail",
        type: "Factura",
        status: "Emitida",
        severity: "low",
      },
      {
        id: "a5-d2",
        name: "REC-VTA-122 Cobro parcial",
        type: "Recibo",
        status: "Aplicado",
        severity: "low",
      },
      {
        id: "a5-d3",
        name: "TRX-VTA-517",
        type: "Transferencia",
        status: "Acreditada",
        severity: "low",
      },
      {
        id: "a5-d4",
        name: "NC-VTA-039 Promo estacional",
        type: "Nota de crédito",
        status: "Emitida",
        severity: "medium",
      },
    ],
    aiRead: {
      pattern:
        "El patrón sugiere pérdida temporal de tracción comercial en retail asociada a presión promocional externa y faltantes de stock.",
      why:
        "Se mantiene en severidad media porque el resto de canales compensa parcialmente la baja.",
      suggest:
        "Ejecutar un experimento comercial de 3 semanas en cuentas retail foco y monitorear recuperación semanal.",
    },
  },
};
