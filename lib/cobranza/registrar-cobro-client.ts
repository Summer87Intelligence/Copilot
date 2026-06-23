import type { CobranzaRegistrarCobroBody } from "@/lib/api/schemas/cobranza-registrar-cobro-body";
import { convertToUsdEquivalent } from "@/lib/currency-display-mode";
import type { TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

export const COBRANZA_REGISTRAR_COBRO_API = "/api/copilot/cobranza/registrar-cobro" as const;

export const COBRANZA_REGISTRAR_COBRO_TRUST_COPY =
  "Este registro impacta Tesorería inmediatamente. No modifica facturas en Zeta.";

export type RegistrarCobroFormValues = {
  companyId: string;
  paymentDate: string;
  amount: string;
  currencyCode: TreasuryCurrencyCode;
  bankOrigin: string;
  accountId: string;
  reference: string;
  notes: string;
  affectsCashflow: boolean;
};

export type RegistrarCobroFieldErrors = Partial<
  Record<keyof RegistrarCobroFormValues | "form", string>
>;

export type RegistrarCobroWarning = {
  code: string;
  message: string;
};

export type RegistrarCobroApiSuccess = {
  ok: true;
  message?: string;
  idempotent?: boolean;
  data?: {
    manual_cash_movement?: { id: string };
    collection_action?: { id: string };
  };
  warnings?: RegistrarCobroWarning[];
};

export type RegistrarCobroApiFailure = {
  ok: false;
  code?: string;
  message?: string;
  partial?: boolean;
  movement_id?: string;
};

export type RegistrarCobroSubmitResult =
  | { ok: true; message: string; warnings: RegistrarCobroWarning[] }
  | { ok: false; message: string; partial?: boolean; movementId?: string };

export function todayYmdLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createEmptyRegistrarCobroForm(today = todayYmdLocal()): RegistrarCobroFormValues {
  return {
    companyId: "",
    paymentDate: today,
    amount: "",
    currencyCode: "UYU",
    bankOrigin: "",
    accountId: "",
    reference: "",
    notes: "",
    affectsCashflow: true,
  };
}

/** Si una sola moneda con deuda → esa; si ambas → mayor deuda en USD equivalente. */
export function inferDefaultCurrencyFromDebt(
  debtUyu: number,
  debtUsd: number,
  fxRate = 40
): TreasuryCurrencyCode | null {
  const hasUyu = debtUyu > 0.005;
  const hasUsd = debtUsd > 0.005;
  if (hasUyu && !hasUsd) return "UYU";
  if (hasUsd && !hasUyu) return "USD";
  if (!hasUyu && !hasUsd) return null;
  const uyuEquiv = convertToUsdEquivalent({ uyu: debtUyu, usd: 0 }, fxRate);
  const usdEquiv = convertToUsdEquivalent({ uyu: 0, usd: debtUsd }, fxRate);
  return uyuEquiv >= usdEquiv ? "UYU" : "USD";
}

export function validateRegistrarCobroForm(
  values: RegistrarCobroFormValues,
  today = todayYmdLocal()
): RegistrarCobroFieldErrors {
  const errors: RegistrarCobroFieldErrors = {};
  if (!values.companyId.trim()) {
    errors.companyId = "Seleccioná un cliente.";
  }
  if (!values.paymentDate || !/^\d{4}-\d{2}-\d{2}$/.test(values.paymentDate)) {
    errors.paymentDate = "Fecha inválida.";
  } else if (values.paymentDate > today) {
    errors.paymentDate = "La fecha no puede ser futura.";
  }
  const amount = parseAmount(values.amount);
  if (amount == null || amount <= 0) {
    errors.amount = "El monto debe ser mayor a 0.";
  }
  if (values.currencyCode !== "UYU" && values.currencyCode !== "USD") {
    errors.currencyCode = "Moneda inválida.";
  }
  if (values.bankOrigin.length > 120) {
    errors.bankOrigin = "Máximo 120 caracteres.";
  }
  if (values.reference.length > 200) {
    errors.reference = "Máximo 200 caracteres.";
  }
  if (values.notes.length > 500) {
    errors.notes = "Máximo 500 caracteres.";
  }
  return errors;
}

export function parseAmount(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function buildRegistrarCobroPayload(
  values: RegistrarCobroFormValues,
  clientRequestId: string
): CobranzaRegistrarCobroBody {
  const amount = parseAmount(values.amount);
  if (amount == null || amount <= 0) {
    throw new Error("Monto inválido.");
  }
  return {
    company_id: values.companyId.trim(),
    payment_date: values.paymentDate,
    amount,
    currency_code: values.currencyCode,
    bank_origin: values.bankOrigin.trim() || undefined,
    account_id: values.accountId.trim() || null,
    reference: values.reference.trim() || undefined,
    notes: values.notes.trim() || undefined,
    affects_cashflow: values.affectsCashflow,
    client_request_id: clientRequestId,
  };
}

export function formatRegistrarCobroWarnings(warnings: RegistrarCobroWarning[]): string | null {
  if (!warnings.length) return null;
  return warnings.map((w) => w.message).join(" ");
}

export type RegistrarCobroPrefill = {
  companyId?: string;
  debtUyu?: number;
  debtUsd?: number;
};

export function buildInitialRegistrarCobroFormFromPrefill(
  prefill: RegistrarCobroPrefill | null | undefined,
  today = todayYmdLocal(),
  fxRate = 40
): RegistrarCobroFormValues {
  const base = createEmptyRegistrarCobroForm(today);
  if (!prefill?.companyId) return base;
  const currency = inferDefaultCurrencyFromDebt(
    prefill.debtUyu ?? 0,
    prefill.debtUsd ?? 0,
    fxRate
  );
  return {
    ...base,
    companyId: prefill.companyId,
    currencyCode: currency ?? base.currencyCode,
  };
}

export async function submitRegistrarCobro(
  values: RegistrarCobroFormValues,
  clientRequestId: string,
  fetchFn: typeof import("@/lib/copilot-fetch").copilotApiFetch = async (...args) => {
    const { copilotApiFetch } = await import("@/lib/copilot-fetch");
    return copilotApiFetch(...args);
  }
): Promise<RegistrarCobroSubmitResult> {
  try {
    const payload = buildRegistrarCobroPayload(values, clientRequestId);
    const res = await fetchFn(COBRANZA_REGISTRAR_COBRO_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await res.json().catch(() => ({}))) as
      | RegistrarCobroApiSuccess
      | RegistrarCobroApiFailure;

    if (res.status === 207 || json.ok === false) {
      const failure = json as RegistrarCobroApiFailure;
      if (failure.partial) {
        return {
          ok: false,
          partial: true,
          movementId: failure.movement_id,
          message:
            "El ingreso se registró en caja, pero faltó guardar la evidencia de cobranza. Reintentá o revisá Tesorería.",
        };
      }
      return {
        ok: false,
        message: failure.message ?? "No se pudo registrar el cobro.",
      };
    }

    if (!json.ok) {
      return {
        ok: false,
        message:
          (json as RegistrarCobroApiFailure).message ?? "No se pudo registrar el cobro.",
      };
    }

    const success = json as RegistrarCobroApiSuccess;
    return {
      ok: true,
      message: success.idempotent
        ? "Cobro ya registrado (idempotente)."
        : "Cobro registrado en Tesorería.",
      warnings: success.warnings ?? [],
    };
  } catch {
    return {
      ok: false,
      message: "Error de red. Intentá de nuevo.",
    };
  }
}
