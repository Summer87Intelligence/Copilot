/**
 * Parser de texto extraído de PDF "Estados de Cuenta Clientes" exportado desde Zeta.
 * Entrada: texto plano (pdf-parse getText). Salida: clientes por moneda con totales ledger.
 */

export type ZetaPdfMovementKind = "invoice" | "credit_note" | "receipt";

export type ZetaPdfMovement = {
  date: string;
  kind: ZetaPdfMovementKind;
  number: string;
  debit: number;
  credit: number;
  runningBalance: number;
};

export type ZetaPdfClientStatement = {
  codigo: string;
  name: string;
  currency: "UYU" | "USD";
  openingBalance: number | null;
  finalBalance: number | null;
  totalDebit: number;
  totalCredit: number;
  movementCount: number;
  cfeCount: number;
  receiptCount: number;
  movements: ZetaPdfMovement[];
  parseWarnings: string[];
};

const CLIENT_HEADER_RE = /^(\d{1,4})\s*-\s*(.+)$/;
const OPENING_RE = /^Saldo anterior\.\.\.\s*(-?[\d.,]+)$/;
const SALDO_FINAL_RE = /^SALDO\s+(?:\$|U\$S)\s+al\s+\d{2}\/\d{2}\/\d{2}\s+\.\.\.\s+(-?[\d.,]+)$/;
const MONEDA_RE = /^Moneda:\s*(Pesos|D[oó]lares)$/i;
const MOVEMENT_START_RE =
  /^(\d{2}\/\d{2}\/\d{2})\s+(Venta Cr[eé]dito \(CFE\)|Nota de Cr[eé]dito Venta \(CFE\)|Recibo de Cobro)(?:\s|$)/;

export function parseZetaAmount(raw: string): number {
  const t = raw.trim();
  if (!t) return 0;
  const negative = t.startsWith("-");
  const normalized = t.replace(/^-/, "").replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseMovementLine(line: string): ZetaPdfMovement | null {
  const m = line.match(MOVEMENT_START_RE);
  if (!m) return null;

  const date = m[1]!;
  const kindRaw = m[2]!;
  let kind: ZetaPdfMovementKind;
  if (/Nota de Cr/.test(kindRaw)) kind = "credit_note";
  else if (/Recibo/.test(kindRaw)) kind = "receipt";
  else kind = "invoice";

  const amounts = [...line.matchAll(/(-?[\d.]+,\d{2})/g)].map((x) => parseZetaAmount(x[1]!));
  if (amounts.length < 2) return null;

  const runningBalance = amounts[amounts.length - 1]!;
  const numberMatch = line.match(/\b([A-Z]\d+)\b/);
  const number = numberMatch?.[1] ?? "";

  let debit = 0;
  let credit = 0;
  if (kind === "receipt" || kind === "credit_note") {
    credit = amounts[0]!;
  } else {
    debit = amounts[0]!;
  }

  return {
    date,
    kind,
    number,
    debit: round2(debit),
    credit: round2(credit),
    runningBalance: round2(runningBalance),
  };
}

function inferOpeningFromMovements(movements: ZetaPdfMovement[]): number {
  if (movements.length === 0) return 0;
  const first = movements[0]!;
  return round2(first.runningBalance - first.debit + first.credit);
}

function finalizeClient(
  draft: Omit<ZetaPdfClientStatement, "totalDebit" | "totalCredit" | "movementCount" | "cfeCount" | "receiptCount">
): ZetaPdfClientStatement {
  const warnings = [...draft.parseWarnings];
  let openingBalance = draft.openingBalance;

  if (openingBalance == null) {
    if (draft.movements.length > 0) {
      openingBalance = inferOpeningFromMovements(draft.movements);
      warnings.push("opening_inferred_from_first_movement");
    } else {
      openingBalance = 0;
      warnings.push("opening_missing_defaulted_zero");
    }
  }

  if (draft.finalBalance == null && draft.movements.length > 0) {
    warnings.push("final_missing_used_last_running_balance");
  }

  const finalBalance =
    draft.finalBalance ??
    (draft.movements.length > 0
      ? draft.movements[draft.movements.length - 1]!.runningBalance
      : openingBalance);

  let totalDebit = 0;
  let totalCredit = 0;
  let cfeCount = 0;
  let receiptCount = 0;
  for (const mv of draft.movements) {
    totalDebit += mv.debit;
    totalCredit += mv.credit;
    if (mv.kind === "invoice" || mv.kind === "credit_note") cfeCount += 1;
    if (mv.kind === "receipt") receiptCount += 1;
  }

  return {
    ...draft,
    openingBalance: round2(openingBalance),
    finalBalance: round2(finalBalance),
    totalDebit: round2(totalDebit),
    totalCredit: round2(totalCredit),
    movementCount: draft.movements.length,
    cfeCount,
    receiptCount,
    parseWarnings: warnings,
  };
}

type DraftClient = {
  codigo: string;
  name: string;
  currency: "UYU" | "USD";
  openingBalance: number | null;
  finalBalance: number | null;
  movements: ZetaPdfMovement[];
  parseWarnings: string[];
};

/**
 * Parsea el texto completo de un PDF Zeta (una moneda por archivo).
 */
export function parseZetaEstadoCuentaPdfText(
  text: string,
  defaultCurrency: "UYU" | "USD"
): ZetaPdfClientStatement[] {
  const lines = text.split(/\r?\n/);
  const byKey = new Map<string, DraftClient>();

  let currentCurrency: "UYU" | "USD" = defaultCurrency;
  let currentKey: string | null = null;

  function ensureDraft(codigo: string, name: string): DraftClient {
    const key = `${currentCurrency}|${codigo}`;
    const existing = byKey.get(key);
    if (existing) {
      if (name.trim() && !existing.name.includes(name.trim())) {
        existing.name = name.trim();
      }
      currentKey = key;
      return existing;
    }
    const draft: DraftClient = {
      codigo,
      name: name.trim(),
      currency: currentCurrency,
      openingBalance: null,
      finalBalance: null,
      movements: [],
      parseWarnings: [],
    };
    byKey.set(key, draft);
    currentKey = key;
    return draft;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const monedaMatch = line.match(MONEDA_RE);
    if (monedaMatch) {
      currentCurrency = /d[oó]lar/i.test(monedaMatch[1]!) ? "USD" : "UYU";
      continue;
    }

    const clientMatch = line.match(CLIENT_HEADER_RE);
    if (clientMatch) {
      const codigo = clientMatch[1]!.trim();
      const name = clientMatch[2]!.trim();
      // Ignorar líneas de dirección tipo "1178 - Tel."
      if (/^\d+\s*-\s*Tel/i.test(line)) continue;
      ensureDraft(codigo, name);
      continue;
    }

    if (!currentKey) continue;
    const draft = byKey.get(currentKey);
    if (!draft) continue;

    const openingMatch = line.match(OPENING_RE);
    if (openingMatch) {
      if (draft.openingBalance == null) {
        draft.openingBalance = parseZetaAmount(openingMatch[1]!);
      }
      continue;
    }

    const saldoMatch = line.match(SALDO_FINAL_RE);
    if (saldoMatch) {
      draft.finalBalance = parseZetaAmount(saldoMatch[1]!);
      continue;
    }

    const mv = parseMovementLine(line);
    if (mv) {
      draft.movements.push(mv);
    }
  }

  return [...byKey.values()].map((d) => finalizeClient(d));
}
