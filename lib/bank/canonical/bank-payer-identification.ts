/**
 * FASE BANK-HISTORICAL-PAYER-IDENTIFICATION-001 — helpers puros para separar
 * "identificación de cliente" de "conciliación financiera con Zeta".
 *
 * Decisión funcional (ver docs/architecture/bank-reconciliation-canonical-engine.md):
 * un movimiento puede tener un cliente identificado sin tener nunca un recibo —
 * eso es válido y útil, y NUNCA debe describirse como "conciliado" o "factura
 * pagada". Estas funciones son de solo lectura/clasificación: no escriben nada,
 * no crean links financieros, no asumen recibos ni facturas que no existen.
 */

import {
  buildPayerToken,
  extractPayerNameFromDescription,
  isOperationReference,
  normalizePayerName,
} from "@/lib/bank/canonical/payer-identity";

export type ClusterableMovement = {
  movementId: string;
  movementDate: string; // YYYY-MM-DD
  amount: number;
  currency: string;
  description: string | null;
  bankReference: string | null;
  bankName: string | null;
};

export type PayerCluster = {
  /** Token estable derivado del nombre normalizado — NUNCA una referencia puntual. */
  clusterKey: string;
  normalizedName: string;
  /** Nombre original más frecuente entre los movimientos del cluster (para mostrar). */
  displayName: string;
  movements: ClusterableMovement[];
  months: string[]; // YYYY-MM, ordenados, sin duplicados
  currencies: string[];
  totalByCurrency: Record<string, number>;
};

/**
 * Deriva la clave de agrupación de un movimiento — nunca una referencia puntual
 * de operación (TT/LR/TR/LE/NRR), solo el nombre normalizado del pagador.
 * Movimientos sin nombre extraíble (p. ej. sin patrón reconocido) no agrupan.
 */
export function derivePayerClusterKey(movement: ClusterableMovement): string | null {
  const originalName = extractPayerNameFromDescription(movement.description);
  if (!originalName) return null;
  const normalizedName = normalizePayerName(originalName);
  if (!normalizedName) return null;
  const token = buildPayerToken(normalizedName);
  if (!token) return null;
  // Defensa en profundidad: si por algún motivo el token coincidiera con la
  // referencia puntual del propio movimiento, no es una identidad válida.
  if (isOperationReference(movement.bankReference) && token === movement.bankReference) {
    return null;
  }
  return token;
}

/**
 * Agrupa movimientos de ingreso por identidad de pagador (nombre normalizado).
 * Solo lectura — no consulta ni escribe nada, opera sobre la lista dada.
 */
export function clusterInflowMovements(movements: ClusterableMovement[]): PayerCluster[] {
  const byKey = new Map<
    string,
    { normalizedName: string; nameCounts: Map<string, number>; movements: ClusterableMovement[] }
  >();

  for (const m of movements) {
    const key = derivePayerClusterKey(m);
    if (!key) continue;
    const originalName = extractPayerNameFromDescription(m.description) ?? "";
    const normalizedName = normalizePayerName(originalName) ?? "";
    let entry = byKey.get(key);
    if (!entry) {
      entry = { normalizedName, nameCounts: new Map(), movements: [] };
      byKey.set(key, entry);
    }
    entry.movements.push(m);
    entry.nameCounts.set(originalName, (entry.nameCounts.get(originalName) ?? 0) + 1);
  }

  const clusters: PayerCluster[] = [];
  for (const [clusterKey, entry] of byKey) {
    const sortedMovements = [...entry.movements].sort((a, b) => a.movementDate.localeCompare(b.movementDate));
    const months = Array.from(
      new Set(sortedMovements.map((m) => m.movementDate.slice(0, 7)))
    ).sort();
    const currencies = Array.from(new Set(sortedMovements.map((m) => m.currency))).sort();
    const totalByCurrency: Record<string, number> = {};
    for (const m of sortedMovements) {
      totalByCurrency[m.currency] = (totalByCurrency[m.currency] ?? 0) + m.amount;
    }
    const displayName =
      [...entry.nameCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? entry.normalizedName;

    clusters.push({
      clusterKey,
      normalizedName: entry.normalizedName,
      displayName,
      movements: sortedMovements,
      months,
      currencies,
      totalByCurrency,
    });
  }

  return clusters.sort((a, b) => b.movements.length - a.movements.length);
}

export type ClientCandidate = {
  clientCompanyId: string;
  clientName: string;
};

export type ClientMatch = {
  clientCompanyId: string;
  clientName: string;
  matchType: "exact" | "contains" | "none";
};

/**
 * Formas equivalentes de sufijos legales uruguayos → forma canónica corta.
 * El orden importa: los patrones de 3 letras deben resolverse antes que el de
 * 2, para no fragmentar "S A S" en "SA S" antes de reconocerlo como "SAS".
 */
const LEGAL_SUFFIX_EQUIVALENTS: Array<[RegExp, string]> = [
  [/\bSOCIEDAD ANONIMA\b/g, "SA"],
  [/\bSOCIEDAD DE RESPONSABILIDAD LIMITADA\b/g, "SRL"],
  [/\bLIMITADA\b/g, "LTDA"],
  [/\bS\s+A\s+S\b/g, "SAS"],
  [/\bS\s+R\s+L\b/g, "SRL"],
  [/\bS\s+A\b/g, "SA"],
];

/**
 * Normalización adicional SOLO para comparar contra nombres de clientes reales
 * — quita puntuación (S.A. → SA) y expande/contrae sufijos legales
 * equivalentes (SOCIEDAD ANONIMA ↔ SA). No se usa para hashing ni para el
 * nombre mostrado al usuario, solo para decidir si dos razones sociales son
 * "la misma" pese a variantes de escritura reales en los extractos.
 */
function normalizeForClientMatching(normalizedName: string): string {
  let value = normalizedName.replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of LEGAL_SUFFIX_EQUIVALENTS) {
    value = value.replace(pattern, replacement);
  }
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Empareja un cluster de pagador contra los clientes reales del workspace por
 * nombre normalizado — nunca por importe ni por referencia puntual. Devuelve
 * TODOS los candidatos razonables (el llamador decide ambigüedad por cantidad).
 *
 * Maneja dos variantes reales del dato bancario que rompen una comparación
 * exacta ingenua: puntuación distinta (S.A. vs S A) y ruido de dirección
 * pegado al nombre cuando el extracto no cierra con una segunda barra (p. ej.
 * "NIRMEX S A CIRCUNVALACION M" sin cortar en "NIRMEX S.A.") — en ese caso el
 * nombre del cliente debe ser un prefijo del nombre del cluster.
 */
export function matchClusterToClients(
  cluster: Pick<PayerCluster, "normalizedName">,
  clients: ClientCandidate[]
): ClientMatch[] {
  const clusterName = cluster.normalizedName;
  if (!clusterName) return [];
  const clusterCmp = normalizeForClientMatching(clusterName);

  const matches: ClientMatch[] = [];
  for (const client of clients) {
    const clientNorm = normalizePayerName(client.clientName);
    if (!clientNorm) continue;
    const clientCmp = normalizeForClientMatching(clientNorm);

    if (clientCmp === clusterCmp) {
      matches.push({ clientCompanyId: client.clientCompanyId, clientName: client.clientName, matchType: "exact" });
    } else if (
      clusterCmp.startsWith(`${clientCmp} `) ||
      clientCmp.startsWith(`${clusterCmp} `) ||
      clusterCmp.includes(clientCmp) ||
      clientCmp.includes(clusterCmp)
    ) {
      matches.push({ clientCompanyId: client.clientCompanyId, clientName: client.clientName, matchType: "contains" });
    }
  }

  // Exactos primero; si hay al menos un exacto, los "contains" adicionales no
  // aportan (mismo cliente ya cubierto) salvo que sean OTRO cliente distinto.
  const exact = matches.filter((m) => m.matchType === "exact");
  if (exact.length > 0) {
    const exactIds = new Set(exact.map((m) => m.clientCompanyId));
    return [...exact, ...matches.filter((m) => m.matchType === "contains" && !exactIds.has(m.clientCompanyId))];
  }
  return matches;
}

export type EvidenceLevel = "strong" | "probable" | "ambiguous" | "none";

/**
 * Clasifica la fuerza de la evidencia de un cluster — nunca certifica una
 * asociación, solo la prioriza para revisión humana.
 *
 * - "strong": exactamente un cliente coincide por razón social exacta, con
 *   más de un movimiento (patrón repetido), o corroborado por al menos un
 *   recibo histórico de ese cliente en la misma moneda.
 * - "probable": un único cliente candidato pero por coincidencia parcial, o
 *   un solo movimiento con coincidencia exacta.
 * - "ambiguous": más de un cliente candidato distinto.
 * - "none": ningún cliente candidato.
 */
export function classifyEvidence(input: {
  cluster: Pick<PayerCluster, "movements" | "currencies">;
  clientMatches: ClientMatch[];
  hasCorroboratingReceipt: boolean;
}): EvidenceLevel {
  const distinctClients = new Set(input.clientMatches.map((m) => m.clientCompanyId));
  if (distinctClients.size === 0) return "none";
  if (distinctClients.size > 1) return "ambiguous";

  const match = input.clientMatches[0]!;
  const repeated = input.cluster.movements.length > 1;
  if (match.matchType === "exact" && (repeated || input.hasCorroboratingReceipt)) return "strong";
  if (match.matchType === "exact") return "probable";
  // "contains" único: probable solo si hay corroboración (recibo o repetición).
  if (repeated || input.hasCorroboratingReceipt) return "probable";
  return "ambiguous";
}

/**
 * Los 5 niveles de resultado (sección 1 de la fase). Nunca se saltea un nivel:
 * un movimiento sin cliente confirmado es "unidentified" aunque el cluster
 * tenga evidencia fuerte — la evidencia es una propuesta, no una confirmación.
 */
export type IdentificationLevel =
  | "unidentified"
  | "client_identified"
  | "missing_receipt"
  | "reconciled_with_receipt"
  | "full_reconciliation";

export function deriveIdentificationLevel(input: {
  clientConfirmed: boolean;
  hasCompatibleReceipt: boolean;
  hasFinancialLink: boolean;
  hasInvoiceAllocations: boolean;
}): IdentificationLevel {
  if (!input.clientConfirmed) return "unidentified";
  if (input.hasFinancialLink && input.hasInvoiceAllocations) return "full_reconciliation";
  if (input.hasFinancialLink) return "reconciled_with_receipt";
  if (!input.hasCompatibleReceipt) return "missing_receipt";
  // Cliente confirmado + existe un recibo compatible, pero todavía no se creó
  // el link financiero real (paso deliberado, nunca automático).
  return "client_identified";
}
