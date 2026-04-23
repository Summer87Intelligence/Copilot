"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { CopilotInteractiveText } from "@/components/copilot/copilot-interactive-text";
import { CopilotClientEvidenceDrawer } from "@/components/copilot/copilot-client-evidence-drawer";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  CopilotCard,
  CopilotGhostButton,
  CopilotGhostLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import { fetchClientPortfolioLoad } from "@/lib/copilot-client-portfolio-fetch";
import {
  formatMoneyPortfolio,
  type ClientCompanyDetail,
  type ClientPortfolioLoad,
} from "@/lib/copilot-clients-portfolio";

function riskTone(r: ClientPortfolioRow["risk"]) {
  if (r === "Alto") return "text-rose-800 bg-rose-100/80";
  if (r === "Medio") return "text-amber-900 bg-amber-100/80";
  return "text-emerald-900 bg-emerald-100/80";
}

function shareLabel(sharePct: number): string {
  return `${(sharePct * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

export default function CopilotClientesPage() {
  const [load, setLoad] = useState<ClientPortfolioLoad | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await fetchClientPortfolioLoad();
      setLoad(data);
      setSelectedId((prev) => {
        if (prev && data.rows.some((r) => r.company_id === prev)) return prev;
        return data.rows[0]?.company_id ?? null;
      });
    } catch (e) {
      setLoad(null);
      setSelectedId(null);
      setError(
        e instanceof Error ? e.message : "No se pudo cargar la cartera desde Supabase."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Deep link desde Copilot (`/copilot/clientes?c=<company_id>`). */
  useEffect(() => {
    if (!load || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const c = params.get("c");
    if (c && load.rows.some((r) => r.company_id === c)) {
      setSelectedId(c);
      setIsEvidenceOpen(true);
    }
  }, [load]);

  const activeDetail: ClientCompanyDetail | null = useMemo(() => {
    if (!load || !selectedId) return null;
    return load.details[selectedId] ?? null;
  }, [load, selectedId]);

  const openClient = (companyId: string) => {
    setSelectedId(companyId);
    setIsEvidenceOpen(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.clientes"
        title="Clientes"
        description="Cartera comercial desde empresas (proto_companies), facturas y recibos — facturación, deuda y riesgo en lenguaje de negocio."
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Cargando cartera de empresas desde Supabase…
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
            {error}
          </div>
        ) : null}

        {!loading && !error && load ? (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <CopilotCard>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Principales empresas
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink)]">
                  {load.summary.top_clients_line}
                </p>
              </CopilotCard>
              <CopilotCard>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Empresas con deuda
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink)]">
                  {load.summary.debt_clients_line}
                </p>
              </CopilotCard>
              <CopilotCard>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Riesgo de concentración
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink)]">
                  {load.summary.concentration_line}
                </p>
              </CopilotCard>
            </div>

            <CopilotCard className="overflow-hidden p-0">
              <div className="border-b border-[var(--copilot-border)] px-5 py-4">
                <CopilotSectionTitle
                  title="Cartera activa"
                  subtitle="Ordenada por facturación total (total_amount) — datos proto en vivo."
                />
              </div>
              {load.rows.length === 0 ? (
                <p className="px-5 py-8 text-sm text-[var(--copilot-ink-muted)]">
                  No hay empresas en proto_companies. Importá o cargá empresas en Supabase para ver
                  la cartera.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="bg-[rgba(255,255,255,0.65)] text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        <th className="px-5 py-3">Empresa</th>
                        <th className="px-5 py-3">Industria</th>
                        <th className="px-5 py-3">Facturación</th>
                        <th className="px-5 py-3">Deuda</th>
                        <th className="px-5 py-3">Riesgo</th>
                        <th className="px-5 py-3">Participación</th>
                        <th className="px-5 py-3 text-right">Vista</th>
                      </tr>
                    </thead>
                    <tbody>
                      {load.rows.map((row, i) => {
                        const isSelected = row.company_id === selectedId;
                        const evidenceOpenForRow = isEvidenceOpen && isSelected;
                        return (
                          <tr
                            key={row.company_id}
                            className={`${
                              i % 2 === 0
                                ? "bg-[var(--copilot-card)]"
                                : "bg-[rgba(255,255,255,0.5)]"
                            } ${evidenceOpenForRow ? "ring-1 ring-inset ring-[rgba(31,107,74,0.25)]" : ""}`}
                          >
                            <td className="px-5 py-3.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <CopilotInteractiveText
                                  icon="chevron"
                                  className="font-semibold"
                                  onClick={() => openClient(row.company_id)}
                                >
                                  {row.name}
                                </CopilotInteractiveText>
                                {evidenceOpenForRow ? (
                                  <span className="inline-block rounded-full bg-[var(--copilot-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--copilot-accent)]">
                                    Respaldo abierto
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="max-w-[200px] px-5 py-3.5 text-[var(--copilot-ink-muted)]">
                              <span className="line-clamp-2">{row.industry}</span>
                            </td>
                            <td className="px-5 py-3.5 tabular-nums text-[var(--copilot-ink-muted)]">
                              {formatMoneyPortfolio(row.total_billing)}
                            </td>
                            <td className="px-5 py-3.5 tabular-nums text-[var(--copilot-ink-muted)]">
                              {formatMoneyPortfolio(row.total_debt)}
                              {row.overdue_debt > 0 ? (
                                <span className="mt-0.5 block text-xs text-rose-700">
                                  Vencido {formatMoneyPortfolio(row.overdue_debt)}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-5 py-3.5">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${riskTone(row.risk)}`}
                              >
                                {row.risk}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 tabular-nums text-[var(--copilot-ink-muted)]">
                              {shareLabel(row.share_pct)}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <CopilotGhostLink
                                  href={`/copilot/clientes/${encodeURIComponent(row.company_id)}`}
                                  className="whitespace-nowrap px-3 py-1.5 text-xs"
                                >
                                  Ficha 360
                                </CopilotGhostLink>
                                <CopilotGhostButton
                                  onClick={() => openClient(row.company_id)}
                                  className="whitespace-nowrap px-3 py-1.5 text-xs"
                                >
                                  Ver respaldo
                                </CopilotGhostButton>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CopilotCard>
          </>
        ) : null}
      </div>

      <CopilotClientEvidenceDrawer
        detail={activeDetail}
        isOpen={isEvidenceOpen && activeDetail != null}
        onClose={() => setIsEvidenceOpen(false)}
      />
    </div>
  );
}
