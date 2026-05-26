"use client";
/**
 * Datos (/copilot/datos): entidades en acordeón; cada bloque carga `getProto*` solo al expandir.
 * - Sin fetch inicial al entrar; dataset API solo cuando el usuario abre una sección.
 * - Facturas: período en la fila de acción; «Ver facturas» abre el bloque y dispara la API; mes/año filtran en cliente.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Loader2, Plus, Search } from "lucide-react";

import { useCopilotReadingKeyOverride } from "@/components/copilot/copilot-reading-key-context";
import { CopilotDataSidebar } from "@/components/copilot/copilot-data-sidebar";
import {
  CopilotDataTable,
  type DataColumn,
} from "@/components/copilot/copilot-data-table";
import {
  CopilotProtoCrudDrawer,
} from "@/components/copilot/copilot-proto-crud-drawer";
import { CopilotProtoDeleteDialog } from "@/components/copilot/copilot-proto-delete-dialog";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { FinancialWarningBanner } from "@/components/copilot/financial-warning-banner";
import { FinancialStatusBadge } from "@/components/copilot/financial-status-badge";
import { DataFreshnessBanner } from "@/components/copilot/data-freshness-banner";
import { ExportDisclaimerModal } from "@/components/copilot/export-disclaimer-modal";
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
import { invalidateCopilotDatasetCache } from "@/lib/copilot-dataset-client";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { buildDatosFilterOptions } from "@/lib/copilot-format";
import {
  COPILOT_DATA_API,
  type ProtoCrudEntity,
  type ProtoCrudResult,
} from "@/lib/copilot-proto-crud-types";
import { companyPrimaryLabel } from "@/lib/copilot-datos-company-display";
import { formatInvoiceFacturaPrimary } from "@/lib/copilot-datos-invoice-display";
import {
  enrichInvoiceRowsForDatos,
  INVOICE_CLIENT_CODIGO_KEY,
  INVOICE_CLIENT_RAZON_KEY,
  invoiceIssueInCalendarMonth,
  invoiceIssueInClosedRange,
} from "@/lib/copilot-datos-invoices-ui";
import {
  enrichReceiptRowsForDatos,
  RECEIPT_REF_DISPLAY_KEY,
  RECEIPT_CLIENT_NAME_KEY,
} from "@/lib/copilot-datos-receipts-ui";
import {
  filterRowsByPeriod,
  PERIOD_MONTH_OPTIONS,
  type PeriodSelector,
} from "@/lib/copilot-datos-period-filter";
import { deriveFinancialFlags } from "@/lib/derive-financial-flags";
import { FINANCIAL_UX_COPY } from "@/lib/copilot-financial-ux-copy";
import { getFinancialSnapshot } from "@/lib/copilot-financial-engine";

const entityTabs: Array<{ id: DataEntity; label: string }> = [
  { id: "companies", label: "Clientes" },
  { id: "invoices", label: "Facturas" },
  { id: "receipts", label: "Recibos" },
  { id: "payments", label: "Pagos" },
  { id: "tax_obligations", label: "Obligaciones fiscales" },
];

const DATOS_EXPAND_HINT: Record<DataEntity, string> = {
  companies: "Catálogo de clientes registrados.",
  contacts: "Contactos asociados a los clientes.",
  invoices: "Elegí el período y luego tocá «Ver facturas».",
  receipts: "Cobros registrados.",
  payments: "Pagos fiscales registrados.",
  tax_obligations: "Obligaciones fiscales registradas.",
};

const DATOS_EXPAND_CTA: Record<DataEntity, string> = {
  companies: "Ver clientes",
  contacts: "Ver contactos",
  invoices: "Ver facturas",
  receipts: "Ver recibos",
  payments: "Ver pagos",
  tax_obligations: "Ver obligaciones",
};

const columnsByEntity: Record<DataEntity, DataColumn[]> = {
  companies: [
    { key: "RazonSocial", label: "Razón social" },
    { key: "Codigo", label: "Código" },
    { key: "Documento", label: "Documento" },
    { key: "Email1", label: "Email" },
    { key: "Telefono", label: "Teléfono" },
    { key: "Direccion", label: "Dirección" },
    { key: "Localidad", label: "Localidad" },
    { key: "GiroNombre", label: "Giro" },
    { key: "status", label: "Estado" },
    { key: "risk_level", label: "Riesgo" },
  ],
  contacts: [
    { key: "full_name", label: "Nombre" },
    { key: "company_name", label: "Empresa" },
    { key: "job_title", label: "Cargo" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Teléfono" },
    { key: "mobile", label: "Celular" },
    { key: "status", label: "Estado" },
  ],
  invoices: [
    { key: "invoice_number", label: "Factura" },
    { key: INVOICE_CLIENT_CODIGO_KEY, label: "Cliente (código)" },
    { key: INVOICE_CLIENT_RAZON_KEY, label: "Cliente (nombre)" },
    { key: "issue_date", label: "Emisión" },
    { key: "total_amount", label: "Importe total" },
    { key: "balance_amount", label: "Saldo" },
    { key: "collection_probability", label: "Prob. cobro" },
  ],
  receipts: [
    { key: RECEIPT_REF_DISPLAY_KEY, label: "Número" },
    { key: RECEIPT_CLIENT_NAME_KEY, label: "Cliente" },
    { key: "receipt_date", label: "Fecha" },
    { key: "amount", label: "Monto" },
    { key: "currency_code", label: "Moneda" },
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
    { key: "vendor_name", label: "Proveedor" },
    { key: "currency_code", label: "Moneda" },
    { key: "caja_nombre", label: "Caja" },
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
  companies: [
    "RazonSocial",
    "Nombre",
    "Codigo",
    "Documento",
    "DocumentoTipo",
    "Email1",
    "Telefono",
    "Celular",
    "Direccion",
    "DireccionCompleta",
    "Localidad",
    "GiroNombre",
    "RUT",
    "name",
    "industry",
    "city",
  ],
  contacts: ["full_name", "email", "job_title", "company_name", "phone", "mobile"],
  invoices: [
    "invoice_number",
    INVOICE_CLIENT_CODIGO_KEY,
    INVOICE_CLIENT_RAZON_KEY,
    "category",
    "status",
  ],
  receipts: ["receipt_number", "reference", RECEIPT_REF_DISPLAY_KEY, RECEIPT_CLIENT_NAME_KEY, "payment_method", "status"],
  payments: ["payment_number", "category", "vendor_name", "currency_code", "caja_nombre", "status"],
  tax_obligations: ["tax_type", "period_label", "status", "notes"],
};

const filterKeyByEntity: Partial<Record<DataEntity, string>> = {
  companies: "risk_level",
  invoices: "status",
  receipts: "status",
  payments: "status",
  tax_obligations: "status",
};

/** Columna de orden inicial por entidad. Omitir entidad = usar primera columna (comportamiento previo). */
const defaultSortKeyByEntity: Partial<Record<DataEntity, string>> = {
  invoices: "issue_date",
  receipts: "receipt_date",
};

const interactiveColumnKeysByEntity: Record<DataEntity, string[]> = {
  companies: ["RazonSocial", "Codigo"],
  contacts: ["full_name"],
  invoices: ["invoice_number", INVOICE_CLIENT_RAZON_KEY],
  receipts: [RECEIPT_REF_DISPLAY_KEY, RECEIPT_CLIENT_NAME_KEY],
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

/** Etiqueta del botón de alta. Companies se omite: los clientes vienen de Zeta. */
const NEW_RECORD_LABEL: Partial<Record<DataEntity, string>> = {
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
  if (entity === "invoices") {
    const primary = formatInvoiceFacturaPrimary(row).toLowerCase();
    if (primary.includes(q)) return true;
  }
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

function emptyRowsByEntity(): Record<DataEntity, DataRow[]> {
  return Object.fromEntries(
    URL_ENTITIES.map((id) => [id, [] as DataRow[]])
  ) as Record<DataEntity, DataRow[]>;
}

function enrichPaymentRows(rows: DataRow[]): DataRow[] {
  return rows.map((row) => {
    const meta = row.zeta_metadata;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return row;
    const caja = (meta as Record<string, unknown>).caja_nombre;
    if (caja == null || row.caja_nombre != null) return row;
    return { ...row, caja_nombre: caja };
  });
}

function CopilotDatosPageContent() {
  const searchParams = useSearchParams();
  const { setReadingKeyOverride } = useCopilotReadingKeyOverride();
  /** Entidad del bloque expandido (acordeón: una a la vez). null = todo colapsado, sin fetch de tablas. */
  const [expandedEntity, setExpandedEntity] = useState<DataEntity | null>(null);
  /** Compatibilidad con sidebar / CRUD / URL: refleja el bloque activo. */
  const [entity, setEntity] = useState<DataEntity>("companies");
  const [rowsByEntity, setRowsByEntity] = useState<Record<DataEntity, DataRow[]>>(
    emptyRowsByEntity
  );
  const [loadingByEntity, setLoadingByEntity] = useState<Record<DataEntity, boolean>>(
    () =>
      Object.fromEntries(URL_ENTITIES.map((id) => [id, false])) as Record<
        DataEntity,
        boolean
      >
  );
  const [errorByEntity, setErrorByEntity] = useState<Record<DataEntity, string | null>>(
    () =>
      Object.fromEntries(URL_ENTITIES.map((id) => [id, null])) as Record<
        DataEntity,
        string | null
      >
  );
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
    useState<ProtoActiveListMode>("all");
  /** Filtro de emisión para pestaña Facturas (default = mes calendario actual). */
  const [invoicePeriodMode, setInvoicePeriodMode] = useState<"month" | "range" | "all">("month");
  const [invoiceMonth, setInvoiceMonth] = useState(() => new Date().getMonth() + 1);
  const [invoiceYear, setInvoiceYear] = useState(() => new Date().getFullYear());
  const [invoiceRangeFrom, setInvoiceRangeFrom] = useState("");
  const [invoiceRangeTo, setInvoiceRangeTo] = useState("");
  /**
   * Filtro de período para pestaña Recibos. Defaults: año actual, mes "Todos".
   * Mantiene independencia del filtro de Facturas para no inducir efectos cruzados.
   */
  const [receiptYear, setReceiptYear] = useState<PeriodSelector>(() => new Date().getFullYear());
  const [receiptMonth, setReceiptMonth] = useState<PeriodSelector>("all");
  const [paymentPrefillRow, setPaymentPrefillRow] = useState<DataRow | null>(
    null
  );
  const quickAddBootstrapped = useRef<string | null>(null);
  const editOblBootstrapped = useRef<string | null>(null);
  /** Invalida listados async al desmontar o al superponer otra carga. */
  const listFetchIdRef = useRef(0);
  /** Evita refetch al reexpandir con el mismo `listActiveFilter` sin depender de `rowsByEntity` en el effect. */
  const lastLoadedKeyRef = useRef<Partial<Record<DataEntity, string>>>({});
  const mountedRef = useRef(true);
  const [crudCreateTitle, setCrudCreateTitle] = useState<string | undefined>(
    undefined
  );
  const [quickAddSaved, setQuickAddSaved] = useState(false);
  const [quickAddSaveMessage, setQuickAddSaveMessage] = useState("");
  const [quickAddSaveWarning, setQuickAddSaveWarning] = useState<
    string | undefined
  >(undefined);
  const [exportDisclaimerOpen, setExportDisclaimerOpen] = useState(false);
  const [financialAsOfDate, setFinancialAsOfDate] = useState<string | null>(null);

  const rows = useMemo(
    () => (expandedEntity != null ? rowsByEntity[expandedEntity] : []),
    [expandedEntity, rowsByEntity]
  );
  const loading = useMemo(
    () =>
      expandedEntity != null ? loadingByEntity[expandedEntity] : false,
    [expandedEntity, loadingByEntity]
  );
  const error = useMemo(
    () =>
      expandedEntity != null ? errorByEntity[expandedEntity] : null,
    [expandedEntity, errorByEntity]
  );

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

  useEffect(() => {
    let cancelled = false;
    void getFinancialSnapshot()
      .then((snap) => {
        if (!cancelled && mountedRef.current) {
          setFinancialAsOfDate(snap?.as_of_date ?? null);
        }
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) setFinancialAsOfDate(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchEntityBlock = useCallback(
    async (target: DataEntity, mode: ProtoActiveListMode, reqId: number) => {
      setLoadingByEntity((prev) => ({ ...prev, [target]: true }));
      setErrorByEntity((prev) => ({ ...prev, [target]: null }));
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
        setRowsByEntity((prev) => ({
          ...prev,
          [target]: target === "payments" ? enrichPaymentRows(data) : data,
        }));
        lastLoadedKeyRef.current[target] = mode;
      } catch (e) {
        if (listFetchIdRef.current !== reqId) return;
        delete lastLoadedKeyRef.current[target];
        setRowsByEntity((prev) => ({ ...prev, [target]: [] }));
        setErrorByEntity((prev) => ({
          ...prev,
          [target]:
            e instanceof Error ? e.message : "No se pudieron cargar datos.",
        }));
      } finally {
        if (listFetchIdRef.current === reqId) {
          setLoadingByEntity((prev) => ({ ...prev, [target]: false }));
        }
      }
    },
    []
  );

  /** Catálogo de clientes para drawer / enriquecido: primera vez que se abre cualquier bloque. */
  useEffect(() => {
    if (!expandedEntity) return;
    if (companies.length > 0) return;
    let cancelled = false;
    void getProtoCompanies("all")
      .then((data) => {
        if (!cancelled && mountedRef.current) setCompanies(data);
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) setCompanies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [expandedEntity, companies.length]);

  useEffect(() => {
    if (!isQuickAddForm) return;
    let cancelled = false;
    void getProtoCompanies("all")
      .then((data) => {
        if (!cancelled && mountedRef.current) setCompanies(data);
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) setCompanies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isQuickAddForm]);

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
  }, [entity, searchParams]);

  useEffect(() => {
    const intent = searchParams.get("intent");
    const oid = searchParams.get("obligation_id");
    if (intent !== "edit-obligation" || !oid) return;
    setExpandedEntity("tax_obligations");
    setEntity("tax_obligations");
  }, [searchParams]);

  useEffect(() => {
    if (loadingByEntity.tax_obligations) return;
    const intent = searchParams.get("intent");
    const oid = searchParams.get("obligation_id");
    if (
      intent !== "edit-obligation" ||
      !oid ||
      expandedEntity !== "tax_obligations"
    ) {
      return;
    }
    const key = `edit-obligation:${oid}`;
    if (editOblBootstrapped.current === key) return;
    const row = rowsByEntity.tax_obligations.find((r) => String(r.id) === oid);
    if (!row) return;
    editOblBootstrapped.current = key;
    setSelectedRow(row);
    setCrudEntity("tax_obligations");
    setCrudMode("edit");
    setSidebarOpen(false);
    setCrudOpen(true);
  }, [
    expandedEntity,
    loadingByEntity.tax_obligations,
    rowsByEntity.tax_obligations,
    searchParams,
  ]);

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
      setExpandedEntity(null);
      return;
    }

    setCrudOpen(false);
    setCrudEntity(null);
    setCrudCreateTitle(undefined);
    setPaymentPrefillRow(null);
  }, [searchParams]);

  useEffect(() => {
    if (!expandedEntity) return;
    const mode = listActiveFilter;
    if (lastLoadedKeyRef.current[expandedEntity] === mode) return;
    invalidateCopilotDatasetCache();
    const reqId = ++listFetchIdRef.current;
    void fetchEntityBlock(expandedEntity, mode, reqId);
  }, [expandedEntity, listActiveFilter, fetchEntityBlock]);

  const toggleExpanded = (id: DataEntity) => {
    setExpandedEntity((prev) => {
      if (prev === id) {
        listFetchIdRef.current += 1;
        setSelectedRow(null);
        setSidebarOpen(false);
        return null;
      }
      setEntity(id);
      setSearch("");
      setFilterValue("all");
      setSelectedRow(null);
      setSidebarOpen(false);
      return id;
    });
  };

  /** Abre el bloque y dispara la misma carga que el acordeón (sin colapsar si ya está abierto). */
  const expandEntityBlock = useCallback((id: DataEntity) => {
    setExpandedEntity((prev) => {
      if (prev === id) return id;
      setEntity(id);
      setSearch("");
      setFilterValue("all");
      setSelectedRow(null);
      setSidebarOpen(false);
      return id;
    });
  }, []);

  const filterOptions = useMemo(() => {
    if (expandedEntity == null) return [];
    const key = filterKeyByEntity[expandedEntity];
    if (!key) return [];
    return buildDatosFilterOptions(expandedEntity, key, rows);
  }, [expandedEntity, rows]);

  const baseRows = useMemo(() => {
    if (expandedEntity === "invoices") return enrichInvoiceRowsForDatos(rows, companies);
    if (expandedEntity === "receipts") return enrichReceiptRowsForDatos(rows, companies);
    if (expandedEntity === "contacts" && companies.length > 0) {
      const companyMap = new Map<string, string>(
        companies.map((c) => [String(c.id ?? ""), String(c.RazonSocial ?? c.Nombre ?? "")])
      );
      return rows.map((row) => ({
        ...row,
        company_name: companyMap.get(String(row.company_id ?? "")) ?? "",
      }));
    }
    return rows;
  }, [expandedEntity, rows, companies]);

  const periodFilteredRows = useMemo(() => {
    if (expandedEntity === "invoices") {
      if (invoicePeriodMode === "all") return baseRows;
      if (invoicePeriodMode === "month") {
        return baseRows.filter((row) =>
          invoiceIssueInCalendarMonth(row, invoiceYear, invoiceMonth)
        );
      }
      return baseRows.filter((row) =>
        invoiceIssueInClosedRange(row, invoiceRangeFrom, invoiceRangeTo)
      );
    }
    if (expandedEntity === "receipts") {
      return filterRowsByPeriod(baseRows, "receipt_date", receiptYear, receiptMonth);
    }
    return baseRows;
  }, [
    expandedEntity,
    baseRows,
    invoicePeriodMode,
    invoiceYear,
    invoiceMonth,
    invoiceRangeFrom,
    invoiceRangeTo,
    receiptYear,
    receiptMonth,
  ]);

  const filteredRows = useMemo(() => {
    if (expandedEntity == null) return [];
    const key = filterKeyByEntity[expandedEntity];
    return periodFilteredRows
      .filter((row) => rowMatchesSearch(row, expandedEntity, search))
      .filter((row) =>
        key && filterValue !== "all" ? String(row[key] ?? "") === filterValue : true
      );
  }, [periodFilteredRows, expandedEntity, search, filterValue]);

  const externalValidated = false;

  const invoiceFlags = useMemo(() => {
    const invoiceRows = expandedEntity === "invoices" ? periodFilteredRows : [];
    return deriveFinancialFlags({
      invoices: invoiceRows,
      asOfDate: financialAsOfDate,
      externalFinancialValidation: externalValidated,
    });
  }, [expandedEntity, periodFilteredRows, financialAsOfDate, externalValidated]);

  const invoiceYearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    const list: number[] = [];
    for (let i = y + 1; i >= y - 15; i -= 1) list.push(i);
    return list;
  }, []);

  const selectedRowId = selectedRow ? String(selectedRow.id ?? "") : null;

  const refreshExpandedBlock = useCallback(async () => {
    const e = expandedEntity;
    if (!e) return;
    delete lastLoadedKeyRef.current[e];
    invalidateCopilotDatasetCache();
    const reqId = ++listFetchIdRef.current;
    await fetchEntityBlock(e, listActiveFilter, reqId);
  }, [expandedEntity, listActiveFilter, fetchEntityBlock]);

  const openCreate = () => {
    if (!expandedEntity || !isProtoCrudEntity(expandedEntity)) return;
    setCrudCreateTitle(undefined);
    setCrudEntity(expandedEntity);
    setCrudMode("create");
    setCrudOpen(true);
  };

  const openEdit = () => {
    if (!selectedRow || !expandedEntity || !isProtoCrudEntity(expandedEntity)) return;
    setCrudCreateTitle(undefined);
    setCrudEntity(expandedEntity);
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
    if (!selectedRow?.id || !expandedEntity || !isProtoCrudEntity(expandedEntity)) return;
    const id = String(selectedRow.id);
    const ep = COPILOT_DATA_API[expandedEntity];
    setRestoreLoading(true);
    setBanner(null);
    try {
      const res = await copilotApiFetch(ep.restore, {
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
        await refreshExpandedBlock();
        if (!mountedRef.current) return;
        void getProtoCompanies("all")
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
    if (!selectedRow?.id || !expandedEntity || !isProtoCrudEntity(expandedEntity)) return;
    const id = String(selectedRow.id);
    const ep = COPILOT_DATA_API[expandedEntity];
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await copilotApiFetch(
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
        await refreshExpandedBlock();
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
        invalidateCopilotDatasetCache();
        void getProtoCompanies("all")
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
      void (async () => {
        await refreshExpandedBlock();
        if (!mountedRef.current) return;
        void getProtoCompanies("all")
          .then((data) => {
            if (mountedRef.current) setCompanies(data);
          })
          .catch(() => {
            if (mountedRef.current) setCompanies([]);
          });
      })();
    },
    [searchParams, refreshExpandedBlock]
  );

  const deleteTitle =
    selectedRow && expandedEntity && isProtoCrudEntity(expandedEntity)
      ? expandedEntity === "tax_obligations"
        ? `Archivar obligación ${String(selectedRow.period_label ?? "")}`
        : expandedEntity === "companies"
          ? `Archivar cliente ${companyPrimaryLabel(selectedRow)}`
          : `Archivar ${expandedEntity === "invoices" ? "factura" : expandedEntity === "receipts" ? "recibo" : "pago"}`
      : "Archivar registro";

  const newRecordLabel =
    expandedEntity != null ? NEW_RECORD_LABEL[expandedEntity] : undefined;

  const pageTitle =
    isQuickAddForm && quickAddSaved
      ? "Registro guardado"
      : isQuickAddForm && quickAddEntityParam === "payments"
        ? "Registrar pago"
        : isQuickAddForm && quickAddEntityParam === "invoices"
          ? "Registrar cobro"
          : "Datos del negocio";

  const pageDescription =
    isQuickAddForm && quickAddSaved
      ? "El alta quedó registrada en la base. Podés volver a Finanzas para seguir el plan."
      : isQuickAddForm
        ? "Flujo guiado: completá los campos y guardá. Los datos impactan caja y lecturas en Copilot."
        : "Clientes, facturas, recibos y obligaciones que alimentan las lecturas del Copilot.";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.datos"
        title={pageTitle}
        description={pageDescription}
        right={
          isQuickAddForm ? undefined : (
            <CopilotGhostButton
              className="inline-flex items-center gap-2"
              type="button"
              onClick={() => setExportDisclaimerOpen(true)}
            >
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

            {expandedEntity != null && error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {error}
              </div>
            ) : null}

            <CopilotCard className="space-y-4">
              <CopilotSectionTitle
                title="Datos del negocio"
                subtitle="Clientes, facturas, recibos y obligaciones que alimentan las lecturas del Copilot."
                action={
                  expandedEntity === "companies" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.04)] px-3 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)]">
                      Clientes sincronizados desde Zeta
                    </span>
                  ) : expandedEntity &&
                    newRecordLabel &&
                    isProtoCrudEntity(expandedEntity) ? (
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

              <div className="space-y-3">
                {entityTabs.map((tab) => {
                  const isOpen = expandedEntity === tab.id;
                  return (
                    <div
                      key={tab.id}
                      className="overflow-hidden rounded-2xl border border-[var(--copilot-border)] bg-white"
                    >
                      <button
                        type="button"
                        onClick={() => toggleExpanded(tab.id)}
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? "Colapsar" : "Expandir"} ${tab.label}`}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[rgba(44,40,37,0.03)]"
                      >
                        <span className="text-sm font-semibold text-[var(--copilot-ink)]">
                          {tab.label}
                        </span>
                        <ChevronDown
                          className={`h-5 w-5 shrink-0 text-[var(--copilot-ink-muted)] transition-transform ${
                            isOpen ? "rotate-180" : ""
                          }`}
                          aria-hidden
                        />
                      </button>

                      {tab.id === "invoices" && !isOpen ? (
                        <div className="border-t border-[var(--copilot-border)] bg-[rgba(44,40,37,0.02)] px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="max-w-xl text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
                              {DATOS_EXPAND_HINT.invoices}
                            </p>
                            <CopilotGhostButton
                              type="button"
                              onClick={() => expandEntityBlock("invoices")}
                              className="shrink-0 whitespace-nowrap border-[var(--copilot-accent)] font-semibold text-[var(--copilot-accent)] shadow-none hover:bg-[var(--copilot-accent-soft)]"
                            >
                              {DATOS_EXPAND_CTA.invoices}
                            </CopilotGhostButton>
                          </div>
                        </div>
                      ) : !isOpen ? (
                        <div className="border-t border-[var(--copilot-border)] bg-[rgba(44,40,37,0.02)] px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="max-w-xl text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
                              {DATOS_EXPAND_HINT[tab.id]}
                            </p>
                            <CopilotGhostButton
                              type="button"
                              onClick={() => expandEntityBlock(tab.id)}
                              className="shrink-0 whitespace-nowrap border-[var(--copilot-accent)] font-semibold text-[var(--copilot-accent)] shadow-none hover:bg-[var(--copilot-accent-soft)]"
                            >
                              {DATOS_EXPAND_CTA[tab.id]}
                            </CopilotGhostButton>
                          </div>
                        </div>
                      ) : null}

                      {isOpen ? (
                        <div className="space-y-4 border-t border-[var(--copilot-border)] p-4">
                          {tab.id === "invoices" ? (
                            <>
                              {/* Filtro de período — dentro del contexto de Ver facturas */}
                              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.02)] px-4 py-2.5">
                                <span className="mr-1 text-sm font-semibold text-[var(--copilot-ink)]">
                                  {DATOS_EXPAND_CTA.invoices}
                                </span>
                                <select
                                  value={invoicePeriodMode}
                                  onChange={(e) =>
                                    setInvoicePeriodMode(
                                      e.target.value as "month" | "range" | "all"
                                    )
                                  }
                                  className="rounded-lg border border-[var(--copilot-border)] bg-white px-3 py-1.5 text-sm text-[var(--copilot-ink)]"
                                >
                                  <option value="month">Mes y año</option>
                                  <option value="range">Rango de fechas</option>
                                  <option value="all">Todo</option>
                                </select>
                                {invoicePeriodMode === "month" ? (
                                  <>
                                    <select
                                      value={invoiceMonth}
                                      onChange={(e) =>
                                        setInvoiceMonth(Number(e.target.value))
                                      }
                                      className="rounded-lg border border-[var(--copilot-border)] bg-white px-2 py-1.5 text-sm text-[var(--copilot-ink)]"
                                    >
                                      {Array.from({ length: 12 }, (_, i) => i + 1).map(
                                        (m) => (
                                          <option key={m} value={m}>
                                            {String(m).padStart(2, "0")}
                                          </option>
                                        )
                                      )}
                                    </select>
                                    <select
                                      value={invoiceYear}
                                      onChange={(e) =>
                                        setInvoiceYear(Number(e.target.value))
                                      }
                                      className="rounded-lg border border-[var(--copilot-border)] bg-white px-2 py-1.5 text-sm text-[var(--copilot-ink)]"
                                    >
                                      {invoiceYearOptions.map((y) => (
                                        <option key={y} value={y}>
                                          {y}
                                        </option>
                                      ))}
                                    </select>
                                  </>
                                ) : null}
                                {invoicePeriodMode === "range" ? (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <label className="flex items-center gap-1.5 text-xs text-[var(--copilot-ink-muted)]">
                                      Desde
                                      <input
                                        type="date"
                                        value={invoiceRangeFrom}
                                        onChange={(e) =>
                                          setInvoiceRangeFrom(e.target.value)
                                        }
                                        className="rounded-lg border border-[var(--copilot-border)] bg-white px-2 py-1.5 text-sm text-[var(--copilot-ink)]"
                                      />
                                    </label>
                                    <label className="flex items-center gap-1.5 text-xs text-[var(--copilot-ink-muted)]">
                                      Hasta
                                      <input
                                        type="date"
                                        value={invoiceRangeTo}
                                        onChange={(e) =>
                                          setInvoiceRangeTo(e.target.value)
                                        }
                                        className="rounded-lg border border-[var(--copilot-border)] bg-white px-2 py-1.5 text-sm text-[var(--copilot-ink)]"
                                      />
                                    </label>
                                  </div>
                                ) : null}
                              </div>
                              <FinancialWarningBanner />
                              <FinancialWarningBanner variant="info" />
                              <DataFreshnessBanner freshness={invoiceFlags} />
                              <div className="flex flex-wrap items-center gap-2">
                                <FinancialStatusBadge flags={invoiceFlags} />
                                <span className="text-xs text-[var(--copilot-ink-muted)]">
                                  {invoiceFlags.open_invoices_count > 0
                                    ? `${invoiceFlags.open_invoices_count} factura(s) con saldo operativo abierto en la vista actual.`
                                    : FINANCIAL_UX_COPY.noOpenBalanceNotValidated}
                                </span>
                              </div>
                            </>
                          ) : null}
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
                                placeholder={
                                  tab.id === "invoices"
                                    ? "Factura (Serie-Número), cliente, estado…"
                                    : "Buscar en registros…"
                                }
                                className="w-full rounded-xl border border-[var(--copilot-border)] bg-white px-9 py-2.5 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
                              />
                            </label>
                            <div className="flex flex-wrap items-center gap-3">
                              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                                <span>Listado</span>
                                <select
                                  value={listActiveFilter}
                                  onChange={(e) =>
                                    setListActiveFilter(
                                      e.target.value as ProtoActiveListMode
                                    )
                                  }
                                  className="rounded-lg border border-[var(--copilot-border)] bg-white px-2 py-1.5 text-sm font-medium normal-case text-[var(--copilot-ink)]"
                                >
                                  <option value="active">Activos</option>
                                  <option value="inactive">Inactivos</option>
                                  <option value="all">Todos</option>
                                </select>
                              </label>
                              <span className="rounded-lg bg-[rgba(44,40,37,0.06)] px-3 py-1.5 text-xs font-semibold text-[var(--copilot-ink-muted)]">
                                {search.trim() || filterValue !== "all"
                                  ? `${filteredRows.length} / ${periodFilteredRows.length} registros`
                                  : `${periodFilteredRows.length} registros`}
                              </span>
                            </div>
                          </div>

                          {tab.id === "receipts" ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                                Período:
                              </span>
                              <label className="flex items-center gap-1.5 text-xs text-[var(--copilot-ink-muted)]">
                                Año
                                <select
                                  value={String(receiptYear)}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setReceiptYear(v === "all" ? "all" : Number(v));
                                  }}
                                  className="rounded-lg border border-[var(--copilot-border)] bg-white px-2 py-1.5 text-sm text-[var(--copilot-ink)]"
                                >
                                  <option value="all">Todos</option>
                                  {invoiceYearOptions.map((y) => (
                                    <option key={y} value={y}>
                                      {y}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="flex items-center gap-1.5 text-xs text-[var(--copilot-ink-muted)]">
                                Mes
                                <select
                                  value={String(receiptMonth)}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setReceiptMonth(v === "all" ? "all" : Number(v));
                                  }}
                                  className="rounded-lg border border-[var(--copilot-border)] bg-white px-2 py-1.5 text-sm text-[var(--copilot-ink)]"
                                >
                                  <option value="all">Todos</option>
                                  {PERIOD_MONTH_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <CopilotGhostButton
                                type="button"
                                className="px-3 py-1.5 text-xs"
                                onClick={() => {
                                  setReceiptYear("all");
                                  setReceiptMonth("all");
                                }}
                              >
                                Limpiar
                              </CopilotGhostButton>
                            </div>
                          ) : null}

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
                              columns={columnsByEntity[tab.id]}
                              entity={tab.id}
                              selectedRowId={selectedRowId}
                              interactiveColumnKeys={
                                interactiveColumnKeysByEntity[tab.id]
                              }
                              inactiveBadge={listActiveFilter !== "active"}
                              defaultSortKey={defaultSortKeyByEntity[tab.id]}
                              onRowClick={(row) => {
                                setSelectedRow(row);
                                setSidebarOpen(true);
                              }}
                            />
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <p className="border-t border-[var(--copilot-border)] pt-3 text-xs text-[var(--copilot-ink-muted)]">
                {"Vista de consulta. Para gestión, usá "}
                <Link href="/copilot/cartera" className="font-semibold text-[var(--copilot-ink)] hover:underline">Cartera</Link>
                {", "}
                <Link href="/copilot/tesoreria" className="font-semibold text-[var(--copilot-ink)] hover:underline">Tesorería</Link>
                {" o "}
                <Link href="/copilot/acciones" className="font-semibold text-[var(--copilot-ink)] hover:underline">Acciones</Link>
                {"."}
              </p>
            </CopilotCard>
          </>
        )}
      </div>

      <CopilotDataSidebar
        entity={expandedEntity ?? "companies"}
        row={selectedRow}
        isOpen={!isQuickAddForm && sidebarOpen && selectedRow != null}
        onClose={() => setSidebarOpen(false)}
        onEdit={
          expandedEntity && isProtoCrudEntity(expandedEntity)
            ? openEdit
            : undefined
        }
        onDelete={
          expandedEntity && isProtoCrudEntity(expandedEntity)
            ? openDelete
            : undefined
        }
        onRestore={
          expandedEntity && isProtoCrudEntity(expandedEntity)
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
      <ExportDisclaimerModal
        open={exportDisclaimerOpen}
        onCancel={() => setExportDisclaimerOpen(false)}
        onConfirm={() => {
          setExportDisclaimerOpen(false);
          setBanner({
            kind: "ok",
            message: "Exportación operativa confirmada.",
            warning: "La generación de PDF todavía no está habilitada en esta pantalla.",
          });
        }}
      />
    </div>
  );
}

export default CopilotDatosPageContent;
