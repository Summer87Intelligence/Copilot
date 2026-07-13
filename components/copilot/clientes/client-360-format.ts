/**
 * Formatters y traducciones compartidas de la ficha Cliente 360.
 * Extraído de copilot-client-360-view.tsx para reutilizar en los tabs.
 * Copy alineado a docs/product/copilot-operating-language.md (no "vencido").
 */

export function formatMoney(n: number, currency?: string | null): string {
  const sym = currency === "USD" ? "U$S" : "$";
  return `${sym} ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

export function formatDateShort(ymd: string): string {
  if (!ymd || ymd === "—") return ymd;
  try {
    return new Date(ymd + "T12:00:00").toLocaleDateString("es-UY", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return ymd;
  }
}

export function formatRelativeDays(ymd: string): string {
  try {
    const d = new Date(ymd + "T12:00:00Z");
    const now = new Date();
    const diff = Math.round((now.getTime() - d.getTime()) / 86_400_000);
    if (diff === 0) return "hoy";
    if (diff === 1) return "ayer";
    if (diff < 30) return `hace ${diff} días`;
    if (diff < 60) return "hace ~1 mes";
    return formatDateShort(ymd);
  } catch {
    return formatDateShort(ymd);
  }
}

// ─── Limpiadores de referencias técnicas ─────────────────────────────────────

export function cleanMovementLabel(label: string): string {
  if (!label || /^ZETA:/i.test(label)) return "";
  return label;
}

export function cleanInvoiceType(tipo: string): string {
  if (!tipo) return "Factura";
  const lower = tipo.toLowerCase();
  if (lower.includes("nota de cr") || lower.includes("credit note")) return "Ajuste";
  if (lower.includes("recibo") || lower.includes("receipt")) return "Recibo";
  return "Factura";
}

export function cleanSerieNumero(sn: string): string {
  if (!sn) return "—";
  return sn;
}

// ─── Traducciones de estado ───────────────────────────────────────────────────

export function translateInvoiceStatus(estado: string): string {
  const map: Record<string, string> = {
    paid: "Pagada",
    issued: "Emitida",
    pending: "Pendiente",
    overdue: "Con atraso",
    cancelled: "Cancelada",
  };
  return map[estado.toLowerCase()] ?? estado;
}

export function invoiceBadgeTone(
  estado: string
): "success" | "warning" | "danger" | "neutral" {
  if (estado === "paid") return "success";
  if (estado === "overdue") return "danger";
  if (estado === "pending" || estado === "issued") return "warning";
  return "neutral";
}

export function translateReceiptStatus(estado: string): string {
  const map: Record<string, string> = {
    paid: "Cobrado",
    pending: "Pendiente",
  };
  return map[estado.toLowerCase()] ?? estado;
}
