"use client";

import { useEffect, useState } from "react";

import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import { buildSellerOptions } from "@/lib/sales/seller-ux-helpers";

const SELLER_HINT = "Persona que realizó esta venta.";
const UNASSIGNED_HINT = "Todavía no se indicó quién realizó esta venta.";

/**
 * FASE SALES-DOCUMENT-SELLER-INLINE-UX-AND-IDENTITY-FIX-001 — selector
 * compacto de VENDEDOR por documento. Reusado en Ventas → Detalle y
 * Cliente 360 → Ventas.
 *
 * Actualización OPTIMISTA: la fila cambia al instante al elegir un vendedor
 * (antes de que responda la API); si la request falla, revierte solo este
 * selector al valor anterior. `onAssigned` recibe el nombre ya resuelto
 * (confirmado por el servidor cuando está disponible) para que el padre
 * pueda parchear su estado local sin volver a pedir la lista de personas.
 *
 * El estado local (`localSellerId`/`localSellerName`) es la fuente de verdad
 * mientras el componente vive; solo se resetea desde las props cuando cambia
 * `documentId` (la fila pasó a representar un documento distinto), nunca por
 * un simple re-render del padre — así una asignación exitosa no puede
 * "revertirse sola" por una actualización no relacionada más arriba.
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
  onAssigned?: (sellerId: string | null, sellerName: string | null) => void;
}) {
  const { canWrite, modulePermissions } = useCopilotPermissions();
  const level = modulePermissions["ventas"];
  const canAssign = canWrite && level !== "none" && level !== "read";

  const [localSellerId, setLocalSellerId] = useState(sellerId);
  const [localSellerName, setLocalSellerName] = useState(sellerName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // Solo resetea el estado optimista cuando esta fila pasa a representar OTRO
  // documento (identidad distinta) — nunca por un re-render no relacionado.
  useEffect(() => {
    setLocalSellerId(sellerId);
    setLocalSellerName(sellerName);
    setError(null);
    setJustSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

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

  const options = buildSellerOptions(localSellerId, localSellerName, people);

  const assign = async (nextId: string | null) => {
    if (nextId === (localSellerId ?? null)) return;
    const previousId = localSellerId;
    const previousName = localSellerName;
    const nextName = nextId ? people.find((p) => p.id === nextId)?.displayName ?? null : null;

    // Optimista: la fila cambia YA, antes de que responda la API.
    setLocalSellerId(nextId);
    setLocalSellerName(nextName);
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
        // Revierte SOLO esta fila; el resto de la tabla sigue intacta.
        setLocalSellerId(previousId);
        setLocalSellerName(previousName);
        setError(json?.message ?? "No se pudo actualizar el vendedor.");
        return;
      }
      const confirmedName = (json.data?.sellerName as string | null | undefined) ?? nextName;
      setLocalSellerName(confirmedName);
      onAssigned?.(nextId, confirmedName);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1500);
    } catch {
      setLocalSellerId(previousId);
      setLocalSellerName(previousName);
      setError("No se pudo actualizar el vendedor.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <select
          value={localSellerId ?? ""}
          disabled={saving}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => void assign(e.target.value || null)}
          aria-label="Vendedor de la operación"
          title={localSellerName ? SELLER_HINT : UNASSIGNED_HINT}
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
