import type { CopilotSeverity } from "@/lib/copilot-alerts-evidence-mock";
import type { ActionListItem } from "@/lib/ai/action-types";

export type CopilotActionEvidenceCaseId =
  | "whatsapp_deuda_vencida"
  | "linkedin_oportunidad"
  | "email_nurture"
  | "ejecutada_resultado";

export type CopilotActionEvidenceCase = {
  caseId: CopilotActionEvidenceCaseId;
  title: string;
  subtitle: string;
  updatedAt: string;
  primarySeverity: CopilotSeverity;
  summary: {
    actionTypeLabel: string;
    priority: string;
    prioritySeverity: CopilotSeverity;
    channel: string;
    objective: string;
  };
  origin: {
    initiative: string;
    trigger: string;
    score?: string;
    scoreSeverity: CopilotSeverity;
    relatedAlert?: string;
    relatedInsight?: string;
    originSeverity: CopilotSeverity;
  };
  context: {
    situation: string;
    keyData: string;
    contextSeverity: CopilotSeverity;
  };
  executionTemplate: {
    suggestedMessage: string;
    channel: string;
    suggestedDate: string;
    statusSeverityPending: CopilotSeverity;
    outcomeWhenExecuted?: string;
    outcomeSeverity?: CopilotSeverity;
  };
  aiRead: {
    whyAction: string;
    whyChannel: string;
    expectation: string;
    nextStep: string;
  };
};

export const COPILOT_ACTIONS_EVIDENCE_MOCK: Record<
  CopilotActionEvidenceCaseId,
  CopilotActionEvidenceCase
> = {
  whatsapp_deuda_vencida: {
    caseId: "whatsapp_deuda_vencida",
    title: "Contacto por WhatsApp por deuda vencida",
    subtitle: "Mensaje breve, tono firme y orientado a fecha de pago.",
    updatedAt: "01 abr 2026 · 10:12",
    primarySeverity: "high",
    summary: {
      actionTypeLabel: "send_whatsapp",
      priority: "Alta",
      prioritySeverity: "high",
      channel: "WhatsApp",
      objective:
        "Recuperar compromiso de pago o fecha cierta sin escalar a conflicto innecesario.",
    },
    origin: {
      initiative: "high_priority_outreach",
      trigger: "Factura vencida por encima del umbral y concentración en cartera.",
      score: "Impacto en caja: 0,82 (normalizado)",
      scoreSeverity: "high",
      relatedAlert: "Clientes con deuda vencida (cobranza)",
      relatedInsight: "Concentración alta en pocos clientes",
      originSeverity: "critical",
    },
    context: {
      situation:
        "Cliente con ticket relevante y saldo vencido en ventana crítica de liquidez.",
      keyData: "Mora 18–32 días según comprobante; historial de promesas parcialmente cumplidas.",
      contextSeverity: "high",
    },
    executionTemplate: {
      suggestedMessage:
        "Hola [Nombre], te escribo por la factura [N] vencida. ¿Podemos coordinar pago o una fecha concreta en las próximas 48 hs? Gracias.",
      channel: "WhatsApp",
      suggestedDate: "Mismo día (ventana comercial 10:00–18:00)",
      statusSeverityPending: "medium",
    },
    aiRead: {
      whyAction:
        "Prioriza velocidad y tasa de respuesta: el canal reduce fricción frente a email en cobranza temprana.",
      whyChannel:
        "WhatsApp concentra lectura y permite cierre rápido de fecha sin perder registro del mensaje.",
      expectation:
        "Obtener confirmación de pago o reunión breve; si no hay respuesta, escalar a llamada en 24–48 hs.",
      nextStep:
        "Registrar resultado (sin respuesta / respondió / venta) y, si falla, generar acción alternativa por voz.",
    },
  },
  linkedin_oportunidad: {
    caseId: "linkedin_oportunidad",
    title: "Mensaje LinkedIn por oportunidad comercial",
    subtitle: "Enfoque consultivo: apertura sin pitch agresivo.",
    updatedAt: "31 mar 2026 · 15:40",
    primarySeverity: "medium",
    summary: {
      actionTypeLabel: "send_linkedin_message",
      priority: "Media",
      prioritySeverity: "medium",
      channel: "LinkedIn",
      objective:
        "Generar respuesta y avanzar hacia una conversación comercial calificada.",
    },
    origin: {
      initiative: "linkedin_contact",
      trigger: "Señal de intención (visita a perfil / interacción / cargo reciente).",
      score: "Fit ICP: 0,74",
      scoreSeverity: "medium",
      relatedInsight: "Mejora de margen en un segmento clave",
      originSeverity: "medium",
    },
    context: {
      situation:
        "Cuenta objetivo con necesidad plausible y timing favorable para explorar propuesta.",
      keyData: "Empresa en expansión; compras similares en el rubro en los últimos 90 días.",
      contextSeverity: "medium",
    },
    executionTemplate: {
      suggestedMessage:
        "Hola [Nombre], vi [señal]. En [empresa] ayudamos a [beneficio]. ¿Te interesa una conversación de 15 min la próxima semana?",
      channel: "LinkedIn",
      suggestedDate: "48–72 hs (evitar lunes temprano)",
      statusSeverityPending: "medium",
    },
    aiRead: {
      whyAction:
        "Mantiene bajo costo de interrupción y permite personalización visible frente a cold email masivo.",
      whyChannel:
        "LinkedIn habilita contexto profesional y reduce sensación de spam si el mensaje es específico.",
      expectation:
        "Una respuesta o un ‘no por ahora’ útil para priorizar pipeline.",
      nextStep:
        "Si hay respuesta positiva, proponer calendario; si no, nutrir con contenido en 10 días.",
    },
  },
  email_nurture: {
    caseId: "email_nurture",
    title: "Email de nurture / seguimiento",
    subtitle: "Mantener relación y avanzar micro-compromisos sin presión de cierre inmediato.",
    updatedAt: "30 mar 2026 · 09:05",
    primarySeverity: "low",
    summary: {
      actionTypeLabel: "send_email",
      priority: "Baja / Media",
      prioritySeverity: "low",
      channel: "Email",
      objective:
        "Educar, recordar valor y pedir un siguiente paso pequeño (lectura, reply, reunión corta).",
    },
    origin: {
      initiative: "low_priority_nurture",
      trigger: "Cuenta en etapa temprana o reactivación tras silencio controlado.",
      score: "Probabilidad de respuesta: 0,41",
      scoreSeverity: "low",
      relatedAlert: "—",
      relatedInsight: "Caída de ventas en un canal (seguimiento indirecto)",
      originSeverity: "low",
    },
    context: {
      situation:
        "Relación comercial viva pero sin urgencia inmediata; conviene sostener ritmo de contacto.",
      keyData: "Último touchpoint hace 21 días; descargó material hace 9 días.",
      contextSeverity: "low",
    },
    executionTemplate: {
      suggestedMessage:
        "Asunto: [Beneficio concreto] para [empresa]\n\nHola [Nombre], te comparto [recurso] y 2 ideas aplicables esta semana. Si querés, coordinamos 10 min.",
      channel: "Email",
      suggestedDate: "Mañana 09:30 (mejor apertura en este segmento)",
      statusSeverityPending: "low",
    },
    aiRead: {
      whyAction:
        "Evita quemar canal de alta atención (WhatsApp) cuando la cuenta no está en modo ‘ahora’.",
      whyChannel:
        "Email permite adjuntos, trazabilidad y lectura asincrónica sin interrumpir operación del cliente.",
      expectation:
        "Aumentar reply rate leve y mantener calor para una acción de mayor prioridad después.",
      nextStep:
        "Si abre y no responde en 7 días, reforzar con nota breve en otro canal o tarea interna de revisión.",
    },
  },
  ejecutada_resultado: {
    caseId: "ejecutada_resultado",
    title: "Acción ejecutada con resultado registrado",
    subtitle: "Cierre de ciclo: el sistema aprende qué funcionó para afinar próximas recomendaciones.",
    updatedAt: "29 mar 2026 · 18:22",
    primarySeverity: "low",
    summary: {
      actionTypeLabel: "(según acción original)",
      priority: "Cerrada",
      prioritySeverity: "low",
      channel: "(canal usado)",
      objective:
        "Documentar outcome para medir conversión y ajustar scoring de iniciativas.",
    },
    origin: {
      initiative: "Varias (derivadas de decisiones)",
      trigger: "Acción completada y outcome registrado vía UI.",
      score: "Outcome quality: confirmado",
      scoreSeverity: "low",
      relatedAlert: "—",
      relatedInsight: "—",
      originSeverity: "low",
    },
    context: {
      situation:
        "La acción ya no está pendiente: el equipo registró un resultado que alimenta métricas del copiloto.",
      keyData: "Estado ejecutado; trazabilidad initiative → acción → outcome disponible.",
      contextSeverity: "low",
    },
    executionTemplate: {
      suggestedMessage:
        "El mensaje enviado quedó asociado al payload original; el resultado cierra el loop operativo.",
      channel: "(registrado)",
      suggestedDate: "—",
      statusSeverityPending: "low",
      outcomeWhenExecuted:
        "Ejemplo: respondió / reunión agendada / venta registrada — ver detalle en outcome.",
      outcomeSeverity: "low",
    },
    aiRead: {
      whyAction:
        "Registrar resultado es lo que convierte recomendaciones en aprendizaje medible.",
      whyChannel:
        "El canal importa para explicar tasas de conversión por tipo de touchpoint.",
      expectation:
        "Mejorar ranking futuro de iniciativas similares y reducir falsos positivos de prioridad.",
      nextStep:
        "Si el outcome fue venta, sugerir upsell; si fue sin respuesta, evaluar canal alternativo.",
    },
  },
};

export function resolveActionEvidenceCaseId(
  a: ActionListItem
): CopilotActionEvidenceCaseId {
  const st = a.execution_status.toLowerCase();
  if (st === "executed") return "ejecutada_resultado";

  switch (a.action_type) {
    case "send_whatsapp":
      return "whatsapp_deuda_vencida";
    case "send_linkedin_message":
      return "linkedin_oportunidad";
    case "send_email":
      return "email_nurture";
    default:
      return "email_nurture";
  }
}

export function getActionEvidenceCase(
  a: ActionListItem | null
): CopilotActionEvidenceCase | null {
  if (!a) return null;
  const id = resolveActionEvidenceCaseId(a);
  return COPILOT_ACTIONS_EVIDENCE_MOCK[id] ?? null;
}
