"use client";

import { useState } from "react";

import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";

/**
 * FASE SALES-DOCUMENT-SELLER-CORRECTION-001 — selector compacto de VENDEDOR
 * por documento. Reusado en Ventas → Detalle y Cliente 360 → Ventas.
 *
 * Nunca se muestra para notas de crédito (no admiten asignación). Deshabilitado
 * (solo texto) para usuarios sin permiso de escritura en Ventas.
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

  if (kind === "credit_note") {
    return <span className="text-xs text-[var(--copilot-ink-muted)]">—</span>;
  }

  if (!canAssign) {
    return (
      <span className="text-xs text-[var(--copilot-ink-muted)]">
        {sellerName ?? "Sin vendedor identificado"}
      </span>
    );
  }

  const assign = async (nextId: string | null) => {
    if (nextId === (sellerId ?? null)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/copilot/sales/documents/${encodeURIComponent(documentId)}/seller`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId: nextId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json?.message ?? "No se pudo actualizar el vendedor.");
        return;
      }
      onAssigned?.(nextId);
    } catch {
      setError("No se pudo actualizar el vendedor.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-0.5">
      <select
        value={sellerId ?? ""}
        disabled={saving}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => void assign(e.target.value || null)}
        aria-label="Vendedor de la operación"
        className="h-8 max-w-[160px] rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2 text-xs text-[var(--copilot-ink)] disabled:opacity-40"
      >
        <option value="">Sin asignar</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.displayName}
          </option>
        ))}
      </select>
      {error ? <span className="text-[10px] text-[var(--copilot-danger-text-strong)]">{error}</span> : null}
    </div>
  );
}
