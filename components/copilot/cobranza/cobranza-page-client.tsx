"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import { fetchClientPortfolioLoad } from "@/lib/copilot-client-portfolio-fetch";
import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { CollectionAction } from "@/lib/copilot-collection-types";
import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";
import {
  computeCobranzaKpis,
  buildCobranzaClientRows,
  groupActionsByCompany,
} from "@/lib/copilot-cobranza-summary";
import { computeEffectivenessKpis } from "@/lib/copilot-cobranza-effectiveness";
import type {
  CobranzaHistoryApiResponse,
  CobranzaHistoryRow,
} from "@/lib/copilot-cobranza-history";
import { copilotPageMainClass } from "@/components/copilot/copilot-ui";
import { CobranzaKpiGrid } from "./cobranza-kpi-grid";
import { CobranzaAgenda } from "./cobranza-agenda";
import { ClientesAGestionarList } from "./clientes-a-gestionar-list";
import { CobranzaAlertsFeed } from "./cobranza-alerts-feed";
import { HistorialCobrosList } from "./historial-cobros-list";

export function CobranzaPageClient() {
  const [portfolioRows, setPortfolioRows] = useState<ClientPortfolioRow[]>([]);
  const [collectionActions, setCollectionActions] = useState<CollectionAction[]>([]);
  const [notifications, setNotifications] = useState<CopilotNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monthHistory, setMonthHistory] = useState<CobranzaHistoryRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [portfolioResult, collectionResult, notifResult, monthHistoryResult] = await Promise.allSettled([
        fetchClientPortfolioLoad(),
        copilotApiFetch("/api/copilot/collection-actions"),
        copilotApiFetch("/api/copilot/notifications?limit=100"),
        copilotApiFetch("/api/copilot/cobranza/history?period=month"),
      ]);

      if (portfolioResult.status === "fulfilled") {
        setPortfolioRows(portfolioResult.value.rows);
      }

      if (collectionResult.status === "fulfilled") {
        const json = (await collectionResult.value.json().catch(() => null)) as {
          ok?: boolean;
          actions?: CollectionAction[];
        } | null;
        setCollectionActions(json?.actions ?? []);
      }

      if (notifResult.status === "fulfilled") {
        const json = (await notifResult.value.json().catch(() => null)) as {
          ok?: boolean;
          notifications?: CopilotNotification[];
        } | null;
        setNotifications(json?.notifications ?? []);
      }

      if (monthHistoryResult.status === "fulfilled") {
        const json = (await monthHistoryResult.value.json().catch(() => null)) as CobranzaHistoryApiResponse | null;
        setMonthHistory(json?.items ?? []);
      }
    } catch {
      setError("Error al cargar los datos. Intentá actualizar la página.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(
    () => computeCobranzaKpis(portfolioRows, collectionActions),
    [portfolioRows, collectionActions]
  );

  const actionsByCompany = useMemo(
    () => groupActionsByCompany(collectionActions),
    [collectionActions]
  );

  const clientRows = useMemo(
    () => buildCobranzaClientRows(portfolioRows, actionsByCompany),
    [portfolioRows, actionsByCompany]
  );

  const effectivenessKpis = useMemo(
    () =>
      computeEffectivenessKpis(
        collectionActions,
        portfolioRows,
        monthHistory,
        new Date().toISOString().slice(0, 10)
      ),
    [collectionActions, portfolioRows, monthHistory]
  );

  return (
    <div className={copilotPageMainClass}>
      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-4 py-3 text-sm text-[var(--copilot-danger-text-strong)]"
        >
          {error}
        </div>
      ) : null}

      {/* KPIs */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((row) => (
            <div key={row} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)]"
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <CobranzaKpiGrid kpis={kpis} effectivenessKpis={effectivenessKpis} />
      )}

      {/* CTA principal */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/copilot/acciones?tab=agenda"
          className="inline-flex items-center rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90"
        >
          Ver agenda de cobranza
        </Link>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto text-xs font-medium text-[var(--copilot-accent)] hover:underline disabled:opacity-60"
        >
          {loading ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      {/* Clientes a gestionar */}
      <ClientesAGestionarList
        rows={clientRows}
        loading={loading}
      />

      {/* Agenda de cobranza */}
      <CobranzaAgenda
        portfolioRows={portfolioRows}
        collectionActions={collectionActions}
        loading={loading}
      />

      {/* Alertas */}
      <CobranzaAlertsFeed notifications={notifications} loading={loading} />

      {/* Historial de cobros */}
      <HistorialCobrosList />

    </div>
  );
}
