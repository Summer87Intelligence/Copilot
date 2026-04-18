import type { CopilotSeverity } from "@/lib/copilot-alerts-evidence-mock";

/** Alineado con `DataEntity` en `copilot-data` (evita import circular). */
export type CopilotDataEntityKey =
  | "companies"
  | "contacts"
  | "invoices"
  | "receipts"
  | "payments"
  | "tax_obligations";

/** Opción de filtro: valor interno (inglés / API) + etiqueta visible en español. */
export type CopilotLabeledOption = { value: string; label: string };

// ——— Status facturas ———

export function mapInvoiceStatus(status: string): string {
  switch (status.toLowerCase()) {
    case "issued":
      return "Emitida";
    case "overdue":
      return "Vencida";
    case "paid":
      return "Pagada";
    case "partial":
      return "Parcial";
    case "cancelled":
      return "Cancelada";
    default:
      return status;
  }
}

export function getInvoiceStatusOptions(): CopilotLabeledOption[] {
  return [
    { value: "issued", label: "Emitida" },
    { value: "overdue", label: "Vencida" },
    { value: "paid", label: "Pagada" },
    { value: "partial", label: "Parcial" },
    { value: "cancelled", label: "Cancelada" },
  ];
}

// ——— Estados compartidos obligaciones fiscales / pagos (API en inglés) ———

export function formatStatus(status: string): string {
  switch (status.toLowerCase()) {
    case "scheduled":
      return "Programado";
    case "pending":
      return "Pendiente";
    case "paid":
      return "Pagado";
    case "overdue":
      return "Vencido";
    default:
      return status;
  }
}

const SHARED_OBLIGATION_PAYMENT_PILL_BASE =
  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset";

/** Colores UX: programado gris, pendiente azul, pagado verde, vencido rojo. */
export function sharedObligationPaymentStatusPillClass(status: string): string {
  switch (status.toLowerCase()) {
    case "scheduled":
      return `${SHARED_OBLIGATION_PAYMENT_PILL_BASE} bg-slate-100 text-slate-700 ring-slate-200/90`;
    case "pending":
      return `${SHARED_OBLIGATION_PAYMENT_PILL_BASE} bg-sky-100 text-sky-950 ring-sky-200/90`;
    case "paid":
      return `${SHARED_OBLIGATION_PAYMENT_PILL_BASE} bg-emerald-100 text-emerald-900 ring-emerald-200/90`;
    case "overdue":
      return `${SHARED_OBLIGATION_PAYMENT_PILL_BASE} bg-red-100 text-red-950 ring-red-200/90`;
    default:
      return `${SHARED_OBLIGATION_PAYMENT_PILL_BASE} bg-[rgba(44,40,37,0.06)] text-[var(--copilot-ink)] ring-[var(--copilot-border)]`;
  }
}

// ——— Status pagos / recibos (misma familia de valores) ———

export function mapPaymentStatus(status: string): string {
  const k = status.toLowerCase();
  if (k === "scheduled" || k === "pending" || k === "paid" || k === "overdue") {
    return formatStatus(status);
  }
  switch (k) {
    case "applied":
      return "Aplicado";
    case "reversed":
      return "Revertido";
    case "cancelled":
      return "Cancelado";
    default:
      return status;
  }
}

/** Recibos: mismos estados operativos que pagos cuando vienen en inglés desde API. */
export function mapReceiptStatus(status: string): string {
  return mapPaymentStatus(status);
}

export function getPaymentStatusOptions(): CopilotLabeledOption[] {
  return [
    { value: "paid", label: formatStatus("paid") },
    { value: "scheduled", label: formatStatus("scheduled") },
    { value: "pending", label: formatStatus("pending") },
    { value: "applied", label: "Aplicado" },
    { value: "reversed", label: "Revertido" },
    { value: "cancelled", label: "Cancelado" },
  ];
}

export function getReceiptStatusOptions(): CopilotLabeledOption[] {
  return getPaymentStatusOptions();
}

// ——— Status genéricos (empresas, contactos, etc.) ———

export function mapGenericStatus(status: string): string {
  switch (status.toLowerCase()) {
    case "active":
      return "Activo";
    case "inactive":
      return "Inactivo";
    case "processed":
      return "Procesado";
    case "unprocessed":
      return "Sin procesar";
    default:
      return status;
  }
}

export function getGenericStatusOptions(): CopilotLabeledOption[] {
  return [
    { value: "active", label: "Activo" },
    { value: "inactive", label: "Inactivo" },
  ];
}

// ——— Riesgo (empresas / tablas) ———

export function mapRiskLevel(level: string): string {
  switch (level.toLowerCase()) {
    case "critical":
      return "Crítico";
    case "high":
    case "alto":
      return "Alto";
    case "medium":
    case "medio":
      return "Medio";
    case "low":
    case "bajo":
      return "Bajo";
    default:
      return level;
  }
}

// ——— Prioridad / severidad (alertas, UI) ———

export function mapPriority(priority: string): string {
  switch (priority.toLowerCase()) {
    case "critical":
      return "Crítica";
    case "high":
      return "Alta";
    case "medium":
      return "Media";
    case "low":
      return "Baja";
    default:
      return priority;
  }
}

export function getPriorityOptions(): CopilotLabeledOption[] {
  return [
    { value: "critical", label: "Crítica" },
    { value: "high", label: "Alta" },
    { value: "medium", label: "Media" },
    { value: "low", label: "Baja" },
  ];
}

// ——— Categorías de alerta (mock / API en inglés o slug) ———

const ALERT_CATEGORY_LABELS: Record<string, string> = {
  liquidez: "Liquidez",
  cobranza: "Cobranza",
  gastos: "Gastos",
  riesgo: "Riesgo",
  ventas: "Ventas",
  fiscalidad: "Fiscalidad",
  cobertura: "Cobertura",
  conciliacion: "Conciliación",
};

export function mapAlertCategory(type: string): string {
  const k = type.trim().toLowerCase();
  return ALERT_CATEGORY_LABELS[k] ?? type;
}

// ——— Ejecución de acciones ———

export function mapExecutionStatus(status: string): string {
  switch (status.toLowerCase()) {
    case "pending":
      return "Pendiente";
    case "executed":
      return "Ejecutada";
    case "failed":
      return "Intento sin respuesta";
    default:
      return status;
  }
}

export function mapOutcomeTypeLabelEs(t: string): string {
  switch (t.toLowerCase()) {
    case "no_response":
      return "Sin respuesta";
    case "response":
      return "Respondió";
    case "meeting":
      return "Reunión";
    case "sale":
      return "Venta";
    default:
      return t;
  }
}

// ——— Fiscal (obligaciones y pagos al Estado) ———

const TAX_TYPE_LABELS: Record<string, string> = {
  iva: "IVA",
  bps: "BPS",
  dgi: "DGI",
  irae: "IRAE",
  anticipo: "Anticipo",
  otros: "Otros",
};

export function mapTaxTypeLabel(taxType: string): string {
  const k = taxType.trim().toLowerCase();
  return TAX_TYPE_LABELS[k] ?? taxType.toUpperCase();
}

/** Estado de la obligación fiscal (mismos slugs que pagos en los 4 núcleos). */
export function mapTaxObligationStatus(status: string): string {
  const k = status.toLowerCase();
  if (k === "scheduled" || k === "pending" || k === "paid" || k === "overdue") {
    return formatStatus(status);
  }
  return status;
}

/** Línea de pago fiscal (misma familia que pagos operativos). */
export function mapTaxPaymentRecordStatus(status: string): string {
  return mapPaymentStatus(status);
}

export function taxPriorityToSeverity(priority: string): CopilotSeverity {
  switch (priority.toLowerCase()) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "low":
      return "low";
    default:
      return "medium";
  }
}

/** Fecha corta para línea de agenda: `12 abr` (sin punto final del mes abreviado). */
export function formatTaxAgendaDateShort(ymd: string): string {
  const key = ymd.slice(0, 10);
  try {
    const d = new Date(`${key}T12:00:00`);
    if (Number.isNaN(d.getTime())) return key;
    const raw = d.toLocaleDateString("es-UY", {
      day: "numeric",
      month: "short",
    });
    return raw.replace(/\./g, "").trim();
  } catch {
    return key;
  }
}

export function formatTaxObligationMoney(n: number): string {
  return `$ ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

/**
 * Monto a mostrar: confirmado si hay valor positivo; si no, estimado.
 */
export function getTaxObligationAmountDisplay(
  estimated: number,
  confirmed: number | null
): { text: string; source: "confirmado" | "estimado" } {
  if (confirmed != null && Number.isFinite(confirmed) && confirmed > 0) {
    return {
      text: formatTaxObligationMoney(confirmed),
      source: "confirmado",
    };
  }
  return {
    text: formatTaxObligationMoney(estimated),
    source: "estimado",
  };
}

const TAX_PAYMENT_METHOD_LABELS: Record<string, string> = {
  transferencia: "Transferencia",
  "débito bancario": "Débito bancario",
  debito_bancario: "Débito bancario",
  efectivo: "Efectivo",
  cheque: "Cheque",
};

export function mapTaxPaymentMethod(method: string | null | undefined): string {
  if (method == null || method === "") return "—";
  const k = method.trim().toLowerCase();
  return TAX_PAYMENT_METHOD_LABELS[k] ?? method;
}

// ——— Acciones (canal / tipo desde API en inglés) ———

const ACTION_CHANNEL_LABELS: Record<string, string> = {
  email: "Correo",
  mail: "Correo",
  whatsapp: "WhatsApp",
  linkedin: "Perfil profesional (LinkedIn)",
  phone: "Teléfono",
  call: "Llamada",
  sms: "SMS",
  in_app: "En la app",
  task: "Tarea",
};

export function mapActionChannel(channel: string): string {
  const k = channel.trim().toLowerCase();
  return ACTION_CHANNEL_LABELS[k] ?? channel;
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  follow_up: "Seguimiento",
  followup: "Seguimiento",
  payment_reminder: "Recordatorio de cobro",
  collection: "Cobranza",
  outreach: "Contacto",
  meeting: "Reunión",
  call: "Llamada",
  email: "Correo",
  task: "Tarea",
  high_priority_outreach: "Cliente prioritario para contactar",
  send_whatsapp: "Contactar por WhatsApp",
  linkedin_contact: "Contacto comercial planificado",
  low_priority_nurture: "Seguimiento de relacionamiento",
};

export function mapActionTypeLabel(actionType: string): string {
  const k = actionType.trim().toLowerCase().replace(/\s+/g, "_");
  return ACTION_TYPE_LABELS[k] ?? actionType;
}

// ——— Celda / campo unificado (tabla + sidebar) ———

function stringifyScalar(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString("es-AR");
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "string") {
    if (value.includes("T") && value.includes("-")) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("es-UY");
    }
    return value;
  }
  return String(value);
}

/** Formatea un campo de fila de datos Copilot para mostrar en UI. */
export function formatCopilotDataCell(
  entity: CopilotDataEntityKey,
  key: string,
  value: unknown
): string {
  if (value === null || value === undefined || value === "") return "—";

  if (key === "status" && typeof value === "string") {
    if (entity === "invoices") return mapInvoiceStatus(value);
    if (entity === "payments" || entity === "receipts") return mapReceiptStatus(value);
    if (entity === "tax_obligations") return mapTaxObligationStatus(value);
    return mapGenericStatus(value);
  }

  if (key === "tax_type" && typeof value === "string" && entity === "tax_obligations") {
    return mapTaxTypeLabel(value);
  }

  if (key === "priority" && typeof value === "string" && entity === "tax_obligations") {
    return mapPriority(value);
  }

  if (key === "risk_level") {
    return mapRiskLevel(String(value));
  }

  if (entity === "payments" && key === "obligation_id") {
    const s = String(value).trim();
    if (!s) return "—";
    return `Vinculada (${s.slice(0, 8)}…)`;
  }

  return stringifyScalar(value);
}

/** Normaliza valor de fila para comparar en filtro (select `value`). */
export function normalizeFilterStoredValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim();
}

/**
 * Etiqueta visible para un valor de filtro según entidad y clave.
 * Mantiene `value` en inglés / formato estable para comparar con la fila.
 */
export function formatFilterOptionLabel(
  entity: CopilotDataEntityKey,
  filterKey: string,
  storedValue: string
): string {
  if (filterKey === "risk_level") {
    return mapRiskLevel(storedValue);
  }
  if (filterKey === "status") {
    if (entity === "invoices") return mapInvoiceStatus(storedValue);
    if (entity === "payments") return mapPaymentStatus(storedValue);
    if (entity === "receipts") return mapReceiptStatus(storedValue);
    if (entity === "tax_obligations") return mapTaxObligationStatus(storedValue);
    return mapGenericStatus(storedValue);
  }
  return storedValue;
}

/**
 * Opciones de filtro a partir de valores presentes en datos reales,
 * con etiquetas en español y valores internos sin traducir.
 */
export function buildDatosFilterOptions(
  entity: CopilotDataEntityKey,
  filterKey: string,
  rows: Array<Record<string, unknown>>
): CopilotLabeledOption[] {
  const seen = new Set<string>();
  const out: CopilotLabeledOption[] = [];
  for (const row of rows) {
    const raw = row[filterKey];
    const stored = normalizeFilterStoredValue(raw);
    if (!stored || seen.has(stored)) continue;
    seen.add(stored);
    out.push({
      value: stored,
      label: formatFilterOptionLabel(entity, filterKey, stored),
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, "es"));
}

/** Estados sueltos en evidencias / documentos (mezcla posible de dominios). */
export function formatLooseDocumentStatus(status: string): string {
  const s = status.trim();
  const lower = s.toLowerCase();
  const taxOb = mapTaxObligationStatus(lower);
  if (taxOb !== lower) return taxOb;
  if (["issued", "overdue", "partial"].includes(lower)) return mapInvoiceStatus(lower);
  if (lower === "paid") return mapPaymentStatus("paid");
  if (["scheduled", "applied", "reversed", "pending"].includes(lower)) {
    return mapPaymentStatus(lower);
  }
  if (lower === "cancelled") return "Cancelado";
  const inv = mapInvoiceStatus(lower);
  if (inv !== lower) return inv;
  const pay = mapPaymentStatus(lower);
  if (pay !== lower) return pay;
  const gen = mapGenericStatus(lower);
  if (gen !== lower) return gen;
  const ex = mapExecutionStatus(lower);
  if (ex !== lower) return ex;
  return s;
}
