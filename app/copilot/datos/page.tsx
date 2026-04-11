"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Plus, Search } from "lucide-react";

import { useCopilotReadingKeyOverride } from "@/components/copilot/copilot-reading-key-context";
import { CopilotDataSidebar } from "@/components/copilot/copilot-data-sidebar";
import {
  CopilotDataTable,
  type DataColumn,
} from "@/components/copilot/copilot-data-table";
import {
  CopilotDataTrainingBlock,
} from "@/components/copilot/copilot-data-training-block";
import {
  CopilotProtoCrudDrawer,
} from "@/components/copilot/copilot-proto-crud-drawer";
import { CopilotProtoDeleteDialog } from "@/components/copilot/copilot-proto-delete-dialog";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  CopilotCard,
  CopilotGhostButton,
  CopilotPrimaryLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import {
  getProtoCompanies,
  getProtoContacts,
  getProtoInvoices,
  getProtoPayments,
  getProtoReceipts,
  getProtoTaxObligationsRows,
  type DataEntity,
  type DataRow,
  type ProtoActiveListMode,
} from "@/lib/copilot-data";
import { buildDatosFilterOptions } from "@/lib/copilot-format";
import { DATA_TRAINING } from "@/lib/copilot-data-integrity";
import {
  COPILOT_DATA_API,
  type ProtoCrudEntity,
  type ProtoCrudResult,
} from "@/lib/copilot-proto-crud-types";

const entityTabs: Array<{ id: DataEntity; label: string }> = [
  { id: "companies", label: "Empresas" },
  { id: "contacts", label: "Contactos" },
  { id: "invoices", label: "Facturas" },
  { id: "receipts", label: "Recibos" },
  { id: "payments", label: "Pagos" },
  { id: "tax_obligations", label: "Obligaciones fiscales" },
];

const columnsByEntity: Record<DataEntity, DataColumn[]> = {
  companies: [
    { key: "name", label: "Nombre" },
    { key: "industry", label: "Industria" },
    { key: "city", label: "Ciudad" },
    { key: "status", label: "Estado" },
    { key: "risk_level", label: "Riesgo" },
  ],
  contacts: [
    { key: "full_name", label: "Nombre" },
    { key: "job_title", label: "Cargo" },
    { key: "email", label: "Email" },
    { key: "status", label: "Estado" },
  ],
  invoices: [
    { key: "invoice_number", label: "Factura" },
    { key: "issue_date", label: "Emisión" },
    { key: "due_date", label: "Vencimiento" },
    { key: "total_amount", label: "Importe total" },
    { key: "balance_amount", label: "Saldo" },
    { key: "collection_probability", label: "Prob. cobro" },
    { key: "status", label: "Estado" },
  ],
  receipts: [
    { key: "receipt_number", label: "Recibo" },
    { key: "receipt_date", label: "Fecha" },
    { key: "amount", label: "Monto" },
    { key: "payment_method", label: "Método" },
    { key: "status", label: "Estado" },
  ],
  payments: [
    { key: "payment_number", label: "Pago" },
    { key: "payment_date", label: "Fecha pago" },
    { key: "amount", label: "Monto" },
    { key: "category", label: "Categoría" },
    { key: "obligation_id", label: "Obligación fiscal" },
    { key: "status", label: "Estado" },
  ],
  tax_obligations: [
    { key: "tax_type", label: "Impuesto" },
    { key: "period_label", label: "Período" },
    { key: "due_date", label: "Vencimiento" },
    { key: "estimated_amount", label: "Estimado" },
    { key: "status", label: "Estado" },
    { key: "priority", label: "Prioridad" },
  ],
};

const searchKeysByEntity: Record<DataEntity, string[]> = {
  companies: ["name", "industry", "city"],
  contacts: ["full_name", "email", "job_title"],
  invoices: ["invoice_number", "category", "status"],
  receipts: ["receipt_number", "reference", "status"],
  payments: ["payment_number", "category", "vendor_name", "status"],
  tax_obligations: ["tax_type", "period_label", "status", "notes"],
};

const filterKeyByEntity: Partial<Record<DataEntity, string>> = {
  companies: "risk_level",
  invoices: "status",
  receipts: "status",
  payments: "status",
  tax_obligations: "status",
};

const interactiveColumnKeysByEntity: Record<DataEntity, string[]> = {
  companies: ["name"],
  contacts: ["full_name"],
  invoices: ["invoice_number"],
  receipts: ["receipt_number"],
  payments: ["payment_number"],
  tax_obligations: ["period_label"],
};

const CRUD_ENTITIES: readonly ProtoCrudEntity[] = [
  "companies",
  "invoices",
  "receipts",
  "payments",
  "tax_obligations",
] as const;

/** Etiqueta del botón de alta (Contactos sin drawer CRUD aún). */
const NEW_RECORD_LABEL: Partial<Record<DataEntity, string>> = {
  companies: "Nueva empresa",
  invoices: "Nueva factura",
  receipts: "Nuevo recibo",
  payments: "Nuevo pago",
  tax_obligations: "Nueva obligación",
};

function isProtoCrudEntity(e: DataEntity): e is ProtoCrudEntity {
  return (CRUD_ENTITIES as readonly string[]).includes(e);
}

function rowMatchesSearch(row: DataRow, entity: DataEntity, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  const keys = searchKeysByEntity[entity];
  return keys.some((k) => String(row[k] ?? "").toLowerCase().includes(q));
}

type BannerState =
  | { kind: "ok"; message: string; warning?: string }
  | { kind: "err"; message: string }
  | null;

const URL_ENTITIES: readonly DataEntity[] = [
  "companies",
  "contacts",
  "invoices",
  "receipts",
  "payments",
  "tax_obligations",
] as const;

function CopilotDatosPageContent() {
  const searchParams = useSearchParams();
  const { setReadingKeyOverride } = useCopilotReadingKeyOverride();
  const [entity, setEntity] = useState<DataEntity>("companies");
  const [rows, setRows] = useState<DataRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterValue, setFilterValue] = useState<string>("all");
  const [selectedRow, setSelectedRow] = useState<DataRow | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [companies, setCompanies] = useState<DataRow[]>([]);
  const [banner, setBanner] = useState<BannerState>(null);
  const [crudOpen, setCrudOpen] = useState(false);
  const [crudMode, setCrudMode] = useState<"create" | "edit">("create");
  const [crudEntity, setCrudEntity] = useState<ProtoCrudEntity | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteDialogKey, setDeleteDialogKey] = useState(0);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [listActiveFilter, setListActiveFilter] =
    useState<ProtoActiveListMode>("active");
  const [paymentPrefillRow, setPaymentPrefillRow] = useState<DataRow | null>(
    null
  );
  const quickAddBootstrapped = useRef<string | null>(null);
  const editOblBootstrapped = useRef<string | null>(null);
  /** Invalida listados async al desmontar o al superponer otra carga. */
  const listFetchIdRef = useRef(0);
  const mountedRef = useRef(true);
  const [crudCreateTitle, setCrudCreateTitle] = useState<string | undefined>(
    undefined
  );
  const [quickAddSaved, setQuickAddSaved] = useState(false);
  const [quickAddSaveMessage, setQuickAddSaveMessage] = useState("");
  const [quickAddSaveWarning, setQuickAddSaveWarning] = useState<
    string | undefined
  >(undefined);

  const isQuickAddForm = useMemo(() => {
    const intent = searchParams.get("intent");
    const e = searchParams.get("entity");
    return (
      intent === "quick-add" &&
      (e === "payments" || e === "invoices")
    );
  }, [searchParams]);

  useLayoutEffect(() => {
    setReadingKeyOverride(
      isQuickAddForm ? { kind: "hidden" } : { kind: "auto" }
    );
  }, [isQuickAddForm, setReadingKeyOverride]);

  const quickAddEntityParam = searchParams.get("entity");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      listFetchIdRef.current += 1;
    };
  }, []);

  const fetchRows = useCallback(async (target: DataEntity, mode: ProtoActiveListMode) => {
    const reqId = ++listFetchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data =
        target === "companies"
          ? await getProtoCompanies(mode)
          : target === "contacts"
            ? await getProtoContacts(mode)
            : target === "invoices"
              ? await getProtoInvoices(mode)
              : target === "receipts"
                ? await getProtoReceipts(mode)
                : target === "payments"
                  ? await getProtoPayments(mode)
                  : await getProtoTaxObligationsRows(mode);
      if (listFetchIdRef.current !== reqId) return;
      setRows(data);
    } catch (e) {
      if (listFetchIdRef.current !== reqId) return;
      setRows([]);
      setError(e instanceof Error ? e.message : "No se pudieron cargar datos.");
    } finally {
      if (listFetchIdRef.current === reqId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getProtoCompanies()
      .then((data) => {
        if (!cancelled && mountedRef.current) setCompanies(data);
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) setCompanies([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const e = searchParams.get("entity");
    if (e && (URL_ENTITIES as readonly string[]).includes(e)) {
      setEntity(e as DataEntity);
    }
  }, [searchParams]);

  const datosQueryKey = searchParams.toString();

  useEffect(() => {
    setQuickAddSaved(false);
    setQuickAddSaveMessage("");
    setQuickAddSaveWarning(undefined);
  }, [datosQueryKey]);

  useEffect(() => {
    if (loading) return;
    const intent = searchParams.get("intent");
    if (intent !== "quick-add") return;
    const e = searchParams.get("entity");
    if (e !== "payments" && e !== "invoices") return;
    if (entity !== e) return;
    const oid = searchParams.get("obligation_id");
    const cid = searchParams.get("company_id");
    const key = `quick-add:${e}:${oid ?? ""}:${cid ?? ""}`;
    if (quickAddBootstrapped.current === key) return;
    quickAddBootstrapped.current = key;
    setSidebarOpen(false);
    if (e === "payments") {
      setCrudEntity("payments");
      setCrudMode("create");
      setCrudCreateTitle("Registrar pago");
      if (oid) {
        const row: DataRow = { obligation_id: oid };
        if (cid) row.company_id = cid;
        setPaymentPrefillRow(row);
      } else {
        setPaymentPrefillRow(null);
      }
    } else {
      setCrudEntity("invoices");
      setCrudMode("create");
      setCrudCreateTitle("Registrar cobro");
      setPaymentPrefillRow(null);
    }
    setCrudOpen(true);
  }, [entity, loading, searchParams]);

  useEffect(() => {
    if (loading) return;
    const intent = searchParams.get("intent");
    const oid = searchParams.get("obligation_id");
    if (intent !== "edit-obligation" || !oid || entity !== "tax_obligations") {
      return;
    }
    const key = `edit-obligation:${oid}`;
    if (editOblBootstrapped.current === key) return;
    const row = rows.find((r) => String(r.id) === oid);
    if (!row) return;
    editOblBootstrapped.current = key;
    setSelectedRow(row);
    setCrudEntity("tax_obligations");
    setCrudMode("edit");
    setSidebarOpen(false);
    setCrudOpen(true);
  }, [entity, loading, rows, searchParams]);

  useEffect(() => {
    setSelectedRow(null);
    setSidebarOpen(false);
    setFilterValue("all");

    const intent = searchParams.get("intent");
    const eParam = searchParams.get("entity");
    const qa =
      intent === "quick-add" &&
      (eParam === "payments" || eParam === "invoices");

    if (qa) {
      setLoading(false);
      setRows([]);
      setError(null);
      return;
    }

    setCrudOpen(false);
    setCrudEntity(null);
    setCrudCreateTitle(undefined);
    setPaymentPrefillRow(null);
    void fetchRows(entity, listActiveFilter);
  }, [entity, fetchRows, searchParams, listActiveFilter]);

  const filterOptions = useMemo(() => {
    const key = filterKeyByEntity[entity];
    if (!key) return [];
    return buildDatosFilterOptions(entity, key, rows);
  }, [entity, rows]);

  const filteredRows = useMemo(() => {
    const key = filterKeyByEntity[entity];
    return rows
      .filter((row) => rowMatchesSearch(row, entity, search))
      .filter((row) =>
        key && filterValue !== "all" ? String(row[key] ?? "") === filterValue : true
      );
  }, [rows, entity, search, filterValue]);

  const selectedRowId = selectedRow ? String(selectedRow.id ?? "") : null;

  const openCreate = () => {
    if (!isProtoCrudEntity(entity)) return;
    setCrudCreateTitle(undefined);
    setCrudEntity(entity);
    setCrudMode("create");
    setCrudOpen(true);
  };

  const openEdit = () => {
    if (!selectedRow || !isProtoCrudEntity(entity)) return;
    setCrudCreateTitle(undefined);
    setCrudEntity(entity);
    setCrudMode("edit");
    setSidebarOpen(false);
    setCrudOpen(true);
  };

  const openDelete = () => {
    setDeleteError(null);
    setDeleteDialogKey((k) => k + 1);
    setDeleteOpen(true);
  };

  const closeDelete = () => {
    setDeleteOpen(false);
    setDeleteError(null);
  };

  const confirmRestore = async () => {
    if (!selectedRow?.id || !isProtoCrudEntity(entity)) return;
    const id = String(selectedRow.id);
    const ep = COPILOT_DATA_API[entity];
    setRestoreLoading(true);
    setBanner(null);
    try {
      const res = await fetch(ep.restore, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = (await res.json()) as ProtoCrudResult<Record<string, unknown>>;
      if (!mountedRef.current) return;
      if (j.ok) {
        setBanner({ kind: "ok", message: j.message });
        setSidebarOpen(false);
        setSelectedRow(null);
        await fetchRows(entity, listActiveFilter);
        if (!mountedRef.current) return;
        void getProtoCompanies()
          .then((data) => {
            if (mountedRef.current) setCompanies(data);
          })
          .catch(() => {
            if (mountedRef.current) setCompanies([]);
          });
        return;
      }
      setBanner({
        kind: "err",
        message:
          j.code === "VALIDATION"
            ? j.message
            : j.message || "No se pudo reactivar el registro.",
      });
    } catch (e) {
      if (!mountedRef.current) return;
      setBanner({
        kind: "err",
        message: e instanceof Error ? e.message : "Error al reactivar.",
      });
    } finally {
      if (mountedRef.current) {
        setRestoreLoading(false);
      }
    }
  };

  const confirmDelete = async () => {
    if (!selectedRow?.id || !isProtoCrudEntity(entity)) return;
    const id = String(selectedRow.id);
    const ep = COPILOT_DATA_API[entity];
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch(
        `${ep.delete}?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      const j = (await res.json()) as ProtoCrudResult<{ id: string }>;
      if (!mountedRef.current) return;
      if (j.ok) {
        setBanner({ kind: "ok", message: j.message });
        closeDelete();
        setSidebarOpen(false);
        setSelectedRow(null);
        await fetchRows(entity, listActiveFilter);
        return;
      }
      const msg =
        j.code === "INTEGRITY_BLOCK"
          ? `No se puede archivar (integridad de datos): ${j.message}`
          : j.code === "VALIDATION"
            ? j.message
            : j.message;
      setDeleteError(msg);
    } catch (e) {
      if (!mountedRef.current) return;
      setDeleteError(e instanceof Error ? e.message : "Error al archivar.");
    } finally {
      if (mountedRef.current) {
        setDeleteLoading(false);
      }
    }
  };

  const onCrudSaved = useCallback(
    (message: string, warning?: string) => {
      const intent = searchParams.get("intent");
      const eParam = searchParams.get("entity");
      const qa =
        intent === "quick-add" &&
        (eParam === "payments" || eParam === "invoices");
      if (qa) {
        if (!mountedRef.current) return;
        setQuickAddSaved(true);
        setQuickAddSaveMessage(message);
        setQuickAddSaveWarning(warning);
        setCrudEntity(null);
        setCrudOpen(false);
        setPaymentPrefillRow(null);
        setCrudCreateTitle(undefined);
        void getProtoCompanies()
          .then((data) => {
            if (mountedRef.current) setCompanies(data);
          })
          .catch(() => {
            if (mountedRef.current) setCompanies([]);
          });
        return;
      }
      if (!mountedRef.current) return;
      setBanner({ kind: "ok", message, warning });
      void fetchRows(entity, listActiveFilter);
      void getProtoCompanies()
        .then((data) => {
          if (mountedRef.current) setCompanies(data);
        })
        .catch(() => {
          if (mountedRef.current) setCompanies([]);
        });
    },
    [entity, fetchRows, searchParams, listActiveFilter]
  );

  const deleteTitle =
    selectedRow && isProtoCrudEntity(entity)
      ? entity === "tax_obligations"
        ? `Archivar obligación ${String(selectedRow.period_label ?? "")}`
        : entity === "companies"
          ? `Archivar empresa ${String(selectedRow.name ?? "")}`
          : `Archivar ${entity === "invoices" ? "factura" : entity === "receipts" ? "recibo" : "pago"}`
      : "Archivar registro";

  const newRecordLabel = NEW_RECORD_LABEL[entity];

  const pageTitle =
    isQuickAddForm && quickAddSaved
      ? "Registro guardado"
      : isQuickAddForm && quickAddEntityParam === "payments"
        ? "Registrar pago"
        : isQuickAddForm && quickAddEntityParam === "invoices"
          ? "Registrar cobro"
          : "Datos";

  const pageDescription =
    isQuickAddForm && quickAddSaved
      ? "El alta quedó registrada en la base. Podés volver a Finanzas para seguir el plan."
      : isQuickAddForm
        ? "Flujo guiado: completá los campos y guardá. Los datos impactan caja y lecturas en Copilot."
        : "Centro de trazabilidad de datos reales del sistema: validación, contexto y confianza operativa.";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        title={pageTitle}
        description={pageDescription}
        right={
          isQuickAddForm ? undefined : (
            <CopilotGhostButton className="inline-flex items-center gap-2" type="button">
              Exportar PDF (próximamente)
            </CopilotGhostButton>
          )
        }
      />

      <div className="flex-1 space-y-6 overflow-auto px-6 py-8">
        {isQuickAddForm && quickAddSaved ? (
          <CopilotCard className="space-y-4 p-6">
            <p className="text-sm font-medium text-emerald-950">{quickAddSaveMessage}</p>
            {quickAddSaveWarning ? (
              <p className="text-sm text-emerald-900/90">{quickAddSaveWarning}</p>
            ) : null}
            <CopilotPrimaryLink
              href="/copilot/finanzas"
              className="inline-flex w-full justify-center sm:w-auto"
            >
              Volver a Finanzas
            </CopilotPrimaryLink>
          </CopilotCard>
        ) : isQuickAddForm ? (
          <>
            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {error}
              </div>
            ) : null}
            {!crudEntity ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--copilot-border)] py-14 text-sm text-[var(--copilot-ink-muted)]">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                Preparando formulario…
              </div>
            ) : (
              <CopilotProtoCrudDrawer
                variant="page"
                open={crudOpen}
                mode={crudMode}
                entity={crudEntity}
                createTitle={crudMode === "create" ? crudCreateTitle : undefined}
                initialRow={
                  crudEntity === "payments" &&
                  crudMode === "create" &&
                  paymentPrefillRow
                    ? paymentPrefillRow
                    : crudMode === "edit"
                      ? selectedRow
                      : null
                }
                companies={companies}
                onClose={() => {
                  setCrudOpen(false);
                  setPaymentPrefillRow(null);
                  setCrudCreateTitle(undefined);
                }}
                onSaved={onCrudSaved}
              />
            )}
          </>
        ) : (
          <>
            {banner?.kind === "ok" ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
                <p className="font-medium">{banner.message}</p>
                {banner.warning ? (
                  <p className="mt-1 text-emerald-900/90">{banner.warning}</p>
                ) : null}
              </div>
            ) : null}
            {banner?.kind === "err" ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {banner.message}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {error}
              </div>
            ) : null}

            <CopilotCard className="space-y-4">
              <CopilotSectionTitle
                title="Navegación de entidades"
                subtitle="Seleccioná una entidad para explorar sus registros. En empresas, facturas, recibos, pagos y obligaciones fiscales podés crear, editar y archivar (contactos: solo lectura por ahora)."
                action={
                  newRecordLabel && isProtoCrudEntity(entity) ? (
                    <button
                      type="button"
                      onClick={openCreate}
                      className="inline-flex items-center gap-2 rounded-xl bg-[var(--copilot-accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
                    >
                      <Plus className="h-4 w-4 shrink-0" aria-hidden />
                      {newRecordLabel}
                    </button>
                  ) : undefined
                }
              />

              {isProtoCrudEntity(entity) ? (
                <CopilotDataTrainingBlock
                  severity={DATA_TRAINING.datosOverview.severity}
                  title="Capacitación · módulo Datos"
                  paragraphs={DATA_TRAINING.datosOverview.paragraphs}
                />
              ) : null}

              <div className="flex flex-wrap gap-2">
                {entityTabs.map((tab) => {
                  const active = tab.id === entity;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setEntity(tab.id)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                        active
                          ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.22)]"
                          : "bg-white text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-white/80"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="relative min-w-[220px] flex-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--copilot-ink-muted)]"
                    aria-hidden
                  />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar en registros..."
                    className="w-full rounded-xl border border-[var(--copilot-border)] bg-white px-9 py-2.5 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    <span>Listado</span>
                    <select
                      value={listActiveFilter}
                      onChange={(e) =>
                        setListActiveFilter(e.target.value as ProtoActiveListMode)
                      }
                      className="rounded-lg border border-[var(--copilot-border)] bg-white px-2 py-1.5 text-sm font-medium normal-case text-[var(--copilot-ink)]"
                    >
                      <option value="active">Activos</option>
                      <option value="inactive">Inactivos</option>
                      <option value="all">Todos</option>
                    </select>
                  </label>
                  <span className="rounded-lg bg-[rgba(44,40,37,0.06)] px-3 py-1.5 text-xs font-semibold text-[var(--copilot-ink-muted)]">
                    {filteredRows.length} registros
                  </span>
                </div>
              </div>

              {filterOptions.length > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Filtro:
                  </span>
                  <select
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                    className="rounded-lg border border-[var(--copilot-border)] bg-white px-3 py-1.5 text-sm text-[var(--copilot-ink)]"
                  >
                    <option value="all">Todos</option>
                    {filterOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <CopilotGhostButton
                    type="button"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => setFilterValue("all")}
                  >
                    Limpiar
                  </CopilotGhostButton>
                </div>
              ) : null}

              {loading ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--copilot-border)] py-14 text-sm text-[var(--copilot-ink-muted)]">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Cargando datos…
                </div>
              ) : (
                <CopilotDataTable
                  data={filteredRows}
                  columns={columnsByEntity[entity]}
                  entity={entity}
                  selectedRowId={selectedRowId}
                  interactiveColumnKeys={interactiveColumnKeysByEntity[entity]}
                  inactiveBadge={listActiveFilter !== "active"}
                  onRowClick={(row) => {
                    setSelectedRow(row);
                    setSidebarOpen(true);
                  }}
                />
              )}
            </CopilotCard>
          </>
        )}
      </div>

      <CopilotDataSidebar
        entity={entity}
        row={selectedRow}
        isOpen={!isQuickAddForm && sidebarOpen && selectedRow != null}
        onClose={() => setSidebarOpen(false)}
        onEdit={isProtoCrudEntity(entity) ? openEdit : undefined}
        onDelete={isProtoCrudEntity(entity) ? openDelete : undefined}
        onRestore={
          isProtoCrudEntity(entity)
            ? () => void confirmRestore()
            : undefined
        }
        restoreBusy={restoreLoading}
      />

      {!isQuickAddForm && crudEntity ? (
        <CopilotProtoCrudDrawer
          variant="drawer"
          open={crudOpen}
          mode={crudMode}
          entity={crudEntity}
          createTitle={crudMode === "create" ? crudCreateTitle : undefined}
          initialRow={
            crudEntity === "payments" && crudMode === "create" && paymentPrefillRow
              ? paymentPrefillRow
              : crudMode === "edit"
                ? selectedRow
                : null
          }
          companies={companies}
          onClose={() => {
            setCrudOpen(false);
            setPaymentPrefillRow(null);
            setCrudCreateTitle(undefined);
          }}
          onSaved={onCrudSaved}
        />
      ) : null}

      <CopilotProtoDeleteDialog
        key={deleteDialogKey}
        open={deleteOpen}
        title={deleteTitle}
        description="Este registro dejará de impactar en cálculos y listados activos."
        loading={deleteLoading}
        error={deleteError}
        onCancel={closeDelete}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

export default function CopilotDatosPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-20 text-sm text-[var(--copilot-ink-muted)]">
          Cargando Datos…
        </div>
      }
    >
      <CopilotDatosPageContent />
    </Suspense>
  );
}
