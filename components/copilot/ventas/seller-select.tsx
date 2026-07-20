"use client";

import { useState } from "react";

import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import { buildSellerOptions } from "@/lib/sales/seller-ux-helpers";

const SELLER_HINT = "Persona que realizó esta venta.";
const UNASSIGNED_HINT = "Todavía no se indicó quién realizó esta venta.";

/**
 * FASE SALES-DOCUMENT-SELLER-CORRECTION-001 — selector compacto de VENDEDOR
 * por documento. Reusado en Ventas → Detalle y Cliente 360 → Ventas.
 *
 * Nunca se muestra para notas de crédito (no admiten asignación). Deshabilitado
 * (solo texto) para usuarios sin permiso de escritura en Ventas. El vendedor
 * activo hoy asignado aparece en la lista aunque haya sido desactivado después
 * (histórico), pero no queda seleccionable para asignaciones nuevas.
 */
export function SellerSelect({
  documentId,
  sellerId,
  sellerName,
  kind,
  people,
  onAssigned,
}: {
  documentId: string;
  sellerId: string | null;
  sellerName: string | null;
  kind: "sale" | "credit_note";
  people: { id: string; displayName: string }[];
  onAssigned?: (sellerId: string | null) => void;
}) {
  const { canWrite, modulePermissions } = useCopilotPermissions();
  const level = modulePermissions["ventas"];
  const canAssign = canWrite && level !== "none" && level !== "read";

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  if (kind === "credit_note") {
    return <span className="text-xs text-[var(--copilot-ink-muted)]">—</span>;
  }

  if (!canAssign) {
    return (
      <span
        className="text-xs text-[var(--copilot-ink-muted)]"
        title={sellerName ? SELLER_HINT : UNASSIGNED_HINT}
      >
        {sellerName ?? "Sin vendedor identificado"}
      </span>
    );
  }

  const assign = async (nextId: string | null) => {
    if (nextId === (sellerId ?? null)) return;
    setSaving(true);
    setError(null);
    setJustSaved(false);
    try {
      const res = await fetch(`/api/copilot/sales/documents/${encodeURIComponent(documentId)}/seller`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId: nextId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        // El <select> sigue controlado por `sellerId` (prop del padre, sin
        // tocar): al no llamar onAssigned, el valor anterior se restaura solo.
        setError(json?.message ?? "No se pudo actualizar el vendedor.");
        return;
      }
      onAssigned?.(nextId);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1500);
    } catch {
      setError("No se pudo actualizar el vendedor.");
    } finally {
      setSaving(false);
    }
  };

  const options = buildSellerOptions(sellerId, sellerName, people);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <select
          value={sellerId ?? ""}
          disabled={saving}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => void assign(e.target.value || null)}
          aria-label="Vendedor de la operación"
          title={sellerName ? SELLER_HINT : UNASSIGNED_HINT}
          className="h-8 max-w-[160px] rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2 text-xs text-[var(--copilot-ink)] disabled:opacity-40"
        >
          <option value="" title={UNASSIGNED_HINT}>
            Sin asignar
          </option>
          {options.map((o) => (
            <option
              key={o.id}
              value={o.id}
              disabled={o.disabled}
              title={o.disabled ? "Vendedor inactivo: se conserva como historial, no se puede volver a asignar." : SELLER_HINT}
            >
              {o.displayName}
            </option>
          ))}
        </select>
        {saving ? (
          <span className="text-[10px] text-[var(--copilot-ink-muted)]" role="status" aria-live="polite">
            Guardando…
          </span>
        ) : justSaved ? (
          <span className="text-[10px] text-[var(--copilot-success-text-strong)]" role="status" aria-live="polite">
            ✓ Guardado
          </span>
        ) : null}
      </div>
      {error ? <span className="text-[10px] text-[var(--copilot-danger-text-strong)]">{error}</span> : null}
    </div>
  );
}
