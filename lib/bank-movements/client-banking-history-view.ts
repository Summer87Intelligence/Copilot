/**
 * FASE CLIENT-BANKING-IDENTIFICATION-CLARITY-AND-HISTORY-CLEANUP-001
 *
 * View-model puro: resumen activo, alias observables y correcciones.
 * La normalización interna NO se usa como texto principal de UI.
 */
import {
  getBankMovementDisplayDescription,
  type BankMovementDescriptionSource,
} from "@/lib/bank-movements/bank-movement-display";

const COMPANY_TOKEN_RE =
  /([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ .,&'\-]{0,40}?(?:S\.?\s*A\.?|SRL|LTDA\.?|SAS))/gi;
const QA_RESET_REASON_RE = /bank_simple_reconciliation_reset|reset de conciliaciones|qa.?reset/i;

/** Extrae razón social / nombres observados (típicamente al final de la descripción). */
export function extractObservedPayerNames(displayDescription: string): string[] {
  const text = displayDescription.trim();
  if (!text) return [];
  const matches = [...text.matchAll(COMPANY_TOKEN_RE)]
    .map((m) => m[1]!.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 3);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of matches) {
    const key = p.toUpperCase().normalize("NFD").replace(/\p{M}/gu, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/** Concepto frecuente sin el nombre del pagador ni referencias numéricas largas. */
export function extractFrequentDescriptionConcept(displayDescription: string): string | null {
  let text = displayDescription.trim();
  if (!text) return null;
  const names = extractObservedPayerNames(text);
  for (const name of names.slice().reverse()) {
    const idx = text.toUpperCase().lastIndexOf(name.toUpperCase());
    if (idx >= 0) text = `${text.slice(0, idx)} ${text.slice(idx + name.length)}`.trim();
  }
  text = text
    .replace(/\b\d{5,}\b/g, " ")
    .replace(/[.…]+/g, " ")
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 8) return null;
  return text;
}

export type ClientBankingAssociationRow = {
  id: string;
  movementId: string;
  status: string;
  movementDate: string | null;
  associatedAt: string | null;
  revokedAt: string | null;
  importedAt: string | null;
  amount: number | null;
  currency: string | null;
  amountLabel: string | null;
  displayDescription: string;
  bankReference: string | null;
  confirmedByEmail: string | null;
  revokedByEmail: string | null;
  reason: string | null;
  isDuplicate: boolean;
  excludedFromOperations: boolean;
  isNonCommercial: boolean;
};

export type ClientBankingSummary = {
  activeCount: number;
  totalUyu: number;
  totalUsd: number;
  firstTransferDate: string | null;
  lastTransferDate: string | null;
  currencies: string[];
  confidenceLabel: "Sin historial suficiente" | "Posible" | "Habitual";
};

export type ClientBankingHowAppears = {
  observedNames: string[];
  frequentDescription: string | null;
  maskedAccount: string | null;
};

export type HabitualPaymentPattern = {
  bankName: string | null;
  frequentDescription: string | null;
  currency: string | null;
  movementCount: number;
  amountHint: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  statusLabel: "Sin historial suficiente" | "Posible" | "Habitual";
};

export type CorrectionsGroup = {
  key: string;
  label: string;
  count: number;
  items: ClientBankingAssociationRow[];
};

function isActiveStatus(status: string): boolean {
  return status !== "revoked" && status !== "excluded";
}

/** True si el string parece descripción normalizada completa, no un nombre. */
export function looksLikeNormalizedDescriptionDump(value: string | null | undefined): boolean {
  if (!value) return true;
  const v = value.trim();
  if (v.length < 3) return true;
  const lower = v.toLowerCase();
  if (lower.includes("operacion en banca") || lower.includes("transferencia recibida")) return true;
  if (lower.includes(" credito ") || lower.startsWith("credito ")) return true;
  // Muchas palabras en minúsculas sin S.A./SRL → dump
  const words = lower.split(/\s+/);
  if (words.length >= 5 && !/s\.?\s*a\.?|srl|ltda/i.test(v)) return true;
  return false;
}

export function pickVisibleAliasName(input: {
  originalName?: string | null;
  normalizedName?: string | null;
  displayDescription?: string | null;
}): string | null {
  const fromDesc = input.displayDescription
    ? extractObservedPayerNames(input.displayDescription)
    : [];
  if (fromDesc.length > 0) return fromDesc.join(" / ");
  if (input.originalName && !looksLikeNormalizedDescriptionDump(input.originalName)) {
    return input.originalName.trim();
  }
  if (input.normalizedName && !looksLikeNormalizedDescriptionDump(input.normalizedName)) {
    return input.normalizedName.trim();
  }
  return fromDesc[0] ?? null;
}

export function filterActiveBankingRows(
  rows: ClientBankingAssociationRow[]
): ClientBankingAssociationRow[] {
  return rows.filter(
    (r) =>
      isActiveStatus(r.status) &&
      !r.isDuplicate &&
      !r.excludedFromOperations &&
      !r.isNonCommercial
  );
}

export function filterCorrectionRows(
  rows: ClientBankingAssociationRow[]
): ClientBankingAssociationRow[] {
  return rows.filter((r) => r.status === "revoked");
}

export function buildClientBankingSummary(
  activeRows: ClientBankingAssociationRow[]
): ClientBankingSummary {
  let totalUyu = 0;
  let totalUsd = 0;
  const currencies = new Set<string>();
  const dates: string[] = [];
  for (const r of activeRows) {
    if (r.currency) currencies.add(r.currency);
    if (r.movementDate) dates.push(r.movementDate.slice(0, 10));
    if (r.amount != null && r.currency === "UYU") totalUyu += r.amount;
    if (r.amount != null && r.currency === "USD") totalUsd += r.amount;
  }
  dates.sort();
  const count = activeRows.length;
  return {
    activeCount: count,
    totalUyu,
    totalUsd,
    firstTransferDate: dates[0] ?? null,
    lastTransferDate: dates[dates.length - 1] ?? null,
    currencies: Array.from(currencies).sort(),
    confidenceLabel: count === 0 ? "Sin historial suficiente" : count < 3 ? "Posible" : "Habitual",
  };
}

export function buildHowAppearsFromActive(
  activeRows: ClientBankingAssociationRow[],
  maskedAccount?: string | null
): ClientBankingHowAppears {
  const nameCounts = new Map<string, number>();
  const conceptCounts = new Map<string, number>();
  for (const r of activeRows) {
    for (const n of extractObservedPayerNames(r.displayDescription)) {
      const key = n.toUpperCase();
      nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    }
    const concept = extractFrequentDescriptionConcept(r.displayDescription);
    if (concept) {
      const key = concept.toUpperCase();
      conceptCounts.set(key, (conceptCounts.get(key) ?? 0) + 1);
    }
  }
  const observedNames = Array.from(nameCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => {
      // recover original casing from first matching row
      for (const r of activeRows) {
        const found = extractObservedPayerNames(r.displayDescription).find(
          (n) => n.toUpperCase() === k
        );
        if (found) return found;
      }
      return k;
    });
  let frequentDescription: string | null = null;
  const topConcept = Array.from(conceptCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topConcept) {
    for (const r of activeRows) {
      const c = extractFrequentDescriptionConcept(r.displayDescription);
      if (c && c.toUpperCase() === topConcept[0]) {
        frequentDescription = c;
        break;
      }
    }
  }
  return {
    observedNames,
    frequentDescription,
    maskedAccount: maskedAccount ?? null,
  };
}

export function buildHabitualPaymentPattern(
  activeRows: ClientBankingAssociationRow[],
  howAppears: ClientBankingHowAppears
): HabitualPaymentPattern {
  const summary = buildClientBankingSummary(activeRows);
  const currency =
    summary.currencies.length === 1
      ? summary.currencies[0]!
      : summary.currencies.length > 1
        ? summary.currencies.join(" · ")
        : null;
  let amountHint: string | null = null;
  if (activeRows.length === 1 && activeRows[0]?.amountLabel) {
    amountHint = activeRows[0].amountLabel;
  } else if (activeRows.length >= 2) {
    const amounts = activeRows.map((r) => r.amount).filter((n): n is number => n != null);
    if (amounts.length >= 2) {
      const min = Math.min(...amounts);
      const max = Math.max(...amounts);
      const cur = activeRows[0]?.currency ?? "";
      amountHint =
        min === max
          ? `${cur} ${min.toLocaleString("es-UY")}`
          : `${cur} ${min.toLocaleString("es-UY")} – ${max.toLocaleString("es-UY")}`;
    }
  }
  return {
    bankName: howAppears.observedNames.join(" / ") || null,
    frequentDescription: howAppears.frequentDescription,
    currency,
    movementCount: summary.activeCount,
    amountHint,
    firstSeen: summary.firstTransferDate,
    lastSeen: summary.lastTransferDate,
    statusLabel: summary.confidenceLabel,
  };
}

export function groupCorrections(
  corrections: ClientBankingAssociationRow[]
): CorrectionsGroup[] {
  const qaReset = corrections.filter((c) =>
    QA_RESET_REASON_RE.test(c.reason ?? "")
  );
  const other = corrections.filter((c) => !QA_RESET_REASON_RE.test(c.reason ?? ""));
  const groups: CorrectionsGroup[] = [];
  if (qaReset.length > 0) {
    groups.push({
      key: "qa_reset",
      label: `Reset de conciliaciones de prueba — ${qaReset.length} asociación${qaReset.length === 1 ? "" : "es"} revocada${qaReset.length === 1 ? "" : "s"}`,
      count: qaReset.length,
      items: qaReset,
    });
  }
  if (other.length > 0) {
    groups.push({
      key: "other",
      label: `Otras correcciones (${other.length})`,
      count: other.length,
      items: other,
    });
  }
  return groups;
}

export function associationRowFromMovement(input: {
  identification: {
    id: string;
    movementId: string;
    status: string;
    reason: string | null;
    confirmedAt: string | null;
    revokedAt: string | null;
    confirmedByEmail: string | null;
    revokedByEmail: string | null;
  };
  movement: BankMovementDescriptionSource & {
    movement_date?: string | null;
    amount?: number | string | null;
    currency?: string | null;
    bank_reference?: string | null;
    created_at?: string | null;
    status?: string | null;
    excluded_from_operations?: boolean | null;
    duplicate_of?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null;
}): ClientBankingAssociationRow {
  const mv = input.movement;
  const meta = mv?.metadata ?? {};
  const isDup =
    Boolean(mv?.duplicate_of) ||
    Boolean(mv?.excluded_from_operations) ||
    meta.duplicate_status === "duplicate_of_import";
  const amount = mv?.amount != null ? Number(mv.amount) : null;
  const currency = mv?.currency ?? null;
  return {
    id: input.identification.id,
    movementId: input.identification.movementId,
    status: input.identification.status,
    movementDate: mv?.movement_date ?? null,
    associatedAt: input.identification.confirmedAt,
    revokedAt: input.identification.revokedAt,
    importedAt: mv?.created_at ?? null,
    amount: Number.isFinite(amount) ? amount : null,
    currency,
    amountLabel:
      amount != null && currency && Number.isFinite(amount)
        ? `${currency} ${amount.toLocaleString("es-UY")}`
        : null,
    displayDescription: getBankMovementDisplayDescription(mv ?? {}),
    bankReference: mv?.bank_reference ?? null,
    confirmedByEmail: input.identification.confirmedByEmail,
    revokedByEmail: input.identification.revokedByEmail,
    reason: input.identification.reason,
    isDuplicate: isDup,
    excludedFromOperations: Boolean(mv?.excluded_from_operations),
    isNonCommercial: mv?.status === "ignored",
  };
}

/** Href consulta: Movimientos + highlight, sin abrir panel de asignación. */
export function buildBankMovementConsultHref(input: {
  movementId: string;
  /** returnTo hacia Cliente 360 (query sin ?) */
  clientReturnTo?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("tab", "movimientos");
  params.set("movementId", input.movementId);
  params.set("view", "consult");
  if (input.clientReturnTo?.trim()) {
    params.set("returnTo", input.clientReturnTo.trim());
  }
  return `/copilot/movimientos-bancarios?${params.toString()}`;
}
