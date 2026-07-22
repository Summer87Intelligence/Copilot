"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pencil, Plus, Sparkles, Trash2, EyeOff, Eye, X } from "lucide-react";

import { BankMovementsFiltersBar } from "@/components/copilot/bank-movements/bank-movements-filters-bar";
import { BankMovementsImportPanel } from "@/components/copilot/bank-movements/bank-movements-import-panel";
import { BankMovementsReconciliationPanel } from "@/components/copilot/bank-movements/bank-movements-reconciliation-panel";
import { ClusterReviewDrawer } from "@/components/copilot/bank-movements/bank-client-identification-workspace";
import { FocusedReceiptConfirmDrawer } from "@/components/copilot/bank-movements/focused-receipt-confirm-drawer";
import { UnifiedReconciliationWorkspace } from "@/components/copilot/bank-movements/unified-reconciliation-workspace";
import { BankHistoryPanel } from "@/components/copilot/bank-movements/bank-history-panel";

import {
  CopilotResponsiveTable,
  type CopilotResponsiveTableColumn,
} from "@/components/copilot/ui/copilot-responsive-table";
import { EmptyState as DsEmptyState } from "@/components/copilot/ui/empty-state";
import { StatusBadge } from "@/components/copilot/ui/status-badge";
import { TablePagination } from "@/components/copilot/ui/table-pagination";
import { paginate, pageAfterFilterChange } from "@/lib/ui/table-pagination-model";
import { nextSortState, sortRows, type SortState } from "@/lib/ui/table-sort-model";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  COPILOT_GRID_GAP,
  COPILOT_PAGE_GAP,
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotInputClass,
  copilotMetricLabelClass,
  copilotMetricValueClass,
  copilotSectionTitleClass,
} from "@/components/copilot/ui/copilot-visual-system";
import {
  DEFAULT_BANK_MOVEMENTS_LIST_FILTERS,
  filterBankMovements,
  type BankMovementsListFilters,
} from "@/lib/bank-movements/bank-movements-filters";
import { isBankMovementUiHidden } from "@/lib/bank-movements/bank-movement-visibility";
import { isBankMovementHistorical } from "@/lib/bank/canonical/historical-policy";
import { derivePayerClusterKey } from "@/lib/bank/canonical/bank-payer-identification";
import {
  MOVEMENT_LEVEL_LABEL,
  type MovementReconciliationLevel,
} from "@/lib/bank/canonical/movement-reconciliation-level-labels";
import { DUPLICATE_OF_IMPORT_LABEL } from "@/lib/bank/canonical/duplicate-import-audit-labels";
import { resolveImportedBankMovementAmount } from "@/lib/bank-movements/santander-excel-amount";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import {
  BANK_MOVEMENT_DIRECTION_LABELS,
  BANK_MOVEMENT_STATUS_LABELS,
  type BankMovement,
  type BankMovementDirection,
  type BankMovementStatus,
  type BankStatementImport,
} from "@/lib/bank-movements/bank-movements-types";

type BankTab = "importar" | "movimientos" | "conciliacion" | "historial";

/**
 * FASE BANK-SIMPLE-RECONCILIATION-AND-PAYER-MEMORY-001 — navegación final:
 * Importar → Movimientos → Conciliación → Historial. Identificar/vincular desde
 * Movimientos abre la Conciliación unificada (no una página legacy paralela).
 */
const TABS: Array<{ id: BankTab; label: string; primary?: boolean }> = [
  { id: "importar", label: "Importar" },
  { id: "movimientos", label: "Movimientos" },
  { id: "conciliacion", label: "Conciliación", primary: true },
  { id: "historial", label: "Historial" },
];

type ListResponse<T> = { ok: boolean; data?: T[]; message?: string };
type WriteResponse = { ok: boolean; data?: BankMovement; error?: string };

const dateFormatter = new Intl.DateTimeFormat("es-UY", { dateStyle: "medium" });
const numberFormatter = new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2 });

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

type FormState = {
  id: string | null;
  movement_date: string;
  description: string;
  amount: string;
  currency: "UYU" | "USD";
  direction: BankMovementDirection;
  account_label: string;
  bank_reference: string;
};

function emptyForm(): FormState {
  return {
    id: null,
    movement_date: todayYmd(),
    description: "",
    amount: "",
    currency: "UYU",
    direction: "inflow",
    account_label: "",
    bank_reference: "",
  };
}

function formFromMovement(m: BankMovement): FormState {
  return {
    id: m.id,
    movement_date: m.movement_date.slice(0, 10),
    description: m.description,
    amount: String(m.amount),
    currency: m.currency === "USD" ? "USD" : "UYU",
    direction: m.direction,
    account_label: m.account_label ?? "",
    bank_reference: m.bank_reference ?? "",
  };
}

export function BankMovementsPageClient() {
  const searchParams = useSearchParams();
  const { modulePermissions } = useCopilotPermissions();
  const canWriteBank =
    modulePermissions["bank_movements"] === "write" || modulePermissions["bank_movements"] === "admin";
  const [tab, setTab] = useState<BankTab>("movimientos");
  // FASE BANK-RECONCILIATION-SIMPLE-UNIFIED-WORKSPACE-001 — Conciliación ya no
  // tiene dos sub-vistas separadas; ambos flujos existentes (identificación en
  // lote, búsqueda de recibo) se abren como acciones contextuales desde la
  // vista unificada, nunca como pestañas que el usuario deba elegir a mano.
  const [identifyClusterKey, setIdentifyClusterKey] = useState<string | null>(null);
  const [focusClusterKey, setFocusClusterKey] = useState<string | null>(null);
  const deepLinkApplied = useRef(false);

  // Deep link desde el cuaderno de trabajo / URLs antiguas de las pestañas
  // extintas "Conciliación" independiente e "Ingresos" (FASE
  // BANK-SIMPLE-RECONCILIATION-AND-PAYER-MEMORY-001): ?tab=reconciliation |
  // ?tab=conciliacion | ?tab=ingresos normalizan todas a la pestaña
  // Conciliación actual, preservando movementId/suggestionId para enfocar el
  // caso puntual. Ninguna ruta queda huérfana.
  useEffect(() => {
    if (deepLinkApplied.current) return;
    const requestedTab = searchParams.get("tab");
    const direction = searchParams.get("direction");
    const movementIdParam = searchParams.get("movementId");
    if (
      direction === "inflow" ||
      requestedTab === "ingresos" ||
      requestedTab === "conciliacion" ||
      requestedTab === "reconciliation"
    ) {
      setTab("conciliacion");
      if (movementIdParam) setFocusMovementId(movementIdParam);
    }
    deepLinkApplied.current = true;
  }, [searchParams]);
  const [focusMovementId, setFocusMovementId] = useState<string | null>(null);
  const [receiptFocusMovementId, setReceiptFocusMovementId] = useState<string | null>(null);
  const [returnToMovimientos, setReturnToMovimientos] = useState(false);
  const savedScrollY = useRef(0);
  const [tesoreriaOpen, setTesoreriaOpen] = useState(false);
  const [movements, setMovements] = useState<BankMovement[]>([]);
  const [movementLevels, setMovementLevels] = useState<Record<string, MovementReconciliationLevel>>({});
  const [movementDuplicates, setMovementDuplicates] = useState<Record<string, { canonicalMovementId: string }>>({});
  const [imports, setImports] = useState<BankStatementImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; message: string } | null>(null);
  const [movementFilters, setMovementFilters] = useState<BankMovementsListFilters>(
    DEFAULT_BANK_MOVEMENTS_LIST_FILTERS
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [movementsRes, importsRes] = await Promise.all([
        fetch("/api/copilot/bank-movements"),
        fetch("/api/copilot/bank-movements/imports"),
      ]);
      const movementsJson = (await movementsRes.json()) as ListResponse<BankMovement> & {
        levels?: Record<string, MovementReconciliationLevel>;
        duplicates?: Record<string, { canonicalMovementId: string }>;
      };
      const importsJson = (await importsRes.json()) as ListResponse<BankStatementImport>;
      if (movementsJson.ok) {
        setMovements(movementsJson.data ?? []);
        setMovementLevels(movementsJson.levels ?? {});
        setMovementDuplicates(movementsJson.duplicates ?? {});
      }
      if (importsJson.ok) setImports(importsJson.data ?? []);
    } catch {
      // Estado vacío ya cubre el caso sin datos.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const counts = useMemo(() => {
    const monthPrefix = todayYmd().slice(0, 7);
    // Los KPIs reflejan la operación (post inicio operativo): los históricos no
    // deben contarse como "pendientes de identificar" ni ensuciar las métricas.
    // Los duplicados de importación (misma operación real vista por otro
    // archivo/parser) tampoco cuentan — no son operaciones reales separadas.
    const operational = movements.filter(
      (m) => !isBankMovementHistorical(m) && !movementDuplicates[m.id]
    );
    return {
      pending: operational.filter((m) => m.status === "pending" || m.status === "needs_review")
        .length,
      inflowMonth: operational.filter(
        (m) => m.direction === "inflow" && m.movement_date.slice(0, 7) === monthPrefix
      ).length,
      outflowMonth: operational.filter(
        (m) => m.direction === "outflow" && m.movement_date.slice(0, 7) === monthPrefix
      ).length,
      reviewed: operational.filter((m) => m.status === "matched" || m.status === "ignored").length,
    };
  }, [movements, movementDuplicates]);

  const summaryCards = [
    { label: "Pendientes de identificar", value: counts.pending },
    { label: "Entradas del mes", value: counts.inflowMonth },
    { label: "Salidas del mes", value: counts.outflowMonth },
    { label: "Revisados", value: counts.reviewed },
  ];

  const filteredMovements = useMemo(
    () => filterBankMovements(movements, movementFilters, new Date(), movementDuplicates),
    [movements, movementFilters, movementDuplicates]
  );

  const [movPage, setMovPage] = useState(1);
  const [movSort, setMovSort] = useState<SortState>({ key: null, direction: "desc" });

  // Reset de página cuando cambian los filtros (evita páginas fuera de rango).
  const movFilterSig = JSON.stringify(movementFilters);
  const [appliedMovSig, setAppliedMovSig] = useState(movFilterSig);
  if (appliedMovSig !== movFilterSig) {
    setAppliedMovSig(movFilterSig);
    setMovPage(pageAfterFilterChange());
  }

  const sortedMovements = useMemo(
    () =>
      sortRows(
        filteredMovements,
        movSort.key === "date"
          ? (m) => m.movement_date
          : movSort.key === "amount"
            ? (m) => resolveImportedBankMovementAmount(m)
            : null,
        movSort.direction
      ),
    [filteredMovements, movSort]
  );
  const movPageResult = useMemo(
    () => paginate(sortedMovements, movPage, 25),
    [sortedMovements, movPage]
  );

  const submitForm = useCallback(async () => {
    if (!form) return;
    const amountNumber = Number(form.amount);
    if (!form.description.trim() || !Number.isFinite(amountNumber) || amountNumber <= 0) {
      setFeedback({ tone: "error", message: "Completá descripción y un monto mayor a 0." });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        movement_date: form.movement_date,
        description: form.description.trim(),
        amount: amountNumber,
        currency: form.currency,
        direction: form.direction,
        account_label: form.account_label.trim() || null,
        bank_reference: form.bank_reference.trim() || null,
      };
      const res = await fetch(
        form.id ? `/api/copilot/bank-movements/${form.id}` : "/api/copilot/bank-movements",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json()) as WriteResponse;
      if (!res.ok || !json.ok) {
        setFeedback({ tone: "error", message: json.error ?? "No se pudo guardar el movimiento." });
        return;
      }
      setForm(null);
      setFeedback({ tone: "ok", message: form.id ? "Movimiento actualizado." : "Movimiento creado." });
      await load();
    } finally {
      setSubmitting(false);
    }
  }, [form, load]);

  const changeStatus = useCallback(
    async (movement: BankMovement, status: BankMovementStatus) => {
      const res = await fetch(`/api/copilot/bank-movements/${movement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json()) as WriteResponse;
      if (!res.ok || !json.ok) {
        setFeedback({ tone: "error", message: json.error ?? "No se pudo cambiar el estado." });
        return;
      }
      setFeedback({ tone: "ok", message: `Marcado como ${BANK_MOVEMENT_STATUS_LABELS[status]}.` });
      await load();
    },
    [load]
  );

  const remove = useCallback(
    async (movement: BankMovement) => {
      if (!window.confirm("¿Eliminar este movimiento bancario?")) return;
      const res = await fetch(`/api/copilot/bank-movements/${movement.id}`, { method: "DELETE" });
      const json = (await res.json()) as WriteResponse;
      if (!res.ok || !json.ok) {
        setFeedback({ tone: "error", message: json.error ?? "No se pudo eliminar." });
        return;
      }
      setFeedback({ tone: "ok", message: "Movimiento eliminado." });
      await load();
    },
    [load]
  );

  const historicalBadge = (m: BankMovement) =>
    isBankMovementHistorical(m) ? (
      <StatusBadge className="ml-1.5 align-middle" tone="neutral">
        Histórico
      </StatusBadge>
    ) : null;

  const movementAmountLabel = (m: BankMovement) =>
    `${m.currency} ${numberFormatter.format(resolveImportedBankMovementAmount(m))}`;

  // FASE BANK-END-TO-END-RECONCILIATION-FLOW-UX-CORRECTION-001 —
  // Acciones de fila abren Conciliación unificada con el cluster/movimiento
  // exacto. Confirmar con recibo usa FocusedReceiptConfirmDrawer (1 movimiento),
  // nunca la bandeja general de ingresos pendientes.
  const goToReconciliationForMovement = useCallback(
    (movementId: string, _level?: MovementReconciliationLevel) => {
      const m = movements.find((row) => row.id === movementId);
      if (!m) {
        savedScrollY.current = typeof window !== "undefined" ? window.scrollY : 0;
        setReturnToMovimientos(true);
        setFocusMovementId(movementId);
        setFocusClusterKey(null);
        setTab("conciliacion");
        return;
      }
      if (m.direction !== "inflow") {
        setTesoreriaOpen(true);
        return;
      }
      const clusterKey = derivePayerClusterKey({
        movementId: m.id,
        movementDate: m.movement_date,
        amount: Number(m.amount),
        currency: m.currency,
        description: m.description,
        bankReference: m.bank_reference,
        bankName: null,
      });
      savedScrollY.current = typeof window !== "undefined" ? window.scrollY : 0;
      setReturnToMovimientos(true);
      setFocusMovementId(movementId);
      setFocusClusterKey(clusterKey);
      setTab("conciliacion");
    },
    [movements]
  );

  // Deep-link / foco: derivar cluster si falta. Sin cluster, abrir identify
  // vía ClusterReviewDrawer no aplica — dejamos el foco en Conciliación con
  // movementId; nunca montamos la bandeja general de ingresos como listado.
  useEffect(() => {
    if (!focusMovementId || tab !== "conciliacion") return;
    const m = movements.find((row) => row.id === focusMovementId);
    if (!m) return;
    if (m.direction !== "inflow") {
      setTesoreriaOpen(true);
      setFocusMovementId(null);
      return;
    }
    if (focusClusterKey) return;
    const clusterKey = derivePayerClusterKey({
      movementId: m.id,
      movementDate: m.movement_date,
      amount: Number(m.amount),
      currency: m.currency,
      description: m.description,
      bankReference: m.bank_reference,
      bankName: null,
    });
    if (clusterKey) {
      setFocusClusterKey(clusterKey);
    }
  }, [focusMovementId, focusClusterKey, movements, tab]);

  const restoreMovimientosIfNeeded = useCallback(() => {
    if (!returnToMovimientos) return;
    setReturnToMovimientos(false);
    setTab("movimientos");
    requestAnimationFrame(() => {
      if (typeof window !== "undefined") window.scrollTo(0, savedScrollY.current);
    });
  }, [returnToMovimientos]);

  const hideOrRestoreMovement = useCallback(
    async (m: BankMovement, action: "hide" | "restore") => {
      const hidden = isBankMovementUiHidden(m.metadata);
      if (action === "hide") {
        const hasAssociation =
          (m.direction === "inflow" &&
            movementLevels[m.id] &&
            movementLevels[m.id] !== "unidentified") ||
          m.status === "matched";
        const warn = hasAssociation
          ? "Este movimiento tiene una asociación existente. Ocultar no modifica la conciliación ni revoca la identificación.\n\n"
          : "";
        const reason = window.prompt(
          `${warn}Ocultar este movimiento de las vistas operativas (opcional: motivo). Dejá vacío para continuar sin motivo, o Cancelar para abortar.`
        );
        if (reason === null) return;
        try {
          const res = await fetch(`/api/copilot/bank-movements/${m.id}/hide`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason: reason.trim() || undefined }),
          });
          const json = (await res.json()) as WriteResponse;
          if (!res.ok || !json.ok) {
            setFeedback({ tone: "error", message: json.error ?? "No se pudo ocultar." });
            return;
          }
          setFeedback({ tone: "ok", message: "Movimiento oculto en el workspace." });
          void load();
        } catch {
          setFeedback({ tone: "error", message: "No se pudo ocultar." });
        }
        return;
      }
      if (!hidden) return;
      if (!window.confirm("¿Volver a mostrar este movimiento en las vistas operativas?")) return;
      try {
        const res = await fetch(`/api/copilot/bank-movements/${m.id}/restore`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const json = (await res.json()) as WriteResponse;
        if (!res.ok || !json.ok) {
          setFeedback({ tone: "error", message: json.error ?? "No se pudo restaurar." });
          return;
        }
        setFeedback({ tone: "ok", message: "Movimiento visible otra vez." });
        void load();
      } catch {
        setFeedback({ tone: "error", message: "No se pudo restaurar." });
      }
    },
    [load, movementLevels]
  );

  // FASE BANK-FULL-RECONCILIATION-UI-CORRECTION-001 — el estado visible de un
  // ingreso ya no es el legacy pending/matched/ignored: refleja el nivel real
  // (identificación + link + allocations), calculado en lote server-side.
  //
  // FASE BANK-GLOBAL-MOVEMENT-RECEIPT-INVOICE-INTEGRITY-AUDIT-AND-CORRECTION-001
  // — un duplicado de importación (misma operación real vista por otro
  // archivo/parser) nunca muestra el estado de reconciliación normal: no es
  // una operación real separada, así que ni "Sin identificar" ni ningún otro
  // nivel aplica.
  const movementStatusLabel = (m: BankMovement): string => {
    if (movementDuplicates[m.id]) return DUPLICATE_OF_IMPORT_LABEL;
    if (m.direction !== "inflow" || m.status === "ignored") return BANK_MOVEMENT_STATUS_LABELS[m.status];
    const level = movementLevels[m.id];
    return level ? MOVEMENT_LEVEL_LABEL[level] : BANK_MOVEMENT_STATUS_LABELS[m.status];
  };

  // Acción exacta por nivel (sección 2). "Ver conciliación"/"Ver detalle completo"
  // son solo lectura — no ofrecen "Reabrir": no existe todavía un flujo seguro
  // y completo de reversión del link financiero + allocations reales.
  const renderInflowLevelAction = (m: BankMovement, level: MovementReconciliationLevel) => {
    switch (level) {
      case "unidentified":
        return (
          <button type="button" onClick={() => goToReconciliationForMovement(m.id, level)} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
            Identificar cliente
          </button>
        );
      case "client_identified":
        return (
          <button type="button" onClick={() => goToReconciliationForMovement(m.id, level)} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
            Vincular recibo
          </button>
        );
      case "missing_receipt":
        return (
          <button type="button" onClick={() => goToReconciliationForMovement(m.id, level)} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
            Revisar cuando aparezca el recibo
          </button>
        );
      case "reconciled_with_receipt":
        return (
          <button type="button" onClick={() => goToReconciliationForMovement(m.id, level)} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
            Ver conciliación
          </button>
        );
      case "full_reconciliation":
        return (
          <button type="button" onClick={() => goToReconciliationForMovement(m.id, level)} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
            Ver detalle completo
          </button>
        );
      case "third_party":
      case "shared_account":
      case "requires_review":
        return (
          <button type="button" onClick={() => goToReconciliationForMovement(m.id, level)} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
            Revisar
          </button>
        );
      default:
        return null;
    }
  };

  const renderMovementActions = (m: BankMovement) => {
    const level = m.direction === "inflow" && m.status !== "ignored" ? movementLevels[m.id] : undefined;
    // FASE BANK-GLOBAL-MOVEMENT-RECEIPT-INVOICE-INTEGRITY-AUDIT-AND-CORRECTION-001
    // — un duplicado nunca ofrece identificar/vincular/ignorar/reabrir: no es
    // una operación real separada. Solo queda editar (para corregirlo a mano)
    // y eliminar; la evidencia del archivo que lo generó se conserva en
    // metadata.additional_sources de la fila canónica, nunca se borra sola.
    if (movementDuplicates[m.id]) {
      return (
        <div className="flex flex-wrap justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setForm(formFromMovement(m))}
            className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
            aria-label="Editar movimiento"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void remove(m)}
            className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
            aria-label="Eliminar movimiento"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      );
    }
    return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <button
        type="button"
        onClick={() => setForm(formFromMovement(m))}
        className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
        aria-label="Editar movimiento"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </button>
      {m.direction === "inflow" && level ? (
        renderInflowLevelAction(m, level)
      ) : m.status !== "matched" ? (
        m.direction === "inflow" ? (
          <button
            type="button"
            onClick={() => goToReconciliationForMovement(m.id, level)}
            className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
          >
            Revisar conciliación
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setTesoreriaOpen(true)}
            className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
          >
            Vincular con pago programado
          </button>
        )
      ) : (
        <button
          type="button"
          onClick={() => void changeStatus(m, "pending")}
          className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
        >
          Reabrir
        </button>
      )}
      {m.status !== "ignored" ? (
        <button
          type="button"
          onClick={() => void changeStatus(m, "ignored")}
          className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
        >
          Ignorar
        </button>
      ) : null}
      {canWriteBank ? (
        isBankMovementUiHidden(m.metadata) ? (
          <button
            type="button"
            onClick={() => void hideOrRestoreMovement(m, "restore")}
            className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
            aria-label="Volver a mostrar movimiento"
          >
            <Eye className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            Volver a mostrar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void hideOrRestoreMovement(m, "hide")}
            className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
            aria-label="Ocultar movimiento"
          >
            <EyeOff className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            Ocultar
          </button>
        )
      ) : null}
      <button
        type="button"
        onClick={() => void remove(m)}
        className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
        aria-label="Eliminar movimiento"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
    );
  };

  const movementColumns: CopilotResponsiveTableColumn<BankMovement>[] = [
    {
      key: "date",
      header: "Fecha",
      sortKey: "date",
      cellClassName: "whitespace-nowrap align-top",
      render: (m) => (
        <span>
          {formatDate(m.movement_date)}
          {historicalBadge(m)}
        </span>
      ),
    },
    {
      key: "desc",
      header: "Descripción",
      cellClassName: "align-top",
      render: (m) => (
        <div>
          <span>{m.description}</span>
          {m.bank_reference ? (
            <span className={`block ${copilotCaptionClass}`}>Ref: {m.bank_reference}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: "source",
      header: "Fuente",
      className: "hidden sm:table-cell",
      cellClassName: "hidden align-top sm:table-cell",
      render: (m) => m.account_label ?? m.bank_name,
    },
    {
      key: "in",
      header: "Entrada",
      sortKey: "amount",
      className: "text-right",
      cellClassName: "whitespace-nowrap text-right align-top tabular-nums",
      render: (m) => (m.direction === "inflow" ? movementAmountLabel(m) : "—"),
    },
    {
      key: "out",
      header: "Salida",
      sortKey: "amount",
      className: "text-right",
      cellClassName: "whitespace-nowrap text-right align-top tabular-nums",
      render: (m) => (m.direction === "outflow" ? movementAmountLabel(m) : "—"),
    },
    {
      key: "status",
      header: "Estado",
      cellClassName: "whitespace-nowrap align-top",
      render: (m) => (
        <span>
          {movementStatusLabel(m)}
          {isBankMovementUiHidden(m.metadata) ? (
            <StatusBadge className="ml-1.5 align-middle" tone="neutral">
              Oculto
            </StatusBadge>
          ) : null}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      className: "text-right",
      cellClassName: "text-right align-top",
      render: (m) => renderMovementActions(m),
    },
  ];

  const renderMovementMobileCard = (m: BankMovement) => (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-[var(--copilot-ink)]">
          {formatDate(m.movement_date)}
          {historicalBadge(m)}
        </span>
        <span
          className={`whitespace-nowrap text-sm font-semibold tabular-nums ${
            m.direction === "inflow"
              ? "text-[var(--copilot-success-text-strong)]"
              : "text-[var(--copilot-danger-text-strong)]"
          }`}
        >
          {m.direction === "inflow" ? "+" : "−"} {movementAmountLabel(m)}
        </span>
      </div>
      <p className="text-sm text-[var(--copilot-ink)]">{m.description}</p>
      {m.bank_reference ? <p className={copilotCaptionClass}>Ref: {m.bank_reference}</p> : null}
      <p className={copilotCaptionClass}>{movementStatusLabel(m)}</p>
      <div className="pt-1">{renderMovementActions(m)}</div>
    </div>
  );

  return (
    <div className={COPILOT_PAGE_GAP}>
      <CopilotPageHeader
        title="Movimientos bancarios"
        description="Movimientos bancarios para revisar y conciliar manualmente."
      />

      {feedback ? (
        <div
          className={`rounded-xl border px-3 py-2 text-xs ${
            feedback.tone === "ok"
              ? "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]"
              : "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      {tab !== "historial" ? (
        // Sección 13 — Historial muestra solo hechos terminados; estos KPIs
        // ("Pendientes de identificar", "Entradas/Salidas del mes") son estado
        // operativo actual, no un hecho histórico, así que no se muestran ahí.
        <div className={`grid grid-cols-2 lg:grid-cols-4 ${COPILOT_GRID_GAP}`}>
          {summaryCards.map((card) => (
            <div key={card.label} className={copilotCardStandardClass}>
              <p className={copilotMetricLabelClass}>{card.label}</p>
              <p className={copilotMetricValueClass}>{loading ? "…" : card.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <nav
        className="sticky top-0 z-[70] flex flex-wrap gap-2 rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-1.5 shadow-sm backdrop-blur"
        aria-label="Secciones de movimientos bancarios"
        data-bank-tabs
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={copilotButtonClassName({
              variant: tab === item.id ? "primary" : "ghost",
              size: "sm",
              className:
                tab === item.id
                  ? ""
                  : item.primary
                    ? "border-[var(--copilot-accent)] text-[var(--copilot-accent)] font-semibold"
                    : "!border-transparent",
            })}
          >
            {item.primary ? <Sparkles className="mr-1 inline h-3.5 w-3.5" aria-hidden /> : null}
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "importar" ? (
        <BankMovementsImportPanel
          onImportComplete={load}
          onGoToMovements={() => setTab("movimientos")}
        />
      ) : null}

      {tab === "movimientos" ? (
        <section className={copilotCardStandardClass}>
          <div className="flex items-center justify-between gap-3">
            <h2 className={copilotSectionTitleClass}>Movimientos del banco</h2>
            <button
              type="button"
              onClick={() => setForm(form ? null : emptyForm())}
              className={copilotButtonClassName({ variant: "primary", size: "sm" })}
            >
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
              Agregar movimiento
            </button>
          </div>

          {form ? (
            <MovementForm
              form={form}
              submitting={submitting}
              onChange={setForm}
              onCancel={() => setForm(null)}
              onSubmit={submitForm}
            />
          ) : null}

          <div className="mt-4">
            <BankMovementsFiltersBar
              mode="movements"
              filters={movementFilters}
              onChange={(next) => setMovementFilters(next as BankMovementsListFilters)}
              onClear={() => setMovementFilters(DEFAULT_BANK_MOVEMENTS_LIST_FILTERS)}
              showingCount={filteredMovements.length}
              totalCount={movements.length}
              countLabel="movimientos"
              canManageVisibility={canWriteBank}
            />
          </div>

          {movements.length === 0 ? (
            <div className="mt-4">
              <DsEmptyState
                variant="compact"
                title={loading ? "Cargando movimientos" : "Todavía no hay movimientos bancarios"}
                description={
                  loading
                    ? "Estamos preparando el listado del banco."
                    : "En esta primera versión podés cargarlos manualmente. La importación automática queda para una próxima etapa."
                }
              />
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="mt-4">
              <DsEmptyState
                variant="compact"
                title="No hay movimientos con estos filtros"
                description="Probá limpiar filtros o revisar otra moneda, estado o dirección."
              />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <CopilotResponsiveTable<BankMovement>
                rows={movPageResult.pageRows}
                columns={movementColumns}
                getRowKey={(m) => m.id}
                minWidth="820px"
                ariaLabel="Movimientos bancarios"
                mobileCard={renderMovementMobileCard}
                sort={{
                  state: movSort,
                  onSort: (key) => setMovSort((prev) => nextSortState(prev, key)),
                }}
              />
              <TablePagination
                page={movPageResult.safePage}
                totalPages={movPageResult.totalPages}
                from={movPageResult.from}
                to={movPageResult.to}
                total={movPageResult.total}
                itemLabel="movimientos"
                onPageChange={setMovPage}
              />
            </div>
          )}
        </section>
      ) : null}

      {tab === "movimientos" ? (
        <details
          open={tesoreriaOpen}
          onToggle={(e) => setTesoreriaOpen(e.currentTarget.open)}
          className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-1.5"
        >
          <summary className="cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold text-[var(--copilot-muted)]">
            Pagos programados de Tesorería (no es conciliación de clientes)
          </summary>
          <div className="px-1 pb-1 pt-2">
            <BankMovementsReconciliationPanel onMovementUpdated={load} />
          </div>
        </details>
      ) : null}

      {tab === "conciliacion" ? (
        <div className="space-y-3">
          <UnifiedReconciliationWorkspace
            onChanged={load}
            onOpenIdentify={(clusterKey) => setIdentifyClusterKey(clusterKey)}
            onOpenReceipt={(movementId) => setReceiptFocusMovementId(movementId)}
            initialClusterKey={focusClusterKey}
            initialMovementId={focusMovementId}
            onInitialFocusConsumed={() => {
              setFocusClusterKey(null);
              setFocusMovementId(null);
            }}
            onCaseClosed={restoreMovimientosIfNeeded}
          />

          {identifyClusterKey ? (
            <ClusterReviewDrawer
              clusterKey={identifyClusterKey}
              onClose={() => setIdentifyClusterKey(null)}
              onConfirmed={() => {
                setIdentifyClusterKey(null);
                load();
              }}
            />
          ) : null}

          {receiptFocusMovementId ? (
            <FocusedReceiptConfirmDrawer
              movementId={receiptFocusMovementId}
              onClose={() => setReceiptFocusMovementId(null)}
              onChanged={load}
            />
          ) : null}
        </div>
      ) : null}

      {tab === "historial" ? <BankHistoryPanel imports={imports} loading={loading} /> : null}
    </div>
  );
}

function MovementForm({
  form,
  submitting,
  onChange,
  onCancel,
  onSubmit,
}: {
  form: FormState;
  submitting: boolean;
  onChange: (f: FormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="mt-4 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--copilot-text)]">
          {form.id ? "Editar movimiento" : "Nuevo movimiento"}
        </h3>
        <button type="button" onClick={onCancel} aria-label="Cerrar" className="text-[var(--copilot-muted)]">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Fecha</span>
          <input
            type="date"
            value={form.movement_date}
            onChange={(e) => onChange({ ...form, movement_date: e.target.value })}
            className={copilotInputClass}
            required
          />
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Tipo</span>
          <select
            value={form.direction}
            onChange={(e) => onChange({ ...form, direction: e.target.value as BankMovementDirection })}
            className={copilotInputClass}
          >
            <option value="inflow">{BANK_MOVEMENT_DIRECTION_LABELS.inflow}</option>
            <option value="outflow">{BANK_MOVEMENT_DIRECTION_LABELS.outflow}</option>
          </select>
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="text-[var(--copilot-muted)]">Descripción</span>
          <input
            type="text"
            value={form.description}
            onChange={(e) => onChange({ ...form, description: e.target.value })}
            className={copilotInputClass}
            maxLength={500}
            required
          />
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Monto</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.amount}
            onChange={(e) => onChange({ ...form, amount: e.target.value })}
            className={copilotInputClass}
            required
          />
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Moneda</span>
          <select
            value={form.currency}
            onChange={(e) => onChange({ ...form, currency: e.target.value as "UYU" | "USD" })}
            className={copilotInputClass}
          >
            <option value="UYU">UYU</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Cuenta / fuente</span>
          <input
            type="text"
            value={form.account_label}
            onChange={(e) => onChange({ ...form, account_label: e.target.value })}
            className={copilotInputClass}
          />
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Referencia banco</span>
          <input
            type="text"
            value={form.bank_reference}
            onChange={(e) => onChange({ ...form, bank_reference: e.target.value })}
            className={copilotInputClass}
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className={copilotButtonClassName({ variant: "primary", size: "sm" })}
        >
          {submitting ? "Guardando…" : form.id ? "Guardar cambios" : "Crear movimiento"}
        </button>
      </div>
    </form>
  );
}
