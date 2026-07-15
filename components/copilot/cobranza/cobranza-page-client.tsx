"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type OwnershipEntry,
} from "@/lib/copilot-cobranza-summary";
import { computeEffectivenessKpis } from "@/lib/copilot-cobranza-effectiveness";
import type {
  CobranzaHistoryApiResponse,
  CobranzaHistoryRow,
} from "@/lib/copilot-cobranza-history";
import { copilotPageMainClass } from "@/components/copilot/copilot-ui";
import {
  SkeletonMetricCard,
  SkeletonMetricGrid,
} from "@/components/copilot/ui/skeleton";
import { CobranzaKpiGrid } from "./cobranza-kpi-grid";
import { CobranzaAgenda } from "./cobranza-agenda";
import { ClientesAGestionarList } from "./clientes-a-gestionar-list";
import { CobranzaAlertsFeed } from "./cobranza-alerts-feed";
import { HistorialCobrosList } from "./historial-cobros-list";

type CurrentUser = { id: string; role: string };

export function CobranzaPageClient() {
  const [portfolioRows, setPortfolioRows] = useState<ClientPortfolioRow[]>([]);
  const [collectionActions, setCollectionActions] = useState<CollectionAction[]>([]);
  const [notifications, setNotifications] = useState<CopilotNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monthHistory, setMonthHistory] = useState<CobranzaHistoryRow[]>([]);
  const [monthHistoryTruncated, setMonthHistoryTruncated] = useState(false);
  const [ownershipMap, setOwnershipMap] = useState<Map<string, OwnershipEntry>>(new Map());
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [portfolioResult, collectionResult, notifResult, monthHistoryResult, ownershipResult, meResult] =
        await Promise.allSettled([
          fetchClientPortfolioLoad(),
          copilotApiFetch("/api/copilot/collection-actions"),
          copilotApiFetch("/api/copilot/notifications?limit=100"),
          copilotApiFetch("/api/copilot/cobranza/history?period=month"),
          copilotApiFetch("/api/copilot/cobranza/ownership"),
          copilotApiFetch("/api/copilot/me"),
        ]);

      if (!isMountedRef.current) return;

      if (portfolioResult.status === "fulfilled") {
        setPortfolioRows(portfolioResult.value.rows);
      } else {
        setPortfolioRows([]);
        setError("No pudimos cargar los datos. Actualizá la página o intentá nuevamente.");
      }

      if (collectionResult.status === "fulfilled") {
        const json = (await collectionResult.value.json().catch(() => null)) as {
          ok?: boolean;
          actions?: CollectionAction[];
        } | null;
        if (collectionResult.value.ok && json?.ok) {
          setCollectionActions(json.actions ?? []);
        } else {
          setCollectionActions([]);
          setError("No pudimos cargar los datos. Actualizá la página o intentá nuevamente.");
        }
      } else {
        setCollectionActions([]);
        setError("No pudimos cargar los datos. Actualizá la página o intentá nuevamente.");
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
        setMonthHistoryTruncated(json?.truncated === true);
      }

      if (ownershipResult.status === "fulfilled") {
        const json = (await ownershipResult.value.json().catch(() => null)) as {
          ok?: boolean;
          ownership?: Record<string, { userId: string; name: string; email: string }>;
        } | null;
        const raw = json?.ownership ?? {};
        const map = new Map<string, OwnershipEntry>();
        for (const [companyId, entry] of Object.entries(raw)) {
          map.set(companyId, entry);
        }
        setOwnershipMap(map);
      }

      if (meResult.status === "fulfilled") {
        const json = (await meResult.value.json().catch(() => null)) as {
          appUser?: { id: string; role: string };
        } | null;
        if (json?.appUser) setCurrentUser({ id: json.appUser.id, role: json.appUser.role });
      }
    } catch {
      if (!isMountedRef.current) return;
      setError("Error al cargar los datos. Intentá actualizar la página.");
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOwnershipUpdate = useCallback((companyId: string, entry: OwnershipEntry | null) => {
    setOwnershipMap((prev) => {
      const next = new Map(prev);
      if (entry) {
        next.set(companyId, entry);
      } else {
        next.delete(companyId);
      }
      return next;
    });
  }, []);

  const kpis = useMemo(
    () => computeCobranzaKpis(portfolioRows, collectionActions),
    [portfolioRows, collectionActions]
  );

  const actionsByCompany = useMemo(
    () => groupActionsByCompany(collectionActions),
    [collectionActions]
  );

  const clientRows = useMemo(
    () => buildCobranzaClientRows(portfolioRows, actionsByCompany, ownershipMap),
    [portfolioRows, actionsByCompany, ownershipMap]
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

  if (!loading && error) {
    return (
      <div className={copilotPageMainClass}>
        <div
          role="alert"
          className="rounded-2xl border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-4 py-4 text-sm text-[var(--copilot-danger-text-strong)]"
        >
          <p className="font-semibold">No pudimos cargar los datos</p>
          <p className="mt-1 text-xs text-[var(--copilot-danger-text)]">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-xl border border-[var(--copilot-danger-border)] bg-[var(--copilot-card-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--copilot-danger-text-strong)] hover:bg-[var(--copilot-panel-bg)]"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

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
          <SkeletonMetricGrid count={4} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <SkeletonMetricCard key={i} />
            ))}
          </div>
        </div>
      ) : (
        <CobranzaKpiGrid
          kpis={kpis}
          effectivenessKpis={effectivenessKpis}
          cobrosDataTruncated={monthHistoryTruncated}
        />
      )}

      {/* CTA principal */}
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="#cobranza-agenda"
          className="inline-flex items-center rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90"
        >
          Ver agenda de cobranza
        </a>
        <Link
          href="/copilot/cartera"
          className="inline-flex items-center rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-4 py-2.5 text-sm font-medium text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]"
        >
          Análisis por período
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
        currentUserId={currentUser?.id ?? null}
        currentUserRole={currentUser?.role ?? null}
        onOwnershipUpdate={handleOwnershipUpdate}
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
