"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileDown, Loader2, Search, X } from "lucide-react";

import { CopilotGhostButton } from "@/components/copilot/copilot-ui";
import { usePdfDownload } from "./use-pdf-download";

type CurrencyOption = "UYU" | "USD" | "all";
type Scope = "all" | "single";

type ClientItem = {
  id: string;
  name: string;
  code?: string;
  rut?: string;
};

const CURRENCY_OPTIONS: Array<{
  value: CurrencyOption;
  label: string;
  descAll: string;
  descSingle: string;
  slug: string;
  param: string;
}> = [
  {
    value: "UYU",
    label: "Pesos (UYU)",
    descAll: "Estados de cuenta de todos los clientes en pesos uruguayos.",
    descSingle: "Estado de cuenta del cliente en pesos uruguayos.",
    slug: "uyu",
    param: "UYU",
  },
  {
    value: "USD",
    label: "Dólares (USD)",
    descAll: "Estados de cuenta de todos los clientes en dólares.",
    descSingle: "Estado de cuenta del cliente en dólares.",
    slug: "usd",
    param: "USD",
  },
  {
    value: "all",
    label: "UYU + USD",
    descAll: "Primero Pesos, luego Dólares. Secciones separadas, sin mezclar monedas.",
    descSingle: "Pesos y dólares del cliente. Secciones separadas, sin mezclar monedas.",
    slug: "uyu-usd",
    param: "all",
  },
];

function slugifyClientName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function matchesSearch(client: ClientItem, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return false;
  return (
    client.name.toLowerCase().includes(q) ||
    (client.code?.toLowerCase() ?? "").includes(q) ||
    (client.rut?.toLowerCase() ?? "").includes(q)
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AccountStatementsPdfDialog({ open, onClose }: Props) {
  const [currency, setCurrency] = useState<CurrencyOption>("all");
  const [scope, setScope] = useState<Scope>("all");
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientItem | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const { loading, error, clearError, download } = usePdfDownload();
  const searchRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setCurrency("all");
    setScope("all");
    setSearch("");
    setSelectedClient(null);
    setShowDropdown(false);
    clearError();
    onClose();
  }, [clearError, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, handleClose]);

  // Fetch client list once when scope switches to single
  useEffect(() => {
    if (!open || scope !== "single" || clients.length > 0) return;
    let cancelled = false;
    void (async () => {
      setClientsLoading(true);
      try {
        const r = await fetch("/api/copilot/reports/account-statement-clients");
        const data = (await r.json()) as { ok: boolean; clients?: ClientItem[] };
        if (!cancelled && data.ok && data.clients) setClients(data.clients);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, scope, clients.length]);

  const filteredClients = clients.filter((c) => matchesSearch(c, search));

  const handleScopeChange = (s: Scope) => {
    setScope(s);
    setSearch("");
    setSelectedClient(null);
    setShowDropdown(false);
  };

  const handleSelectClient = (c: ClientItem) => {
    setSelectedClient(c);
    setSearch("");
    setShowDropdown(false);
  };

  const handleGenerate = useCallback(async () => {
    const opt = CURRENCY_OPTIONS.find((o) => o.value === currency)!;
    const todayStr = new Date().toISOString().slice(0, 10);

    let url: string;
    let filename: string;

    if (scope === "single" && selectedClient) {
      url = `/api/copilot/reports/account-statements.pdf?currency=${opt.param}&companyId=${encodeURIComponent(selectedClient.id)}`;
      filename = `estado-cuenta-${slugifyClientName(selectedClient.name)}-${opt.slug}-${todayStr}.pdf`;
    } else {
      url = `/api/copilot/reports/account-statements.pdf?currency=${opt.param}`;
      filename = `estados-cuenta-clientes-${opt.slug}-${todayStr}.pdf`;
    }

    const ok = await download(url, filename);
    if (ok) handleClose();
  }, [currency, scope, selectedClient, download, handleClose]);

  const canGenerate = scope === "all" || (scope === "single" && !!selectedClient);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-statements-pdf-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) handleClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--copilot-border)] px-5 py-4">
          <div>
            <h2
              id="account-statements-pdf-title"
              className="text-base font-semibold text-[var(--copilot-ink)]"
            >
              Estado de cuenta por cliente
            </h2>
            <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
              Elegí el alcance y la moneda para generar el PDF.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="rounded-lg p-1 text-[var(--copilot-ink-muted)] hover:bg-black/[0.04] disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Scope toggle */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Alcance
            </p>
            <div className="flex gap-2">
              {(["all", "single"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleScopeChange(s)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    scope === s
                      ? "border-[var(--copilot-accent)] bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)]"
                      : "border-[var(--copilot-border)] bg-white/80 text-[var(--copilot-ink-muted)] hover:bg-white"
                  }`}
                >
                  {s === "all" ? "Todos los clientes" : "Cliente específico"}
                </button>
              ))}
            </div>
          </div>

          {/* Client search (only when scope=single) */}
          {scope === "single" && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Cliente
              </p>
              {selectedClient ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--copilot-accent)] bg-[var(--copilot-accent-soft)] px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--copilot-accent)]">
                      {selectedClient.name}
                    </p>
                    {(selectedClient.code || selectedClient.rut) && (
                      <p className="text-xs text-[var(--copilot-ink-muted)]">
                        {[
                          selectedClient.code && `Cód. ${selectedClient.code}`,
                          selectedClient.rut && `RUT ${selectedClient.rut}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClient(null);
                      setSearch("");
                      setTimeout(() => searchRef.current?.focus(), 50);
                    }}
                    className="shrink-0 rounded-lg p-1 text-[var(--copilot-ink-muted)] hover:bg-black/[0.06]"
                    aria-label="Cambiar cliente"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="flex items-center gap-2 rounded-xl border border-[var(--copilot-border)] bg-white px-3 py-2 focus-within:border-[var(--copilot-accent)]">
                    {clientsLoading ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--copilot-ink-muted)]" aria-hidden />
                    ) : (
                      <Search className="h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)]" aria-hidden />
                    )}
                    <input
                      ref={searchRef}
                      type="text"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setShowDropdown(true);
                      }}
                      onFocus={() => setShowDropdown(true)}
                      onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                      placeholder="Buscar por nombre, RUT o código…"
                      className="w-full bg-transparent text-sm text-[var(--copilot-ink)] outline-none placeholder:text-[var(--copilot-ink-muted)]"
                    />
                  </div>
                  {showDropdown && search.trim() && (
                    <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-[var(--copilot-border)] bg-white shadow-lg">
                      {filteredClients.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-[var(--copilot-ink-muted)]">
                          Sin resultados.
                        </p>
                      ) : (
                        filteredClients.slice(0, 8).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={() => handleSelectClient(c)}
                            className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-[var(--copilot-accent-soft)]"
                          >
                            <span className="text-sm font-medium text-[var(--copilot-ink)]">
                              {c.name}
                            </span>
                            {(c.code || c.rut) && (
                              <span className="text-xs text-[var(--copilot-ink-muted)]">
                                {[
                                  c.code && `Cód. ${c.code}`,
                                  c.rut && `RUT ${c.rut}`,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Currency options */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Moneda
            </p>
            <div className="flex flex-col gap-2">
              {CURRENCY_OPTIONS.map((opt) => {
                const active = currency === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCurrency(opt.value)}
                    className={`flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left transition ${
                      active
                        ? "border-[var(--copilot-accent)] bg-[var(--copilot-accent-soft)]"
                        : "border-[var(--copilot-border)] bg-white/80 hover:bg-white"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition ${
                        active
                          ? "border-[var(--copilot-accent)]"
                          : "border-[var(--copilot-border)]"
                      }`}
                    >
                      {active && (
                        <span className="h-2 w-2 rounded-full bg-[var(--copilot-accent)]" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-medium ${
                          active ? "text-[var(--copilot-accent)]" : "text-[var(--copilot-ink)]"
                        }`}
                      >
                        {opt.label}
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-[var(--copilot-ink-muted)]">
                        {scope === "single" ? opt.descSingle : opt.descAll}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              {error}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--copilot-border)] px-5 py-3">
          <CopilotGhostButton type="button" onClick={handleClose} disabled={loading}>
            Cancelar
          </CopilotGhostButton>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={loading || !canGenerate}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <FileDown className="h-4 w-4" aria-hidden />
            )}
            Generar PDF
          </button>
        </div>
      </div>
    </div>
  );
}

export function AccountStatementsPdfTrigger({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
      >
        <FileDown className="h-3.5 w-3.5" aria-hidden />
        PDF
      </button>
      <AccountStatementsPdfDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
