"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileUp, Landmark } from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  COPILOT_GRID_GAP,
  COPILOT_PAGE_GAP,
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotMetricLabelClass,
  copilotMetricValueClass,
  copilotSectionTitleClass,
} from "@/components/copilot/ui/copilot-visual-system";
import {
  BANK_MOVEMENT_DIRECTION_LABELS,
  BANK_MOVEMENT_STATUS_LABELS,
  type BankMovement,
  type BankStatementImport,
} from "@/lib/bank-movements/bank-movements-types";

type BankTab = "importar" | "movimientos" | "conciliacion" | "historial";

const TABS: Array<{ id: BankTab; label: string }> = [
  { id: "importar", label: "Importar" },
  { id: "movimientos", label: "Movimientos" },
  { id: "conciliacion", label: "Conciliación" },
  { id: "historial", label: "Historial" },
];

type ListResponse<T> = {
  ok: boolean;
  data?: T[];
  meta?: { total?: number; migration_pending?: boolean };
  message?: string;
};

const dateFormatter = new Intl.DateTimeFormat("es-UY", { dateStyle: "medium" });

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

function formatAmount(amount: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2 }).format(amount)}`;
}

export function BankMovementsPageClient() {
  const [tab, setTab] = useState<BankTab>("importar");
  const [movements, setMovements] = useState<BankMovement[]>([]);
  const [imports, setImports] = useState<BankStatementImport[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [movementsRes, importsRes] = await Promise.all([
        fetch("/api/copilot/bank-movements"),
        fetch("/api/copilot/bank-movements/imports"),
      ]);
      const movementsJson = (await movementsRes.json()) as ListResponse<BankMovement>;
      const importsJson = (await importsRes.json()) as ListResponse<BankStatementImport>;
      if (movementsJson.ok) setMovements(movementsJson.data ?? []);
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

  const counts = useMemo(() => {
    const pending = movements.filter(
      (m) => m.status === "pending" || m.status === "needs_review"
    ).length;
    const suggested = movements.filter((m) => m.status === "suggested").length;
    const matched = movements.filter((m) => m.status === "matched").length;
    const differences = movements.filter((m) => m.status === "needs_review").length;
    return { pending, suggested, matched, differences };
  }, [movements]);

  const summaryCards = [
    { label: "Pendientes de identificar", value: counts.pending },
    { label: "Coincidencias sugeridas", value: counts.suggested },
    { label: "Conciliados", value: counts.matched },
    { label: "Diferencias", value: counts.differences },
  ];

  return (
    <div className={COPILOT_PAGE_GAP}>
      <CopilotPageHeader
        title="Movimientos bancarios"
        description="Importá extractos Santander y conciliá ingresos, egresos y cobros Zeta."
      />

      <div className={`grid grid-cols-2 lg:grid-cols-4 ${COPILOT_GRID_GAP}`}>
        {summaryCards.map((card) => (
          <div key={card.label} className={copilotCardStandardClass}>
            <p className={copilotMetricLabelClass}>{card.label}</p>
            <p className={copilotMetricValueClass}>{loading ? "…" : card.value}</p>
          </div>
        ))}
      </div>

      <nav
        className="flex flex-wrap gap-2 rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-1.5 shadow-sm"
        aria-label="Secciones de movimientos bancarios"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={copilotButtonClassName({
              variant: tab === item.id ? "primary" : "ghost",
              size: "sm",
              className: tab === item.id ? "" : "!border-transparent",
            })}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "importar" ? (
        <section className={copilotCardStandardClass}>
          <h2 className={copilotSectionTitleClass}>Importar extracto</h2>
          <p className={`${copilotCaptionClass} mt-1`}>
            Subí un PDF, CSV o Excel de Santander. En V1 el PDF debe tener texto extraíble; no
            usamos OCR.
          </p>
          <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--copilot-border)] px-6 py-10 text-center">
            <FileUp className="h-8 w-8 text-[var(--copilot-muted)]" aria-hidden />
            <p className="text-sm font-medium text-[var(--copilot-text)]">
              Banco: Santander (por defecto)
            </p>
            <p className={copilotCaptionClass}>
              Todavía no importaste movimientos. Subí un extracto para empezar a conciliar.
            </p>
            <button
              type="button"
              disabled
              className={copilotButtonClassName({ variant: "primary", size: "sm" })}
              title="Disponible en la siguiente fase"
            >
              Subir archivo (próximamente)
            </button>
            <p className={copilotCaptionClass}>
              Importar movimientos no modifica la caja: primero se sugieren coincidencias y vos
              confirmás.
            </p>
          </div>
        </section>
      ) : null}

      {tab === "movimientos" ? (
        <section className={copilotCardStandardClass}>
          <h2 className={copilotSectionTitleClass}>Movimientos del banco</h2>
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Filtros">
            {["Todos", "Ingresos", "Egresos", "UYU", "USD"].map((filterLabel) => (
              <span
                key={filterLabel}
                className="rounded-full border border-[var(--copilot-border)] px-3 py-1 text-xs text-[var(--copilot-muted)]"
              >
                {filterLabel}
              </span>
            ))}
          </div>
          {movements.length === 0 ? (
            <p className={`${copilotCaptionClass} mt-4`}>
              {loading
                ? "Cargando movimientos…"
                : "Todavía no importaste movimientos. Subí un extracto para empezar a conciliar."}
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-[var(--copilot-muted)]">
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Descripción</th>
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 pr-3">Importe</th>
                    <th className="py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr key={movement.id} className="border-t border-[var(--copilot-border)]">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {formatDate(movement.movement_date)}
                      </td>
                      <td className="py-2 pr-3">{movement.description}</td>
                      <td className="py-2 pr-3">
                        {BANK_MOVEMENT_DIRECTION_LABELS[movement.direction]}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {formatAmount(movement.amount, movement.currency)}
                      </td>
                      <td className="py-2">{BANK_MOVEMENT_STATUS_LABELS[movement.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "conciliacion" ? (
        <div className={`grid gap-3 lg:grid-cols-2`}>
          {[
            "Ingresos banco sin identificar",
            "Egresos banco sin identificar",
            "Cobros Zeta no vistos en banco",
            "Pagos Copilot no vistos en banco",
          ].map((groupTitle) => (
            <section key={groupTitle} className={copilotCardStandardClass}>
              <h2 className={copilotSectionTitleClass}>{groupTitle}</h2>
              <p className={`${copilotCaptionClass} mt-2`}>
                Sin elementos por ahora. Los grupos se completan al importar extractos y generar
                sugerencias de conciliación.
              </p>
            </section>
          ))}
        </div>
      ) : null}

      {tab === "historial" ? (
        <section className={copilotCardStandardClass}>
          <h2 className={copilotSectionTitleClass}>Conciliaciones realizadas</h2>
          {imports.length === 0 ? (
            <p className={`${copilotCaptionClass} mt-2`}>
              {loading
                ? "Cargando historial…"
                : "Todavía no hay conciliaciones realizadas. Acá vas a ver cada extracto importado y qué se concilió."}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {imports.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--copilot-border)] px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Landmark className="h-4 w-4 shrink-0 text-[var(--copilot-muted)]" aria-hidden />
                    <span className="truncate">
                      {item.file_name ?? item.bank_name} · {item.row_count} movimientos
                    </span>
                  </span>
                  <span className={`${copilotCaptionClass} whitespace-nowrap`}>
                    {formatDate(item.imported_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
