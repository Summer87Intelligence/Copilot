"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotGhostLink } from "@/components/copilot/copilot-ui";
import type { Client360Payload } from "@/lib/copilot-client-360";
import { buildClientOperationalSummary } from "@/lib/copilot-client-operational-summary";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import { ClientBankIdentitySection } from "@/components/copilot/clients/client-bank-identity-section";
import { ClientPayerMemorySection } from "@/components/copilot/clients/client-payer-memory-section";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import type { CollectionFollowupInitialValues } from "@/lib/account-statement/build-account-statement-followup-prefill";

import { Client360Header } from "@/components/copilot/clientes/client-360-header";
import { RelatedTasksCard } from "@/components/copilot/tasks/related-tasks-card";
import { ResumenTab } from "@/components/copilot/clientes/tabs/resumen-tab";
import { FinanzasTab } from "@/components/copilot/clientes/tabs/finanzas-tab";
import { FacturasTab } from "@/components/copilot/clientes/tabs/facturas-tab";
import { CobrosTab } from "@/components/copilot/clientes/tabs/cobros-tab";
import { EstadoCuentaTab } from "@/components/copilot/clientes/tabs/estado-cuenta-tab";
import { ContactosTab } from "@/components/copilot/clientes/tabs/contactos-tab";
import { CobranzaTab } from "@/components/copilot/clientes/tabs/cobranza-tab";
import { ActividadTab } from "@/components/copilot/clientes/tabs/actividad-tab";
import { NotasTab } from "@/components/copilot/clientes/tabs/notas-tab";
import { VentasTab } from "@/components/copilot/clientes/tabs/ventas-tab";

const SESSION_TAB_KEY = "copilot-client360-active-tab";

type SectionNavId =
  | "resumen"
  | "finanzas"
  | "facturas"
  | "ventas"
  | "cobros"
  | "cuenta"
  | "contactos"
  | "cobranza"
  | "identificacion"
  | "actividad"
  | "notas";

const SECTION_NAV_TABS: { id: SectionNavId; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "finanzas", label: "Finanzas" },
  { id: "facturas", label: "Facturas" },
  { id: "ventas", label: "Ventas" },
  { id: "cobros", label: "Cobros" },
  { id: "cuenta", label: "Estado de cuenta" },
  { id: "contactos", label: "Contactos" },
  { id: "cobranza", label: "Cobranza" },
  { id: "identificacion", label: "Identificación bancaria" },
  { id: "actividad", label: "Actividad" },
  { id: "notas", label: "Notas" },
];

const VALID_TAB_IDS = new Set<string>(SECTION_NAV_TABS.map((t) => t.id));

/** Normaliza ids legacy o de otros módulos al nuevo set de tabs. */
function normalizeTabId(raw: string): SectionNavId | null {
  if (VALID_TAB_IDS.has(raw)) return raw as SectionNavId;
  // Alias de deep-link desde Banco.
  if (raw === "banking" || raw === "bank" || raw === "identificacion-bancaria") {
    return "identificacion";
  }
  if (raw === "datos" || raw === "contactos") return "contactos";
  if (raw === "zeta" || raw === "transferencias") return "actividad";
  return null;
}

function Client360TabNav({
  activeTab,
  onTabChange,
}: {
  activeTab: SectionNavId;
  onTabChange: (id: SectionNavId) => void;
}) {
  return (
    <div className="sticky top-0 z-20 border-b border-[var(--copilot-border)] bg-[var(--copilot-tab-bg)] backdrop-blur-sm">
      <nav
        role="tablist"
        className="flex overflow-x-auto scrollbar-none px-2"
        aria-label="Secciones de la ficha"
      >
        {SECTION_NAV_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            aria-current={activeTab === tab.id ? "page" : undefined}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`client360-panel-${tab.id}`}
            id={`client360-tab-${tab.id}`}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-[13px] transition-colors ${
              activeTab === tab.id
                ? "border-[var(--copilot-accent)] font-semibold text-[var(--copilot-tab-active-text)]"
                : "border-transparent font-medium text-[var(--copilot-tab-text)] hover:border-[var(--copilot-border)] hover:text-[var(--copilot-text)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export function CopilotClient360View({ companyId }: { companyId: string }) {
  const { modulePermissions } = useCopilotPermissions();
  const canWrite =
    modulePermissions["clientes"] === "write" || modulePermissions["clientes"] === "admin";
  const { mode: displayMode, fxRate: displayFxRate } = useDisplayCurrency();
  const isUsd360 = displayMode === "usd_equivalent";
  const searchParams = useSearchParams();
  const router = useRouter();

  const [data, setData] = useState<Client360Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [collectionPrefill, setCollectionPrefill] =
    useState<CollectionFollowupInitialValues | null>(null);
  const [collectionPrefillKey, setCollectionPrefillKey] = useState(0);

  const initialTabFromUrl = normalizeTabId(searchParams.get("tab") ?? "");
  const [activeTab, setActiveTab] = useState<SectionNavId>(initialTabFromUrl ?? "resumen");
  const returnTo = searchParams.get("returnTo");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fromUrl = normalizeTabId(searchParams.get("tab") ?? "");
    if (fromUrl) {
      setActiveTab(fromUrl);
      return;
    }
    try {
      const saved = sessionStorage.getItem(SESSION_TAB_KEY);
      if (saved) {
        const normalized = normalizeTabId(saved);
        if (normalized) setActiveTab(normalized);
      }
    } catch {
      /* noop */
    }
  }, [searchParams]);

  const handleTabChange = useCallback(
    (rawId: string) => {
      const id = normalizeTabId(rawId);
      if (!id) return;
      setActiveTab(id);
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: "instant" });
      try {
        sessionStorage.setItem(SESSION_TAB_KEY, id);
      } catch {
        /* noop */
      }
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", id);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const handleSuggestFollowup = useCallback(
    (prefill: CollectionFollowupInitialValues) => {
      setCollectionPrefill(prefill);
      setCollectionPrefillKey((k) => k + 1);
      handleTabChange("cobranza");
    },
    [handleTabChange]
  );

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/copilot/client-360?companyId=${encodeURIComponent(companyId)}`,
        { credentials: "same-origin", headers: { Accept: "application/json" } }
      );
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; payload?: Client360Payload; error?: string }
        | null;
      if (!res.ok || !body?.ok || !body.payload) {
        const msg =
          typeof body?.error === "string" && body.error.trim()
            ? body.error
            : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setData(body.payload);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "No se pudo cargar la ficha.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const riskLabel = useMemo((): "Bajo" | "Medio" | "Alto" => {
    const hint = data?.insights.find((i) => i.id === "riesgo_basico");
    if (!hint) return "Bajo";
    if (hint.label.includes("Alto")) return "Alto";
    if (hint.label.includes("Medio")) return "Medio";
    return "Bajo";
  }, [data]);

  const hasMixedCurrency = (data?.debt_uyu ?? 0) > 0 && (data?.debt_usd ?? 0) > 0;

  const timelineEvents = useMemo(() => {
    if (!data) return [];
    const { timelineEvents: evts } = buildClientOperationalSummary({
      saldo_pendiente: data.cuenta.saldo_pendiente_total,
      overdue_debt: data.overdue_uyu + data.overdue_usd,
      overdue_uyu: data.overdue_uyu,
      overdue_usd: data.overdue_usd,
      receipts_count: data.receipts.length,
      receipts_last_date: data.last_receipt_date,
      contacts_count: data.contacts.length,
      risk: riskLabel,
      has_mixed_currency: hasMixedCurrency,
      invoices_count: data.invoices.length,
      last_sync_at: data.last_sync_at,
      invoices: data.invoices.map((inv) => ({
        id: inv.id,
        issue_date: inv.issue_date,
        due_date: inv.due_date,
        serie_numero: inv.serie_numero,
        importe: inv.importe,
        balance: inv.saldo_amount,
        currency_code: inv.currency_code,
      })),
      receipts: data.receipts.map((r) => ({
        id: r.id,
        receipt_date: r.receipt_date,
        importe: r.importe,
        medio: r.medio,
      })),
      sync_rows: data.zeta_sync_rows.map((z) => ({
        resource_flow: z.resource_flow,
        label: z.label,
        last_success_at: z.last_success_at,
      })),
    });
    return evts;
  }, [data, riskLabel, hasMixedCurrency]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.clientes"
        title="Ficha de cliente"
        description="Estado de cuenta, facturas, cobros y contactos del cliente."
      />

      {/* Breadcrumb */}
      <div className="border-b border-[var(--copilot-border)] bg-[var(--copilot-card)] px-6 py-2.5">
        <nav className="flex items-center gap-2 text-sm" aria-label="Ruta">
          <CopilotGhostLink
            href="/copilot/clientes"
            className="inline-flex items-center gap-1 text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Clientes
          </CopilotGhostLink>
          <ChevronRight className="h-3.5 w-3.5 text-[var(--copilot-ink-muted)]" aria-hidden />
          <span className="font-medium text-[var(--copilot-ink)]">
            {loading ? "Cargando…" : (data?.summary.nombre_visible ?? "Ficha")}
          </span>
        </nav>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center gap-2 px-6 py-6 text-sm text-[var(--copilot-ink-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Cargando ficha…
          </div>
        ) : null}

        {error ? (
          <div className="space-y-3 px-6 py-6">
            <div className="rounded-xl border border-[var(--copilot-danger-border)] bg-[var(--copilot-card-bg)] px-4 py-3 text-sm text-[var(--copilot-danger-text-strong)]">
              {error}
            </div>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--copilot-accent)] hover:underline"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Reintentar
            </button>
          </div>
        ) : null}

        {!loading && !error && data ? (
          <>
            <Client360Header
              data={data}
              riskLabel={riskLabel}
              hasMixedCurrency={hasMixedCurrency}
              onNavigateTab={handleTabChange}
            />

            <Client360TabNav activeTab={activeTab} onTabChange={handleTabChange} />

            {activeTab === "resumen" ? (
              <section
                id="client360-panel-resumen"
                role="tabpanel"
                aria-labelledby="client360-tab-resumen"
              >
              <ResumenTab
                data={data}
                timelineEvents={timelineEvents}
                onNavigateTab={handleTabChange}
              />
              </section>
            ) : null}

            {activeTab === "finanzas" ? (
              <section
                id="client360-panel-finanzas"
                role="tabpanel"
                aria-labelledby="client360-tab-finanzas"
              >
                <FinanzasTab data={data} />
              </section>
            ) : null}

            {activeTab === "facturas" ? (
              <section
                id="client360-panel-facturas"
                role="tabpanel"
                aria-labelledby="client360-tab-facturas"
              >
                <FacturasTab invoices={data.invoices} />
              </section>
            ) : null}

            {activeTab === "ventas" ? (
              <section
                id="client360-panel-ventas"
                role="tabpanel"
                aria-labelledby="client360-tab-ventas"
              >
                <VentasTab companyId={companyId} />
              </section>
            ) : null}

            {activeTab === "cobros" ? (
              <section
                id="client360-panel-cobros"
                role="tabpanel"
                aria-labelledby="client360-tab-cobros"
              >
                <CobrosTab receipts={data.receipts} />
              </section>
            ) : null}

            {activeTab === "cuenta" ? (
              <section
                id="client360-panel-cuenta"
                role="tabpanel"
                aria-labelledby="client360-tab-cuenta"
              >
              <EstadoCuentaTab
                companyId={companyId}
                data={data}
                isUsd360={isUsd360}
                displayFxRate={displayFxRate}
                onSuggestFollowup={handleSuggestFollowup}
              />
              </section>
            ) : null}

            {activeTab === "contactos" ? (
              <section
                id="client360-panel-contactos"
                role="tabpanel"
                aria-labelledby="client360-tab-contactos"
              >
                <ContactosTab data={data} />
              </section>
            ) : null}

            {activeTab === "cobranza" ? (
              <section
                id="client360-panel-cobranza"
                role="tabpanel"
                aria-labelledby="client360-tab-cobranza"
              >
              <CobranzaTab
                data={data}
                collectionPrefill={collectionPrefill}
                collectionPrefillKey={collectionPrefillKey}
              />
              </section>
            ) : null}

            {activeTab === "identificacion" ? (
              <section
                id="client360-panel-identificacion"
                role="tabpanel"
                aria-labelledby="client360-tab-identificacion"
              >
                {returnTo ? (
                  <div className="border-b border-[var(--copilot-border)] px-5 py-3">
                    <CopilotGhostLink href={`/copilot/movimientos-bancarios?${returnTo}`}>
                      <ArrowLeft className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                      Volver a Banco
                    </CopilotGhostLink>
                  </div>
                ) : null}
                <ClientBankIdentitySection companyId={companyId} canWrite={canWrite} />
                <div className="border-t border-[var(--copilot-border)]">
                  <ClientPayerMemorySection companyId={companyId} />
                </div>
              </section>
            ) : null}

            {activeTab === "actividad" ? (
              <section
                id="client360-panel-actividad"
                role="tabpanel"
                aria-labelledby="client360-tab-actividad"
              >
              <ActividadTab events={timelineEvents} lastSyncAt={data.last_sync_at} />
              <div className="px-5 pb-4">
                <RelatedTasksCard
                  sourceType="client"
                  sourceId={companyId}
                  moduleKey="clientes"
                  canWrite={canWrite}
                  title="Tareas del cliente"
                  actionUrl={`/copilot/clientes/${companyId}`}
                />
              </div>
              </section>
            ) : null}

            {activeTab === "notas" ? (
              <section
                id="client360-panel-notas"
                role="tabpanel"
                aria-labelledby="client360-tab-notas"
              >
                <NotasTab />
              </section>
            ) : null}
          </>
        ) : null}

        {!loading && !error && !data ? (
          <p className="text-sm text-[var(--copilot-ink-muted)]">Sin registros en esta sección.</p>
        ) : null}
      </div>
    </div>
  );
}
