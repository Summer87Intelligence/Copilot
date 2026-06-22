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
import { copilotPageMainClass } from "@/components/copilot/copilot-ui";
import { CobranzaKpiGrid } from "./cobranza-kpi-grid";
import { CobranzaAgenda } from "./cobranza-agenda";
import { ClientesAGestionarList } from "./clientes-a-gestionar-list";
import { CobranzaAlertsFeed } from "./cobranza-alerts-feed";

export function CobranzaPageClient() {
  const [portfolioRows, setPortfolioRows] = useState<ClientPortfolioRow[]>([]);
  const [collectionActions, setCollectionActions] = useState<CollectionAction[]>([]);
  const [notifications, setNotifications] = useState<CopilotNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [portfolioResult, collectionResult, notifResult] = await Promise.allSettled([
        fetchClientPortfolioLoad(),
        copilotApiFetch("/api/copilot/collection-actions"),
        copilotApiFetch("/api/copilot/notifications?limit=100"),
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)]"
            />
          ))}
        </div>
      ) : (
        <CobranzaKpiGrid kpis={kpis} />
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
          disabled
          title="Disponible en la próxima fase"
          className="inline-flex items-center rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--copilot-ink-muted)] shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          Registrar cobro
          <span className="ml-2 rounded-full bg-[var(--copilot-panel-bg)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Próxima fase
          </span>
        </button>
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
      <ClientesAGestionarList rows={clientRows} loading={loading} />

      {/* Agenda de cobranza */}
      <CobranzaAgenda
        portfolioRows={portfolioRows}
        collectionActions={collectionActions}
        loading={loading}
      />

      {/* Alertas */}
      <CobranzaAlertsFeed notifications={notifications} loading={loading} />
    </div>
  );
}
