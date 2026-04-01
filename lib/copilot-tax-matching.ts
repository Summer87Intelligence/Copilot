/**
 * Matching heurístico pago operativo ↔ obligación fiscal (sin llamadas de red).
 */

export type TaxObligationMatchCandidate = {
  id: string;
  company_id?: string | null;
  status: string;
  due_date: string;
  estimated_amount: number;
  confirmed_amount: number | null;
};

export type MatchTaxObligationForPaymentInput = {
  amount: number;
  date: string;
  category?: string;
  company_id: string;
  /** Obligaciones candidatas (p. ej. todas las cargadas en cliente). */
  obligations: ReadonlyArray<TaxObligationMatchCandidate>;
};

export type MatchTaxObligationForPaymentResult = {
  obligation_id: string | null;
  score: number;
  reason: string;
};

function isPaidStatus(status: string): boolean {
  return String(status ?? "").trim().toLowerCase() === "paid";
}

function obligationMatchesCompany(
  o: TaxObligationMatchCandidate,
  companyId: string
): boolean {
  const oc = o.company_id != null ? String(o.company_id).trim() : "";
  if (!oc) return true;
  return oc === companyId;
}

function referenceAmount(o: TaxObligationMatchCandidate): number {
  const c = o.confirmed_amount;
  if (c != null && Number.isFinite(c) && c > 0) return c;
  return Number.isFinite(o.estimated_amount) && o.estimated_amount > 0
    ? o.estimated_amount
    : 0;
}

function scoreAmount(paymentAmount: number, ref: number): number {
  if (ref <= 0 || !Number.isFinite(paymentAmount) || paymentAmount <= 0) return 0;
  const diffPct = (Math.abs(paymentAmount - ref) / ref) * 100;
  if (diffPct <= 2) return 50;
  if (diffPct <= 5) return 30;
  return 0;
}

function daysBetweenYmd(a: string, b: string): number {
  const sa = String(a ?? "").slice(0, 10);
  const sb = String(b ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sa) || !/^\d{4}-\d{2}-\d{2}$/.test(sb)) {
    return 9999;
  }
  const da = new Date(`${sa}T12:00:00`);
  const db = new Date(`${sb}T12:00:00`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 9999;
  return Math.round(Math.abs(da.getTime() - db.getTime()) / 86400000);
}

function scoreDate(paymentDateYmd: string, dueYmd: string): number {
  const d = daysBetweenYmd(paymentDateYmd, dueYmd);
  if (d <= 15) return 30;
  if (d <= 30) return 15;
  return 0;
}

function scoreCategory(category: string | undefined): number {
  const c = String(category ?? "").toLowerCase();
  return c.includes("impuesto") ? 20 : 0;
}

const MIN_SCORE_TO_SUGGEST = 50;

/**
 * Elige la obligación abierta con mayor puntuación (monto, fecha, categoría).
 * No persiste nada; el caller decide si aplica la sugerencia en UI.
 */
export function matchTaxObligationForPayment(
  input: MatchTaxObligationForPaymentInput
): MatchTaxObligationForPaymentResult {
  const companyId = String(input.company_id ?? "").trim();
  if (!companyId) {
    return {
      obligation_id: null,
      score: 0,
      reason: "Falta empresa para acotar candidatos.",
    };
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      obligation_id: null,
      score: 0,
      reason: "Monto inválido o no informado.",
    };
  }

  const dateYmd = String(input.date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    return {
      obligation_id: null,
      score: 0,
      reason: "Fecha de pago inválida.",
    };
  }

  let best: {
    id: string;
    score: number;
    parts: string[];
  } | null = null;

  for (const o of input.obligations) {
    if (isPaidStatus(o.status)) continue;
    if (!obligationMatchesCompany(o, companyId)) continue;

    const ref = referenceAmount(o);
    const a = scoreAmount(amount, ref);
    const dt = scoreDate(dateYmd, o.due_date);
    const cat = scoreCategory(input.category);
    const total = a + dt + cat;

    const parts: string[] = [];
    if (a === 50) parts.push("monto ≤2%");
    else if (a === 30) parts.push("monto ≤5%");
    if (dt === 30) parts.push("fecha ±15 días");
    else if (dt === 15) parts.push("fecha ±30 días");
    if (cat > 0) parts.push("categoría impuesto");

    if (!best || total > best.score || (total === best.score && o.id < best.id)) {
      best = { id: o.id, score: total, parts };
    }
  }

  if (!best || best.score < MIN_SCORE_TO_SUGGEST) {
    return {
      obligation_id: null,
      score: best?.score ?? 0,
      reason: best
        ? `Mejor candidata ${best.score}/100 (mínimo ${MIN_SCORE_TO_SUGGEST} para sugerir).`
        : "Sin candidatas abiertas para esta empresa.",
    };
  }

  return {
    obligation_id: best.id,
    score: best.score,
    reason:
      best.parts.length > 0
        ? `Coincidencia: ${best.parts.join(", ")}.`
        : "Coincidencia por reglas de scoring.",
  };
}
