import type { CopilotSeverity } from "@/lib/copilot-alerts-evidence-mock";

export type CopilotInsightOriginIndicator = {
  id: string;
  label: string;
  value: string;
  severity: CopilotSeverity;
};

export type CopilotInsightSignal = {
  id: string;
  label: string;
  detail: string;
  date: string;
  amount?: string;
  severity: CopilotSeverity;
};

export type CopilotInsightEvidenceCase = {
  insightId: string;
  title: string;
  subtitle: string;
  updatedAt: string;
  primarySeverity: CopilotSeverity;
  summary: {
    executive: string;
    relevance: string;
    impact: string;
  };
  pattern: {
    pattern: string;
    evolution: string;
  };
  originIndicators: CopilotInsightOriginIndicator[];
  signals: CopilotInsightSignal[];
  aiRead: {
    conclusion: string;
    classification: string;
    recommend: string;
  };
};

export const COPILOT_INSIGHTS_EVIDENCE_MOCK: Record<string, CopilotInsightEvidenceCase> = {
  i1: {
    insightId: "i1",
    title: "Concentración alta en pocos clientes",
    subtitle: "El top 2 concentra una fracción elevada de facturación y de margen bruto.",
    updatedAt: "31 mar 2026 · 09:15",
    primarySeverity: "high",
    summary: {
      executive:
        "La cartera no está equilibrada: pocas cuentas explican la mayor parte del resultado y amplifican el riesgo operativo.",
      relevance:
        "Si una cuenta clave retrasa compra o pide condiciones más duras, el impacto no es marginal: es sistémico.",
      impact:
        "Mayor volatilidad de ingresos, menor margen de negociación y presión en caja si se combina con cobranza lenta.",
    },
    pattern: {
      pattern:
        "Participación de ventas y margen concentrada en dos clientes durante al menos tres meses consecutivos.",
      evolution:
        "Comparado con el trimestre anterior, la participación del top 2 subió ~6 puntos porcentuales mientras el resto de la cartera se mantiene plana.",
    },
    originIndicators: [
      {
        id: "i1-k1",
        label: "Participación top 2 (ventas)",
        value: "48%",
        severity: "high",
      },
      {
        id: "i1-k2",
        label: "Participación top 2 (margen bruto)",
        value: "44%",
        severity: "high",
      },
      {
        id: "i1-k3",
        label: "Clientes con >10% de share",
        value: "2",
        severity: "medium",
      },
      {
        id: "i1-k4",
        label: "Nuevos clientes con cierre en el mes",
        value: "12% del total",
        severity: "medium",
      },
    ],
    signals: [
      {
        id: "i1-s1",
        label: "Pedido recurrente",
        detail: "Mayor cliente mantiene volumen, pero negocia plazos más largos.",
        date: "18 mar 2026",
        severity: "medium",
      },
      {
        id: "i1-s2",
        label: "Facturación pico",
        detail: "Segundo cliente con concentración en un solo rubro de producto.",
        date: "22 mar 2026",
        amount: "$ 1,1 M",
        severity: "high",
      },
      {
        id: "i1-s3",
        label: "Alerta de cobranza",
        detail: "Mora leve en una de las cuentas concentradas.",
        date: "28 mar 2026",
        amount: "$ 180.000 vencido",
        severity: "high",
      },
      {
        id: "i1-s4",
        label: "Pipeline comercial",
        detail: "Baja tasa de cierre en cuentas medianas.",
        date: "30 mar 2026",
        severity: "medium",
      },
    ],
    aiRead: {
      conclusion:
        "El insight describe dependencia comercial relevante: el riesgo no es “bajar ventas” en general, sino perder elasticidad frente a pocas cuentas.",
      classification:
        "Se clasifica como riesgo alto por concentración persistente y correlación con margen.",
      recommend:
        "Definir plan de diversificación (pipeline + condiciones) y techo de exposición por cuenta en el próximo trimestre.",
    },
  },
  i2: {
    insightId: "i2",
    title: "Crecimiento de gastos indirectos fuera de tendencia",
    subtitle: "Los costos no ligados a producción crecen más rápido que la base de ventas.",
    updatedAt: "28 mar 2026 · 14:40",
    primarySeverity: "high",
    summary: {
      executive:
        "Los gastos indirectos suben por encima del patrón histórico, comprimiendo margen aunque el volumen se mantenga.",
      relevance:
        "Este tipo de costo suele “pegarse” al P&L: pequeños incrementos recurrentes se vuelven estructurales.",
      impact:
        "Menor margen operativo y menos margen de maniobra para invertir o absorber shocks de caja.",
    },
    pattern: {
      pattern:
        "Deriva sostenida en software, servicios de terceros y soporte administrativo, no explicada por crecimiento de ventas.",
      evolution:
        "Últimos 90 días: +14% vs promedio trimestral previo; ventas +2% en el mismo período.",
    },
    originIndicators: [
      {
        id: "i2-k1",
        label: "Gastos indirectos / ventas",
        value: "20,6%",
        severity: "high",
      },
      {
        id: "i2-k2",
        label: "Variación vs tendencia",
        value: "+14%",
        severity: "high",
      },
      {
        id: "i2-k3",
        label: "Contratos recurrentes activos",
        value: "27",
        severity: "medium",
      },
      {
        id: "i2-k4",
        label: "Duplicidades detectadas (heurística)",
        value: "4 rubros",
        severity: "medium",
      },
    ],
    signals: [
      {
        id: "i2-s1",
        label: "Renovación automática",
        detail: "Suite de herramientas con aumento de licencias.",
        date: "05 mar 2026",
        amount: "+$ 95.000 / mes",
        severity: "high",
      },
      {
        id: "i2-s2",
        label: "Honorarios externos",
        detail: "Pico por proyecto de implementación no presupuestado.",
        date: "12 mar 2026",
        amount: "$ 270.000",
        severity: "high",
      },
      {
        id: "i2-s3",
        label: "Pago programado",
        detail: "Orden de pago a proveedor administrativo.",
        date: "20 mar 2026",
        amount: "$ 410.000",
        severity: "medium",
      },
      {
        id: "i2-s4",
        label: "Obligación próxima",
        detail: "Renovación anual de soporte crítico.",
        date: "02 abr 2026",
        amount: "$ 190.000",
        severity: "medium",
      },
    ],
    aiRead: {
      conclusion:
        "El sistema interpreta el patrón como presión de costo fijo indirecto: no es un gasto puntual, es una deriva.",
      classification:
        "Riesgo alto para margen porque el crecimiento de ventas no acompaña la suba de estructura.",
      recommend:
        "Auditar contratos recurrentes, consolidar herramientas duplicadas y congelar nuevas contrataciones 30 días.",
    },
  },
  i3: {
    insightId: "i3",
    title: "Mejora de margen en un segmento clave",
    subtitle: "Un canal o familia de producto muestra eficiencia superior al resto del mix.",
    updatedAt: "25 mar 2026 · 11:05",
    primarySeverity: "low",
    summary: {
      executive:
        "Un segmento específico mejora rentabilidad por mejor mix, menor costo logístico o precio más defendible.",
      relevance:
        "Sirve para decidir dónde reforzar comercialmente y qué replicar en otros canales.",
      impact:
        "Potencial de crecimiento rentable y de reducción de complejidad operativa si se escala con disciplina.",
    },
    pattern: {
      pattern:
        "Margen bruto segmentado en alza durante 8 semanas consecutivas, con estabilidad de devoluciones.",
      evolution:
        "Margen del segmento +2,4 pp vs trimestre anterior; ventas del segmento +7% en volumen.",
    },
    originIndicators: [
      {
        id: "i3-k1",
        label: "Margen bruto segmento",
        value: "24,8%",
        severity: "low",
      },
      {
        id: "i3-k2",
        label: "Contribución al margen total",
        value: "31%",
        severity: "medium",
      },
      {
        id: "i3-k3",
        label: "Costo logístico / venta (segmento)",
        value: "−8% vs promedio",
        severity: "low",
      },
      {
        id: "i3-k4",
        label: "Descuentos otorgados",
        value: "Estables",
        severity: "low",
      },
    ],
    signals: [
      {
        id: "i3-s1",
        label: "Mix de producto",
        detail: "Mayor proporción de SKU de mayor margen en pedidos.",
        date: "10 mar 2026",
        severity: "low",
      },
      {
        id: "i3-s2",
        label: "Facturación",
        detail: "Racha de pedidos con ticket medio superior.",
        date: "18 mar 2026",
        amount: "$ 620.000",
        severity: "medium",
      },
      {
        id: "i3-s3",
        label: "Cobranza",
        detail: "Menor proporción de ventas con pago diferido.",
        date: "24 mar 2026",
        severity: "low",
      },
      {
        id: "i3-s4",
        label: "Competencia",
        detail: "Menor presión promocional detectada en el canal.",
        date: "25 mar 2026",
        severity: "medium",
      },
    ],
    aiRead: {
      conclusion:
        "El copiloto identifica una ventaja temporal o estructural en un segmento: conviene capitalizarla sin dispersar foco.",
      classification:
        "Señal positiva (bajo riesgo): oportunidad de expansión controlada.",
      recommend:
        "Asignar cuota comercial y stock al segmento ganador y documentar el playbook para replicarlo.",
    },
  },
  i4: {
    insightId: "i4",
    title: "Caída de ventas en un canal",
    subtitle: "Un canal pierde tracción intermensual frente al resto de la operación.",
    updatedAt: "22 mar 2026 · 16:30",
    primarySeverity: "high",
    summary: {
      executive:
        "El canal afectado reduce volumen y presiona la meta mensual, aunque otros canales compensen parcialmente.",
      relevance:
        "Sirve para priorizar acciones comerciales y revisar precio, stock o activación antes de que se estabilice la caída.",
      impact:
        "Si persiste 6–8 semanas, puede erosionar margen por descuentos o mix desfavorable.",
    },
    pattern: {
      pattern:
        "Caída intermensual en retail con correlación a quiebres de stock y campañas agresivas del competidor.",
      evolution:
        "Canal retail −11% vs mes anterior; resto de canales +1% combinado.",
    },
    originIndicators: [
      {
        id: "i4-k1",
        label: "Ventas canal retail",
        value: "−11%",
        severity: "high",
      },
      {
        id: "i4-k2",
        label: "Stock disponible (top SKU)",
        value: "Bajo mínimo 6 días",
        severity: "high",
      },
      {
        id: "i4-k3",
        label: "Descuentos promedio (canal)",
        value: "+3 pp",
        severity: "medium",
      },
      {
        id: "i4-k4",
        label: "Tráfico / pedidos (proxy)",
        value: "−8%",
        severity: "medium",
      },
    ],
    signals: [
      {
        id: "i4-s1",
        label: "Promoción competidor",
        detail: "Campaña agresiva en la misma plaza.",
        date: "08 mar 2026",
        severity: "medium",
      },
      {
        id: "i4-s2",
        label: "Quiebre stock",
        detail: "Faltantes en referencias de alta rotación.",
        date: "15 mar 2026",
        severity: "high",
      },
      {
        id: "i4-s3",
        label: "Facturación",
        detail: "Menor ticket medio en pedidos retail.",
        date: "20 mar 2026",
        amount: "−$ 210.000 vs objetivo",
        severity: "high",
      },
      {
        id: "i4-s4",
        label: "Cobranza",
        detail: "Sin señal de deterioro de mora en el canal.",
        date: "22 mar 2026",
        severity: "low",
      },
    ],
    aiRead: {
      conclusion:
        "La caída parece explicada por un combo oferta-competencia + disponibilidad, más que por salud crediticia del canal.",
      classification:
        "Riesgo medio-alto comercial: requiere acción táctica rápida para recuperar tracción.",
      recommend:
        "Plan de 3 semanas: recomposición de stock crítico, promoción focalizada y revisión de precio en 2 SKU clave.",
    },
  },
};
