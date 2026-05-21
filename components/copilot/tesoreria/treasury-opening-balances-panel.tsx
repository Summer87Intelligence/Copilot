"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  CopilotGhostButton,
  CopilotPrimaryButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { TESORERIA_FIELD_CLASS } from "@/components/copilot/tesoreria/tesoreria-ui";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";

type OpeningRow = {
  currencyCode: "UYU" | "USD";
  amount: string;
  notes: string;
};

const DEFAULT_ROWS: OpeningRow[] = [
  { currencyCode: "UYU", amount: "", notes: "" },
  { currencyCode: "USD", amount: "", notes: "" },
];

type Props = {
  workspace: TreasuryWorkspace;
};

export function TreasuryOpeningBalancesPanel({ workspace }: Props) {
  const [rows, setRows] = useState<OpeningRow[]>(DEFAULT_ROWS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await copilotApiFetch("/api/copilot/treasury/opening-balances");
      const json = (await res.json()) as {
        ok?: boolean;
        data?: Array<{
          currencyCode: "UYU" | "USD";
          amount: number;
          notes: string | null;
        }>;
      };
      if (res.ok && json.ok && Array.isArray(json.data)) {
        setRows(
          DEFAULT_ROWS.map((def) => {
            const found = json.data?.find((r) => r.currencyCode === def.currencyCode);
            return {
              currencyCode: def.currencyCode,
              amount: found ? String(found.amount) : "",
              notes: found?.notes ?? "",
            };
          })
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(currency: "UYU" | "USD") {
    const row = rows.find((r) => r.currencyCode === currency);
    if (!row) return;
    const amount = Number(row.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      workspace.notify("error", "Ingresá un monto válido (≥ 0).");
      return;
    }
    setSaving(true);
    try {
      const res = await copilotApiFetch("/api/copilot/treasury/opening-balances", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency_code: currency,
          amount,
          notes: row.notes.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) {
        workspace.notify("error", json.message ?? "No se pudo guardar el saldo inicial.");
        return;
      }
      workspace.notify("success", json.message ?? "Saldo inicial guardado.");
      void workspace.refetch();
      void load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <CopilotSectionTitle
        title="Saldos iniciales opcionales"
        subtitle="Usalos solo si ya tenías dinero disponible antes de empezar a medir con Copilot."
      />

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Cargando saldos…
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.currencyCode}
              className="rounded-xl border border-[var(--copilot-border)] bg-white/80 p-4"
            >
              <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                Caja inicial {row.currencyCode}
              </p>
              <label className="mt-3 block text-xs text-[var(--copilot-ink-muted)]">
                Monto
                <input
                  type="text"
                  inputMode="decimal"
                  className={`${TESORERIA_FIELD_CLASS} mt-1`}
                  value={row.amount}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) =>
                        r.currencyCode === row.currencyCode
                          ? { ...r, amount: e.target.value }
                          : r
                      )
                    )
                  }
                />
              </label>
              <label className="mt-2 block text-xs text-[var(--copilot-ink-muted)]">
                Notas (opcional)
                <input
                  type="text"
                  className={`${TESORERIA_FIELD_CLASS} mt-1`}
                  value={row.notes}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) =>
                        r.currencyCode === row.currencyCode
                          ? { ...r, notes: e.target.value }
                          : r
                      )
                    )
                  }
                />
              </label>
              <div className="mt-3 flex gap-2">
                <CopilotPrimaryButton
                  type="button"
                  disabled={saving}
                  onClick={() => void save(row.currencyCode)}
                >
                  Guardar {row.currencyCode}
                </CopilotPrimaryButton>
                <CopilotGhostButton type="button" onClick={() => void load()}>
                  Recargar
                </CopilotGhostButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
