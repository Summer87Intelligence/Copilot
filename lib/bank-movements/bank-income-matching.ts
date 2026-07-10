/**
 * Motor puro de sugerencias para INGRESOS bancarios (direction = inflow).
 *
 * Asocia un movimiento de entrada a un cliente y, si se puede, a un concepto de
 * cobro. Regla dura: el MONTO SOLO nunca da confianza alta — hace falta señal de
 * identidad (alias / razón social / RUT / nombre). Nunca concilia automáticamente.
 *
 * Módulo puro (sin DB, sin IA).
 */

import {
  bankDescriptionContainsRut,
  compareAliasToBankDescription,
  type AliasMatchKind,
} from "@/lib/bank-movements/bank-text-normalization";
import { isAmountWithinTolerance } from "@/lib/bank-movements/bank-movement-reconciliation";

export type IncomeConfidence = "high" | "medium" | "low";

export type IncomeAliasInput = {
  aliasText: string;
  aliasType: string;
  currency?: string | null;
  usualAmount?: number | null;
  confidenceWeight?: number;
};

export type IncomeConceptInput = {
  id: string;
  label: string;
  currency: string;
  expectedAmount?: number | null;
  billingType: "recurring" | "one_time" | "installment" | "variable";
  frequency?: string | null;
  expectedDay?: number | null;
  active: boolean;
};

export type IncomeDebtInput = { currency: string; balance: number };

export type IncomeClientInput = {
  clientId: string;
  name: string;
  legalName?: string | null;
  rut?: string | null;
  aliases: IncomeAliasInput[];
  concepts: IncomeConceptInput[];
  openDebt?: IncomeDebtInput[];
  /** Historial: el cliente ya tuvo una asociación confirmada antes. */
  hasPriorConfirmedMatch?: boolean;
};

export type IncomeMovementInput = {
  id: string;
  description: string;
  amount: number;
  currency: string;
  movement_date: string;
  direction: string;
};

export type IncomeCandidateFlags = {
  amountOnly?: boolean;
  partialPayment?: boolean;
  accumulatedPayment?: boolean;
  variableConcept?: boolean;
  ambiguousConcept?: boolean;
  multipleClientsSameAmount?: boolean;
};

export type IncomeCandidate = {
  clientId: string;
  clientName: string;
  conceptId: string | null;
  conceptLabel: string | null;
  confidence: IncomeConfidence;
  score: number;
  reasons: string[];
  flags: IncomeCandidateFlags;
};

// ─── Señal de identidad (¿quién paga?) ────────────────────────────────────────

type IdentitySignal = {
  strength: "strong" | "weak" | "none";
  score: number;
  reasons: string[];
  matchedAlias: IncomeAliasInput | null;
};

const IDENTITY_STRONG = 40;

function kindScore(kind: AliasMatchKind, strong: number, weak: number): number {
  if (kind === "exact") return strong;
  if (kind === "partial") return weak;
  return 0;
}

function evaluateIdentity(
  movement: IncomeMovementInput,
  client: IncomeClientInput
): IdentitySignal {
  let best: IdentitySignal = { strength: "none", score: 0, reasons: [], matchedAlias: null };
  const consider = (score: number, reason: string, alias: IncomeAliasInput | null) => {
    if (score > best.score) {
      best = {
        strength: score >= IDENTITY_STRONG ? "strong" : "weak",
        score,
        reasons: [reason],
        matchedAlias: alias,
      };
    }
  };

  // Alias explícitos (los más fuertes; aprendidos/manuales incluidos).
  for (const alias of client.aliases) {
    const m = compareAliasToBankDescription(alias.aliasText, movement.description);
    if (m.kind === "none") continue;
    const score = kindScore(m.kind, 50, 22);
    consider(
      score,
      m.kind === "exact"
        ? `Coincide el nombre bancario "${alias.aliasText}"`
        : `Nombre bancario parecido a "${alias.aliasText}"`,
      alias
    );
  }

  // Razón social.
  const legal = compareAliasToBankDescription(client.legalName, movement.description);
  if (legal.kind !== "none") {
    consider(
      kindScore(legal.kind, 42, 16),
      legal.kind === "exact" ? "Coincide la razón social" : "Razón social parecida",
      null
    );
  }

  // Nombre comercial.
  const commercial = compareAliasToBankDescription(client.name, movement.description);
  if (commercial.kind !== "none") {
    consider(
      kindScore(commercial.kind, 38, 14),
      commercial.kind === "exact" ? "Coincide el nombre del cliente" : "Nombre del cliente parecido",
      null
    );
  }

  // RUT (fuerte).
  if (bankDescriptionContainsRut(movement.description, client.rut)) {
    consider(52, "El RUT coincide", null);
  }

  // Bonus de historial: si ya hubo confirmación previa y hay alguna señal.
  if (client.hasPriorConfirmedMatch && best.strength !== "none") {
    best = {
      ...best,
      score: best.score + 8,
      reasons: [...best.reasons, "Ya se asoció antes a este cliente"],
    };
  }

  return best;
}

// ─── Señal de monto/concepto (¿qué se paga?) ──────────────────────────────────

type AmountSignal = {
  score: number;
  conceptId: string | null;
  conceptLabel: string | null;
  reasons: string[];
  matchedConcept: boolean;
  variable: boolean;
  partial: boolean;
  accumulated: boolean;
  debtMatched: boolean;
  conceptsMatchingAmount: number;
};

const EMPTY_AMOUNT: AmountSignal = {
  score: 0,
  conceptId: null,
  conceptLabel: null,
  reasons: [],
  matchedConcept: false,
  variable: false,
  partial: false,
  accumulated: false,
  debtMatched: false,
  conceptsMatchingAmount: 0,
};

function accumulatedFactor(amount: number, base: number, currency: string): number | null {
  if (base <= 0) return null;
  for (let k = 2; k <= 4; k += 1) {
    if (isAmountWithinTolerance(amount, base * k, currency).ok) return k;
  }
  return null;
}

function moneyLabel(currency: string, amount: number): string {
  return `${currency} ${amount}`;
}

function evaluateAmount(
  movement: IncomeMovementInput,
  client: IncomeClientInput,
  identity: IdentitySignal
): AmountSignal {
  const currency = movement.currency;
  const amount = movement.amount;
  let best: AmountSignal = { ...EMPTY_AMOUNT };
  let conceptsMatchingAmount = 0;

  const activeConcepts = client.concepts.filter((c) => c.active && c.currency === currency);

  for (const concept of activeConcepts) {
    if (concept.expectedAmount == null) continue;
    const tol = isAmountWithinTolerance(amount, concept.expectedAmount, currency);

    if (tol.ok) {
      if (concept.billingType !== "variable") conceptsMatchingAmount += 1;
      const variable = concept.billingType === "variable";
      const score = variable ? 12 : tol.exact ? 40 : 26;
      if (score > best.score) {
        best = {
          ...EMPTY_AMOUNT,
          score,
          conceptId: concept.id,
          conceptLabel: concept.label,
          reasons: [
            variable
              ? `El monto coincide con "${concept.label}" (concepto variable)`
              : `Coincide con "${concept.label}" (${moneyLabel(currency, concept.expectedAmount)})`,
          ],
          matchedConcept: !variable,
          variable,
        };
      }
      continue;
    }

    // Pago acumulado: cubre varios períodos del concepto.
    if (concept.billingType !== "variable") {
      const k = accumulatedFactor(amount, concept.expectedAmount, currency);
      if (k && best.score < 22) {
        best = {
          ...EMPTY_AMOUNT,
          score: 22,
          conceptId: concept.id,
          conceptLabel: concept.label,
          reasons: [`Puede cubrir ${k} períodos de "${concept.label}"`],
          accumulated: true,
        };
        continue;
      }
      // Pago parcial.
      if (amount < concept.expectedAmount && amount >= concept.expectedAmount * 0.2 && best.score < 12) {
        best = {
          ...EMPTY_AMOUNT,
          score: 12,
          conceptId: concept.id,
          conceptLabel: concept.label,
          reasons: [`Pago parcial posible de "${concept.label}"`],
          partial: true,
        };
      }
    }
  }

  // Deuda pendiente (si no hubo mejor señal de concepto exacto).
  const debt = (client.openDebt ?? []).find((d) => d.currency === currency);
  if (debt && debt.balance > 0) {
    const tol = isAmountWithinTolerance(amount, debt.balance, currency);
    if (tol.ok && best.score < (tol.exact ? 30 : 20)) {
      best = {
        ...EMPTY_AMOUNT,
        score: tol.exact ? 30 : 20,
        conceptId: best.conceptId,
        conceptLabel: best.conceptLabel,
        reasons: ["Coincide con la deuda pendiente"],
        debtMatched: true,
      };
    } else if (!tol.ok && amount < debt.balance && best.score === 0) {
      best = {
        ...EMPTY_AMOUNT,
        score: 8,
        reasons: ["Pago parcial posible sobre la deuda"],
        partial: true,
      };
    }
  }

  // Monto habitual del alias que identificó al cliente.
  const alias = identity.matchedAlias;
  if (
    alias &&
    alias.usualAmount != null &&
    (!alias.currency || alias.currency === currency) &&
    isAmountWithinTolerance(amount, alias.usualAmount, currency).ok &&
    best.score < 40
  ) {
    best = {
      ...best,
      score: Math.max(best.score, 38),
      matchedConcept: best.matchedConcept || best.conceptId != null,
      reasons: [...(best.reasons.length ? best.reasons : []), "Coincide con el monto habitual del cliente"],
    };
  }

  best.conceptsMatchingAmount = conceptsMatchingAmount;
  return best;
}

// ─── Decisión de confianza (reglas duras) ─────────────────────────────────────

function decideCandidate(
  movement: IncomeMovementInput,
  client: IncomeClientInput,
  identity: IdentitySignal,
  amount: AmountSignal
): IncomeCandidate | null {
  const reasons = [...identity.reasons, ...amount.reasons];
  const flags: IncomeCandidateFlags = {};
  if (amount.partial) flags.partialPayment = true;
  if (amount.accumulated) flags.accumulatedPayment = true;
  if (amount.variable) flags.variableConcept = true;
  if (amount.conceptsMatchingAmount > 1) flags.ambiguousConcept = true;

  const totalScore = identity.score + amount.score;

  // Sin identidad: a lo sumo baja. El monto solo NUNCA da alta ni media.
  if (identity.strength === "none") {
    if (amount.score <= 0) return null;
    flags.amountOnly = true;
    return {
      clientId: client.clientId,
      clientName: client.name,
      conceptId: amount.conceptId,
      conceptLabel: amount.conceptLabel,
      confidence: "low",
      score: totalScore,
      reasons: reasons.length ? reasons : ["Solo coincide el monto"],
      flags,
    };
  }

  const hasConcreteAmount = amount.matchedConcept || amount.debtMatched;
  const clean = !amount.partial && !amount.accumulated && !amount.variable && !flags.ambiguousConcept;

  let confidence: IncomeConfidence;
  if (identity.strength === "strong" && hasConcreteAmount && clean) {
    confidence = "high";
  } else if (identity.strength === "strong") {
    // Identifica al cliente pero el concepto/monto es ambiguo, parcial,
    // acumulado, variable o inexistente ⇒ media.
    confidence = "medium";
  } else if (amount.score > 0) {
    // Identidad débil + algo de monto ⇒ media.
    confidence = "medium";
  } else {
    // Identidad débil sin monto ⇒ baja.
    confidence = "low";
  }

  return {
    clientId: client.clientId,
    clientName: client.name,
    conceptId: amount.conceptId,
    conceptLabel: amount.conceptLabel,
    confidence,
    score: totalScore,
    reasons,
    flags,
  };
}

export function scoreClientIncomeCandidate(
  movement: IncomeMovementInput,
  client: IncomeClientInput
): IncomeCandidate | null {
  const identity = evaluateIdentity(movement, client);
  const amount = evaluateAmount(movement, client, identity);
  if (identity.strength === "none" && amount.score <= 0) return null;
  return decideCandidate(movement, client, identity, amount);
}

const CONFIDENCE_RANK: Record<IncomeConfidence, number> = { high: 0, medium: 1, low: 2 };

/**
 * Genera candidatos ordenados para un ingreso. Solo aplica a movimientos de
 * entrada. Marca `multipleClientsSameAmount` cuando el monto coincide con varios
 * clientes sin identidad clara.
 */
export function buildIncomeCandidates(
  movement: IncomeMovementInput,
  clients: IncomeClientInput[]
): IncomeCandidate[] {
  if (movement.direction !== "inflow") return [];

  const candidates = clients
    .map((client) => scoreClientIncomeCandidate(movement, client))
    .filter((c): c is IncomeCandidate => c != null);

  const amountOnly = candidates.filter((c) => c.flags.amountOnly);
  if (amountOnly.length > 1) {
    for (const c of amountOnly) c.flags.multipleClientsSameAmount = true;
  }

  return candidates.sort((a, b) => {
    const byConfidence = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
    if (byConfidence !== 0) return byConfidence;
    return b.score - a.score;
  });
}
