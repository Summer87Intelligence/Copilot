"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus, CheckCircle2, Ban } from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { SkeletonMetricGrid, SkeletonText } from "@/components/copilot/ui/skeleton";
import { StatusBadge } from "@/components/copilot/ui/status-badge";
import { EmptyState } from "@/components/copilot/ui/empty-state";
import {
  COPILOT_PAGE_GAP,
  copilotCardStandardClass,
  copilotSectionTitleClass,
  copilotCaptionClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { VentasClasificacionTab } from "@/components/copilot/ventas/ventas-clasificacion-tab";
import type { SalesOverview } from "@/lib/sales/sales-api";
import type { SalespersonRow } from "@/lib/sales/sales-salesperson-repository";
import { SALESPERSON_START_DATE } from "@/lib/sales/canonical/types";

/** Opciones iniciales sugeridas (§ FASE 9B). No se siembran solas: un clic las crea. */
const SEED_SALESPERSON_NAMES = ["Daniel", "Juanma", "Camila"] as const;

export function VentasConfiguracionClient() {
  const [overview, setOverview] = useState<SalesOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const res = await fetch(
        "/api/copilot/sales/overview?preset=this_month&comparison=same_elapsed_days",
        { cache: "no-store" }
      );
      const json = await res.json();
      if (res.ok && json.ok) setOverview(json.data as SalesOverview);
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  return (
    <div className={COPILOT_PAGE_GAP}>
      <CopilotPageHeader
        eyebrow="Ventas · Configuración"
        title="Configuración de ventas"
        description="Catálogo de productos, clasificación de conceptos y equipo de ventas (ejecutivos y vendedores). Uso administrativo."
        right={
          <Link
            href="/copilot/ventas"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--copilot-border-strong)] px-3 text-sm font-semibold text-[var(--copilot-ink)] hover:bg-[var(--copilot-hover-bg)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Volver a Ventas
          </Link>
        }
      />

      <SalespersonsManager />

      <section className="space-y-2">
        <h2 className={`${copilotSectionTitleClass} px-1`}>Catálogo y clasificación</h2>
        {overviewLoading && !overview ? (
          <SkeletonMetricGrid count={3} />
        ) : (
          <VentasClasificacionTab overview={overview} onChanged={loadOverview} />
        )}
      </section>
    </div>
  );
}

function SalespersonsManager() {
  const [people, setPeople] = useState<SalespersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationPending, setMigrationPending] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "positive" | "danger"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/copilot/sales/salespersons", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.ok) {
        setPeople(json.data as SalespersonRow[]);
        setMigrationPending(Boolean(json.meta?.migrationPending));
      } else {
        setMessage({ tone: "danger", text: json?.message ?? "No pudimos cargar el equipo de ventas." });
      }
    } catch {
      setMessage({ tone: "danger", text: "No pudimos cargar el equipo de ventas." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(
    async (displayName: string) => {
      const name = displayName.trim();
      if (!name) return;
      setBusy(true);
      setMessage(null);
      try {
        const res = await fetch("/api/copilot/sales/salespersons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: name }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setMessage({ tone: "danger", text: json?.message ?? "No se pudo agregar la persona." });
          return;
        }
        setMessage({ tone: "positive", text: `“${name}” agregado al equipo.` });
        setNewName("");
        await load();
      } catch {
        setMessage({ tone: "danger", text: "No se pudo agregar la persona." });
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  const existingLower = new Set(people.map((p) => p.displayName.trim().toLowerCase()));
  const missingSeeds = SEED_SALESPERSON_NAMES.filter((n) => !existingLower.has(n.toLowerCase()));

  return (
    <section className={copilotCardStandardClass}>
      <h2 className={`${copilotSectionTitleClass} flex items-center gap-2`}>
        <UserPlus className="h-4 w-4" aria-hidden />
        Equipo de ventas
      </h2>
      <p className={`${copilotCaptionClass} mt-1`}>
        Estas personas se pueden asignar como ejecutivo de un cliente o como vendedor de una operación puntual, desde el{" "}
        {SALESPERSON_START_DATE}. Las ventas anteriores permanecen “Sin asignar”: no hay backfill ni adivinación.
      </p>

      {migrationPending ? (
        <p className="mt-2 text-xs font-medium text-[var(--copilot-warning-text-strong)]">
          La tabla del equipo de ventas todavía no está disponible en este entorno. Aplicá la migración pendiente para
          habilitarla.
        </p>
      ) : null}

      {message ? (
        <div className="mt-2 flex items-center gap-2 text-sm" role="status" aria-live="polite">
          {message.tone === "positive" ? (
            <CheckCircle2 className="h-4 w-4 text-[var(--copilot-success-text-strong)]" aria-hidden />
          ) : (
            <Ban className="h-4 w-4 text-[var(--copilot-danger-text-strong)]" aria-hidden />
          )}
          <span>{message.text}</span>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nombre de la persona…"
          aria-label="Nombre de la nueva persona"
          disabled={busy || migrationPending}
          className="h-9 min-w-[220px] flex-1 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)] disabled:opacity-40"
        />
        <button
          type="button"
          onClick={() => create(newName)}
          disabled={busy || migrationPending || !newName.trim()}
          className="h-9 rounded-lg bg-[var(--copilot-accent)] px-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          Agregar
        </button>
      </div>

      {missingSeeds.length > 0 && !migrationPending ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={copilotCaptionClass}>Agregar rápido:</span>
          {missingSeeds.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => create(n)}
              disabled={busy}
              className="h-8 rounded-lg border border-[var(--copilot-border-strong)] px-2.5 text-xs font-semibold text-[var(--copilot-ink)] hover:bg-[var(--copilot-hover-bg)] disabled:opacity-40"
            >
              + {n}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-3">
        {loading ? (
          <SkeletonText lines={2} />
        ) : people.length === 0 ? (
          <EmptyState icon={<UserPlus className="h-6 w-6" />} title="Todavía no hay personas cargadas en el equipo de ventas." variant="compact" />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {people.map((p) => (
              <li key={p.id}>
                <StatusBadge tone={p.active ? "positive" : "neutral"}>{p.displayName}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
