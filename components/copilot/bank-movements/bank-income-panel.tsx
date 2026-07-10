"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";

import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotInputClass,
  copilotSectionTitleClass,
} from "@/components/copilot/ui/copilot-visual-system";
import type { IncomeCandidate, IncomeConfidence } from "@/lib/bank-movements/bank-income-matching";
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";

type PortfolioClient = { company_id: string; name: string };

const CONFIDENCE_LABEL: Record<IncomeConfidence, string> = {
  high: "Confianza alta",
  medium: "Confianza media",
  low: "Confianza baja",
};

const CONFIDENCE_STYLE: Record<IncomeConfidence, string> = {
  high: "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]",
  medium: "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  low: "border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] text-[var(--copilot-muted)]",
};

const numberFmt = new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2 });

function money(currency: string, amount: number): string {
  return `${currency} ${numberFmt.format(amount)}`;
}

type ConfirmedMatch = { client_id: string; billing_concept_id: string | null } | null;

export function BankIncomePanel({ onChanged }: { onChanged?: () => void }) {
  const [movements, setMovements] = useState<BankMovement[]>([]);
  const [clients, setClients] = useState<PortfolioClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, ConfirmedMatch>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [movRes, cliRes] = await Promise.all([
        fetch("/api/copilot/bank-movements?direction=inflow"),
        fetch("/api/copilot/portfolio"),
      ]);
      const movJson = (await movRes.json().catch(() => null)) as { ok?: boolean; data?: BankMovement[] } | null;
      const cliJson = (await cliRes.json().catch(() => null)) as
        | { ok?: boolean; rows?: PortfolioClient[]; portfolio?: { rows?: PortfolioClient[] } }
        | null;
      if (movJson?.ok) setMovements(movJson.data ?? []);
      const rows = cliJson?.rows ?? cliJson?.portfolio?.rows ?? [];
      setClients(rows.map((r) => ({ company_id: r.company_id, name: r.name })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  const clientName = useCallback(
    (id: string) => clients.find((c) => c.company_id === id)?.name ?? "Cliente",
    [clients]
  );

  return (
    <section className={copilotCardStandardClass}>
      <h2 className={copilotSectionTitleClass}>Ingresos por asociar</h2>
      <p className={`${copilotCaptionClass} mt-1`}>
        Asociá cada ingreso al cliente que pagó. Asociar no cobra facturas ni mueve la caja: solo deja
        el movimiento identificado.
      </p>

      {feedback ? (
        <div className="mt-3 rounded-lg border border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] px-3 py-2 text-xs text-[var(--copilot-success-text-strong)]">
          {feedback}
        </div>
      ) : null}

      {loading ? (
        <p className={`${copilotCaptionClass} mt-3`}>Cargando ingresos…</p>
      ) : movements.length === 0 ? (
        <p className={`${copilotCaptionClass} mt-3`}>No hay ingresos para asociar.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {movements.map((m) => (
            <IncomeMovementRow
              key={m.id}
              movement={m}
              open={openId === m.id}
              onToggle={() => setOpenId(openId === m.id ? null : m.id)}
              clients={clients}
              match={matches[m.id] ?? null}
              onMatched={(match) => {
                setMatches((prev) => ({ ...prev, [m.id]: match }));
                setFeedback(match ? `Asociado a ${clientName(match.client_id)}.` : "Marcado como no asociado.");
                onChanged?.();
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function IncomeMovementRow({
  movement,
  open,
  onToggle,
  clients,
  match,
  onMatched,
}: {
  movement: BankMovement;
  open: boolean;
  onToggle: () => void;
  clients: PortfolioClient[];
  match: ConfirmedMatch;
  onMatched: (match: ConfirmedMatch) => void;
}) {
  const [candidates, setCandidates] = useState<IncomeCandidate[] | null>(null);
  const [loadingSug, setLoadingSug] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rememberAlias, setRememberAlias] = useState(true);
  const [manualClientId, setManualClientId] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open || candidates != null) return;
    setLoadingSug(true);
    fetch(`/api/copilot/bank-movements/${movement.id}/income-suggestions`)
      .then((r) => r.json())
      .then((j: { ok?: boolean; candidates?: IncomeCandidate[] }) => {
        if (j?.ok) setCandidates(j.candidates ?? []);
        else setCandidates([]);
      })
      .catch(() => setCandidates([]))
      .finally(() => setLoadingSug(false));
  }, [open, candidates, movement.id]);

  const associate = useCallback(
    async (payload: {
      client_id: string;
      billing_concept_id?: string | null;
      confidence?: IncomeConfidence | null;
      score?: number | null;
      reasons?: string[];
    }) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/copilot/bank-movements/${movement.id}/income-match`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "confirm", remember_alias: rememberAlias, ...payload }),
        });
        const json = (await res.json()) as { ok?: boolean };
        if (json?.ok) {
          onMatched({ client_id: payload.client_id, billing_concept_id: payload.billing_concept_id ?? null });
        }
      } finally {
        setBusy(false);
      }
    },
    [movement.id, rememberAlias, onMatched]
  );

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients.slice(0, 8);
    return clients.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [clients, search]);

  const amount = Number(movement.amount ?? 0);

  return (
    <li className="overflow-hidden rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--copilot-text)]">{movement.description}</p>
          <p className={copilotCaptionClass}>
            {movement.movement_date.slice(0, 10)} · {money(movement.currency, amount)}
            {match ? " · Asociado" : ""}
          </p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open ? (
        <div className="border-t border-[var(--copilot-border)] px-3 py-3">
          {match ? (
            <p className="text-xs text-[var(--copilot-success-text-strong)]">
              Asociado a {clients.find((c) => c.company_id === match.client_id)?.name ?? "cliente"}.
            </p>
          ) : loadingSug ? (
            <p className={copilotCaptionClass}>Buscando posibles clientes…</p>
          ) : (
            <>
              {candidates && candidates.length > 0 ? (
                <div className="space-y-2">
                  <p className={copilotCaptionClass}>Posibles clientes:</p>
                  {candidates.map((c) => (
                    <div
                      key={`${c.clientId}:${c.conceptId ?? ""}`}
                      className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--copilot-text)]">{c.clientName}</span>
                        {c.conceptLabel ? (
                          <span className={copilotCaptionClass}>· {c.conceptLabel}</span>
                        ) : null}
                        <span
                          className={`ml-auto rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CONFIDENCE_STYLE[c.confidence]}`}
                        >
                          {CONFIDENCE_LABEL[c.confidence]}
                        </span>
                      </div>
                      {c.reasons.length > 0 ? (
                        <p className={`${copilotCaptionClass} mt-1`}>{c.reasons.join(" · ")}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void associate({
                              client_id: c.clientId,
                              billing_concept_id: c.conceptId,
                              confidence: c.confidence,
                              score: c.score,
                              reasons: c.reasons,
                            })
                          }
                          className={copilotButtonClassName({ variant: "primary", size: "sm" })}
                        >
                          Asociar
                        </button>
                        <a
                          href={`/copilot/clientes/${c.clientId}`}
                          className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                        >
                          Ver cliente <ExternalLink className="ml-1 h-3 w-3" aria-hidden />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={copilotCaptionClass}>
                  No hay una sugerencia clara. Elegí el cliente manualmente.
                </p>
              )}

              <div className="mt-3 rounded-lg border border-dashed border-[var(--copilot-border)] p-3">
                <p className={copilotCaptionClass}>Asociar a otro cliente</p>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar cliente…"
                  className={copilotInputClass}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {filteredClients.map((c) => (
                    <button
                      key={c.company_id}
                      type="button"
                      onClick={() => setManualClientId(c.company_id)}
                      className={copilotButtonClassName({
                        variant: manualClientId === c.company_id ? "primary" : "ghost",
                        size: "sm",
                      })}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                {manualClientId ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void associate({ client_id: manualClientId })}
                    className={`mt-2 ${copilotButtonClassName({ variant: "primary", size: "sm" })}`}
                  >
                    Confirmar asociación
                  </button>
                ) : null}
              </div>

              <label className="mt-3 flex items-center gap-2 text-xs text-[var(--copilot-muted)]">
                <input
                  type="checkbox"
                  checked={rememberAlias}
                  onChange={(e) => setRememberAlias(e.target.checked)}
                />
                Recordar este nombre bancario para el cliente
              </label>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}
