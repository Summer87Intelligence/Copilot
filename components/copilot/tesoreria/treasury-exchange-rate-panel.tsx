"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";

import {
  CopilotPrimaryButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { TESORERIA_FIELD_CLASS } from "@/components/copilot/tesoreria/tesoreria-ui";
import { copilotApiFetch } from "@/lib/copilot-fetch";

type CurrentRate = {
  id: string;
  uyuPerUsd: number;
  effectiveDate: string;
  source: string;
  notes: string | null;
  createdAt: string;
};

export function TreasuryExchangeRatePanel() {
  const { canWrite } = useCopilotPermissions();
  const [current, setCurrent] = useState<CurrentRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [tcInput, setTcInput] = useState("");
  const [dateInput, setDateInput] = useState(today);
  const [notesInput, setNotesInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await copilotApiFetch("/api/copilot/treasury/exchange-rates");
      const json = (await res.json()) as { ok?: boolean; data?: { rate: CurrentRate | null } };
      if (res.ok && json.ok) {
        setCurrent(json.data?.rate ?? null);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    setError(null);
    setSuccess(null);
    const tc = parseFloat(tcInput.replace(",", "."));
    if (!Number.isFinite(tc) || tc <= 0) {
      setError("Ingresá un tipo de cambio válido (ej: 43.50).");
      return;
    }
    if (tc >= 1000) {
      setError("El TC debe ser menor a 1000 pesos por dólar.");
      return;
    }
    if (!dateInput) {
      setError("Seleccioná una fecha de vigencia.");
      return;
    }
    setSaving(true);
    try {
      const res = await copilotApiFetch("/api/copilot/treasury/exchange-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uyu_per_usd: tc,
          effective_date: dateInput,
          source: "manual",
          notes: notesInput.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (res.ok && json.ok) {
        setSuccess(`TC guardado: 1 USD = ${tc.toLocaleString("es-UY", { minimumFractionDigits: 2 })} UYU`);
        setTcInput("");
        setNotesInput("");
        setDateInput(today);
        await load();
      } else {
        setError(json.message ?? json.error ?? "Error al guardar el tipo de cambio.");
      }
    } catch {
      setError("Error de conexión. Intentá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <CopilotSectionTitle title="Tipo de cambio (USD consolidado)" />

      <p className="text-xs text-[var(--copilot-ink-muted)]">
        El TC se usa para consolidar todos los valores en USD en el Dashboard y el PDF de resumen.
        Fórmula: <code className="rounded bg-[var(--copilot-border)] px-1 py-0.5 text-[11px]">USD consolidado = USD + UYU ÷ TC</code>
      </p>

      {/* Current TC */}
      <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          TC vigente
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-[var(--copilot-ink-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cargando…
          </div>
        ) : current ? (
          <div className="space-y-1 text-sm">
            <p className="font-bold text-[var(--copilot-ink)]">
              1 USD ={" "}
              <span className="text-[var(--copilot-accent)]">
                {current.uyuPerUsd.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} UYU
              </span>
            </p>
            <p className="text-xs text-[var(--copilot-ink-muted)]">
              Fecha vigencia: {current.effectiveDate} · Fuente: {current.source}
              {current.notes ? ` · ${current.notes}` : ""}
            </p>
          </div>
        ) : (
          <p className="text-xs text-[var(--copilot-ink-muted)]">
            No hay TC configurado. Cargá uno para habilitar la vista USD consolidado en el Dashboard.
          </p>
        )}
      </div>

      {/* Form */}
      {canWrite ? (
        <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Registrar nuevo TC
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--copilot-ink-muted)]">
                Pesos por dólar (UYU/USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="999.99"
                placeholder="ej: 43.50"
                value={tcInput}
                onChange={(e) => setTcInput(e.target.value)}
                className={TESORERIA_FIELD_CLASS}
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--copilot-ink-muted)]">
                Fecha de vigencia
              </label>
              <input
                type="date"
                value={dateInput}
                max={today}
                onChange={(e) => setDateInput(e.target.value)}
                className={TESORERIA_FIELD_CLASS}
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--copilot-ink-muted)]">
                Notas (opcional)
              </label>
              <input
                type="text"
                placeholder="ej: BROU oficial"
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                className={TESORERIA_FIELD_CLASS}
                disabled={saving}
                maxLength={120}
              />
            </div>
          </div>

          {error && (
            <p className="mt-2 text-xs font-medium text-[var(--copilot-danger-text)]">{error}</p>
          )}
          {success && (
            <p className="mt-2 text-xs font-medium text-[var(--copilot-success-text)]">{success}</p>
          )}

          <div className="mt-3 flex justify-end">
            <CopilotPrimaryButton onClick={() => void handleSave()} disabled={saving || !tcInput}>
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Guardando…
                </>
              ) : (
                "Guardar TC"
              )}
            </CopilotPrimaryButton>
          </div>
        </div>
      ) : (
        <p className="text-xs text-[var(--copilot-ink-muted)]">
          No tenés permisos para modificar el tipo de cambio.
        </p>
      )}
    </div>
  );
}
