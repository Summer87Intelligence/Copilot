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
import { TreasuryFeedbackBanner } from "@/components/copilot/tesoreria/treasury-feedback-banner";
import { CobranzaKpiGrid } from "./cobranza-kpi-grid";
import { CobranzaAgenda } from "./cobranza-agenda";
import { ClientesAGestionarList } from "./clientes-a-gestionar-list";
import { CobranzaAlertsFeed } from "./cobranza-alerts-feed";
import { HistorialCobrosList } from "./historial-cobros-list";
import {
  RegistrarCobroDrawer,
  type RegistrarCobroDrawerPrefill,
} from "./registrar-cobro-drawer";

type PageToast = {
  tone: "success" | "error" | "warning";
  message: string;
} | null;

export function CobranzaPageClient() {
  const [portfolioRows, setPortfolioRows] = useState<ClientPortfolioRow[]>([]);
  const [collectionActions, setCollectionActions] = useState<CollectionAction[]>([]);
  const [notifications, setNotifications] = useState<CopilotNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPrefill, setDrawerPrefill] = useState<RegistrarCobroDrawerPrefill | null>(null);
  const [toast, setToast] = useState<PageToast>(null);

  const openRegistrarCobro = useCallback((prefill?: RegistrarCobroDrawerPrefill | null) => {
    setDrawerPrefill(prefill ?? null);
    setDrawerOpen(true);
  }, []);

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
      {toast ? (
        <TreasuryFeedbackBanner
          tone={toast.tone === "warning" ? "error" : toast.tone}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      ) : null}

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
          onClick={() => openRegistrarCobro()}
          className="inline-flex items-center rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--copilot-ink)] shadow-sm transition hover:bg-[var(--copilot-panel-bg)]"
        >
          Registrar cobro
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
      <ClientesAGestionarList
        rows={clientRows}
        loading={loading}
        onRegistrarCobro={(row) =>
          openRegistrarCobro({
            companyId: row.companyId,
            companyName: row.name,
            debtUyu: row.debtUyu,
            debtUsd: row.debtUsd,
          })
        }
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

      <RegistrarCobroDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        clients={clientRows}
        prefill={drawerPrefill}
        onSuccess={() => void load()}
        onToast={(message, tone) => setToast({ message, tone })}
      />
    </div>
  );
}
