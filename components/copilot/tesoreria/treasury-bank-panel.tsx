"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";

import {
  CopilotBadge,
  CopilotGhostButton,
  CopilotPrimaryButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { CopilotEmptyPanel } from "@/components/copilot/copilot-empty-panel";
import { TreasurySantanderImportPanel } from "@/components/copilot/tesoreria/treasury-santander-import-panel";
import {
  TESORERIA_FIELD_CLASS,
  TESORERIA_PAGE_SIZE,
  TESORERIA_TABLE_CLASS,
  TESORERIA_TD_CLASS,
  TESORERIA_TH_CLASS,
} from "@/components/copilot/tesoreria/tesoreria-ui";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import { computeMatchSuggestions } from "@/lib/treasury/treasury-reconciliation-match";
import type { BankReconciliationMovement } from "@/lib/treasury/treasury-types";

type Props = {
  workspace: TreasuryWorkspace;
};

function movementTypeLabel(type: string): string {
  const t = type.toLowerCase();
  if (t === "debit") return "Débito";
  if (t === "credit") return "Crédito";
  return type;
}

function matchStatusLabel(status: string, hasSuggestion: boolean): string {
  switch (status) {
    case "matched": return "Coincide";
    case "ignored": return "Ignorado";
    default: return hasSuggestion ? "Sugerido" : "Pendiente";
  }
}

export function TreasuryBankReconciliationPanel({
  workspace,
  embedded = false,
}: Props & { embedded?: boolean }) {
  const { canWrite } = useCopilotPermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<BankReconciliationMovement | null>(null);
  const [manualMatchId, setManualMatchId] = useState("");
  const [saving, setSaving] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const suggestions = useMemo(
    () => computeMatchSuggestions(workspace.bankMovements, workspace.manualMovements),
    [workspace.bankMovements, workspace.manualMovements]
  );

  const suggestionByBankId = useMemo(
    () => new Map(suggestions.map((suggestion) => [suggestion.bankId, suggestion])),
    [suggestions]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workspace.bankMovements.filter((bank) => {
      const account = bank.accountId ? workspace.accountById.get(bank.accountId) : undefined;
      const accountBank = (account?.bankName ?? "").toLowerCase();
      const bankName = (bank.bankName ?? "").toLowerCase();
      const isSantander = bankName.includes("santander") || accountBank.includes("santander");
      if (!isSantander) return false;
      if (!q) return true;
      return bank.description.toLowerCase().includes(q);
    });
  }, [workspace.bankMovements, workspace.accountById, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / TESORERIA_PAGE_SIZE));
  const pageItems = filtered.slice(page * TESORERIA_PAGE_SIZE, (page + 1) * TESORERIA_PAGE_SIZE);

  const groupedPageItems = useMemo(() => {
    const groups = new Map<string, BankReconciliationMovement[]>();
    for (const row of pageItems) {
      const bucket = groups.get(row.movementDate) ?? [];
      bucket.push(row);
      groups.set(row.movementDate, bucket);
    }
    return [...groups.entries()];
  }, [pageItems]);

  const activeRow = useMemo(() => {
    const id = focusedId ?? selected?.id ?? pageItems[0]?.id ?? null;
    return id ? workspace.bankMovements.find((row) => row.id === id) ?? null : null;
  }, [focusedId, selected, pageItems, workspace.bankMovements]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!activeRow) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const index = pageItems.findIndex((row) => row.id === activeRow.id);
        if (index < 0) return;
        const nextIndex = event.key === "ArrowDown" ? index + 1 : index - 1;
        const next = pageItems[nextIndex];
        if (next) setFocusedId(next.id);
      }

      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        const suggestion = suggestionByBankId.get(activeRow.id);
        if (!suggestion) return;
        void workspace.matchBank(activeRow.id, {
          matched_source: "manual_cash",
          matched_record_id: suggestion.manualId,
          confidence: suggestion.confidence,
        });
      }

      if (event.key.toLowerCase() === "i") {
        event.preventDefault();
        void workspace.ignoreBank(activeRow.id);
      }

      if (event.key === "Escape") {
        setSelected(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeRow, pageItems, suggestionByBankId, workspace]);

  async function handleMatch() {
    if (!selected || !manualMatchId) return;
    setSaving(true);
    const suggestion = suggestions.find(
      (item) => item.bankId === selected.id && item.manualId === manualMatchId
    );
    await workspace.matchBank(selected.id, {
      matched_source: "manual_cash",
      matched_record_id: manualMatchId,
      confidence: suggestion?.confidence ?? 80,
    });
    setSaving(false);
    setSelected(null);
  }

  async function acceptSuggestion(row: BankReconciliationMovement) {
    const suggestion = suggestionByBankId.get(row.id);
    if (!suggestion) return;
    await workspace.matchBank(row.id, {
      matched_source: "manual_cash",
      matched_record_id: suggestion.manualId,
      confidence: suggestion.confidence,
    });
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]">
        <div className="min-w-0 space-y-4">
          {embedded ? null : (
            <CopilotSectionTitle
              title="Conciliación bancaria"
              subtitle="Revisá movimientos importados y confirmá coincidencias con la caja registrada."
            />
          )}
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Buscar descripción"
            className={TESORERIA_FIELD_CLASS}
            aria-label="Buscar movimientos bancarios"
          />
          {workspace.loading && workspace.bankMovements.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando extracto…
            </div>
          ) : filtered.length === 0 ? (
            <CopilotEmptyPanel
              title="Sin movimientos importados"
              paragraphs={[
                "Importá un extracto bancario para empezar a conciliar movimientos.",
              ]}
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[var(--copilot-border)] bg-white/50">
              <table className={TESORERIA_TABLE_CLASS}>
                <thead>
                  <tr>
                    <th className={TESORERIA_TH_CLASS}>Fecha</th>
                    <th className={TESORERIA_TH_CLASS}>Descripción</th>
                    <th className={TESORERIA_TH_CLASS}>Débito/Crédito</th>
                    <th className={TESORERIA_TH_CLASS}>Monto</th>
                    <th className={TESORERIA_TH_CLASS}>Saldo</th>
                    <th className={TESORERIA_TH_CLASS}>Coincidencia</th>
                    <th className={TESORERIA_TH_CLASS}>Confianza</th>
                    <th className={TESORERIA_TH_CLASS}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedPageItems.map(([date, rows]) => (
                    <Fragment key={date}>
                      <tr key={`group-${date}`} className="bg-[rgba(248,246,242,0.9)]">
                        <td colSpan={8} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                          {date}
                        </td>
                      </tr>
                      {rows.map((row) => {
                        const suggestion = suggestionByBankId.get(row.id);
                        const hasDiff =
                          suggestion != null &&
                          (suggestion.amountDelta > 0.01 || suggestion.dayDelta > 0);
                        const isFocused = activeRow?.id === row.id;
                        return (
                          <tr
                            key={row.id}
                            className={`${hasDiff ? "bg-amber-50/80" : ""} ${isFocused ? "ring-1 ring-inset ring-[var(--copilot-accent)]" : ""}`}
                            onClick={() => setFocusedId(row.id)}
                          >
                            <td className={TESORERIA_TD_CLASS}>{row.movementDate}</td>
                            <td className={TESORERIA_TD_CLASS}>{row.description}</td>
                            <td className={TESORERIA_TD_CLASS}>{movementTypeLabel(row.movementType)}</td>
                            <td className={TESORERIA_TD_CLASS}>
                              {formatTreasuryMoney(row.amount, row.currencyCode)}
                            </td>
                            <td className={TESORERIA_TD_CLASS}>
                              {row.balanceAfter != null
                                ? formatTreasuryMoney(row.balanceAfter, row.currencyCode)
                                : "—"}
                            </td>
                            <td className={TESORERIA_TD_CLASS}>
                              <CopilotBadge
                                tone={
                                  row.matchStatus === "matched"
                                    ? "success"
                                    : row.matchStatus === "ignored"
                                      ? "neutral"
                                      : "warning"
                                }
                              >
                                {matchStatusLabel(row.matchStatus, suggestion != null)}
                              </CopilotBadge>
                            </td>
                            <td className={TESORERIA_TD_CLASS}>
                              {suggestion?.confidence ?? row.confidence ?? "—"}
                            </td>
                            <td className={TESORERIA_TD_CLASS}>
                              {canWrite ? (
                                <div className="flex flex-wrap gap-2">
                                  <CopilotGhostButton type="button" onClick={() => setSelected(row)}>
                                    Ver detalle
                                  </CopilotGhostButton>
                                  {suggestion ? (
                                    <CopilotPrimaryButton
                                      type="button"
                                      onClick={() => void acceptSuggestion(row)}
                                    >
                                      Aceptar
                                    </CopilotPrimaryButton>
                                  ) : null}
                                  <CopilotGhostButton
                                    type="button"
                                    onClick={() => void workspace.ignoreBank(row.id)}
                                  >
                                    Descartar match
                                  </CopilotGhostButton>
                                </div>
                              ) : (
                                <CopilotGhostButton type="button" onClick={() => setSelected(row)}>
                                  Ver detalle
                                </CopilotGhostButton>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > TESORERIA_PAGE_SIZE ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--copilot-ink-muted)]">
                Página {page + 1} de {pageCount}
              </span>
              <div className="flex gap-2">
                <CopilotGhostButton type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Anterior
                </CopilotGhostButton>
                <CopilotGhostButton
                  type="button"
                  disabled={page + 1 >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </CopilotGhostButton>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="min-w-0 rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] p-4 shadow-[var(--copilot-shadow)]">
          <h3 className="text-sm font-semibold text-[var(--copilot-ink)]">Sugerencias de conciliación</h3>
          <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
            Coincidencias detectadas por monto, fecha y descripción.
          </p>
          <ul className="mt-3 space-y-2">
            {suggestions.length === 0 ? (
              <li className="text-sm text-[var(--copilot-ink-muted)]">Sin sugerencias pendientes.</li>
            ) : (
              suggestions.map((suggestion) => (
                <li
                  key={`${suggestion.bankId}-${suggestion.manualId}`}
                  className={`rounded-xl border border-[var(--copilot-border)] bg-white/60 p-3 text-sm ${suggestion.amountDelta > 0.01 || suggestion.dayDelta > 0 ? "border-amber-300 bg-amber-50/70" : ""}`}
                >
                  <p className="font-medium">Confianza {suggestion.confidence}%</p>
                  <p className="text-xs text-[var(--copilot-ink-muted)]">
                    Δ monto {suggestion.amountDelta.toFixed(2)} · Δ días {suggestion.dayDelta}
                  </p>
                  {canWrite ? (
                    <div className="mt-2 flex gap-2">
                      <CopilotPrimaryButton
                        type="button"
                        onClick={() => {
                          const bank = workspace.bankMovements.find((row) => row.id === suggestion.bankId);
                          if (!bank) return;
                          void workspace.matchBank(bank.id, {
                            matched_source: "manual_cash",
                            matched_record_id: suggestion.manualId,
                            confidence: suggestion.confidence,
                          });
                        }}
                      >
                        Aceptar
                      </CopilotPrimaryButton>
                      <CopilotGhostButton
                        type="button"
                        onClick={() => {
                          const bank = workspace.bankMovements.find((row) => row.id === suggestion.bankId);
                          if (!bank) return;
                          void workspace.ignoreBank(bank.id);
                        }}
                      >
                        Descartar match
                      </CopilotGhostButton>
                    </div>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </aside>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
          <div className="h-full w-full max-w-md overflow-y-auto bg-[var(--copilot-card)] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-[var(--copilot-ink)]">Match manual</h3>
            <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">{selected.description}</p>
            <label className="mt-4 block text-sm">
              Movimiento manual
              <select
                className={TESORERIA_FIELD_CLASS}
                value={manualMatchId}
                onChange={(e) => setManualMatchId(e.target.value)}
              >
                <option value="">Seleccionar</option>
                {workspace.manualMovements
                  .filter((movement) => movement.status === "active" && !movement.reconciled)
                  .map((movement) => (
                    <option key={movement.id} value={movement.id}>
                      {movement.movementDate} · {movement.concept} · {movement.amount}{" "}
                      {movement.currencyCode}
                    </option>
                  ))}
              </select>
            </label>
            <div className="mt-4 flex gap-2">
              {canWrite ? (
                <CopilotPrimaryButton
                  type="button"
                  disabled={saving || !manualMatchId}
                  onClick={() => void handleMatch()}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Conciliar"}
                </CopilotPrimaryButton>
              ) : null}
              <CopilotGhostButton type="button" onClick={() => setSelected(null)}>
                Cerrar
              </CopilotGhostButton>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function TreasuryBankPanel({ workspace }: Props) {
  return (
    <section className="space-y-6">
      <TreasurySantanderImportPanel workspace={workspace} />
      <TreasuryBankReconciliationPanel workspace={workspace} />
    </section>
  );
}
