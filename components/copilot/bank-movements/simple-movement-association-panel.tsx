"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  BankDrawerBody,
  BankDrawerFooter,
  BankDrawerHeader,
  BankDrawerShell,
} from "@/components/copilot/bank-movements/bank-drawer-shell";
import { BankClientNameLink } from "@/components/copilot/bank-movements/bank-client-name-link";
import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  copilotCaptionClass,
  copilotInputClass,
  copilotMetricLabelClass,
} from "@/components/copilot/ui/copilot-visual-system";
import {
  BANK_MOVEMENT_DESCRIPTION_CLASS,
  getBankMovementDisplayDescription,
} from "@/lib/bank-movements/bank-movement-display";
import { buildBankReturnToQuery, buildClientBankingHref } from "@/lib/bank-movements/client-banking-navigation";
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";
import { maskAccountOrReference } from "@/lib/bank/canonical/mask-account-or-reference";

/**
 * FASE BANK-SIMPLE-RESPONSIBILITY-AND-DRAWER-DETAIL-001 — panel único de
 * asociación, solo desde Conciliación. Muestra descripción Santander completa
 * (raw) y detalle del movimiento sin truncar.
 */

type MovementDTO = BankMovement;

type AssociationDTO = {
  id: string | null;
  clientCompanyId: string;
  clientName: string | null;
  status: string | null;
  confirmedAt: string | null;
  source: "identification" | "financial_link" | null;
} | null;

type ClientOption = { id: string; name: string };

function metaString(meta: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function metaNumber(meta: Record<string, unknown> | null | undefined, key: string): number | null {
  const v = meta?.[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (value == null || !String(value).trim()) return null;
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 text-sm">
      <dt className="text-[var(--copilot-muted)]">{label}</dt>
      <dd className={`text-[var(--copilot-text)] ${BANK_MOVEMENT_DESCRIPTION_CLASS}`}>{value}</dd>
    </div>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(url, init);
    const json = (await res.json()) as { ok?: boolean; data?: T; error?: string };
    return { ok: Boolean(res.ok && json.ok), data: json.data, error: json.error };
  } catch {
    return { ok: false, error: "NETWORK_ERROR" };
  }
}

type LoadState = "loading" | "ready" | "error";

export function SimpleMovementAssociationPanel({
  movementId,
  returnToSearch,
  onClose,
  onChanged,
}: {
  movementId: string;
  returnToSearch?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [movement, setMovement] = useState<MovementDTO | null>(null);
  const [association, setAssociation] = useState<AssociationDTO>(null);
  const [error, setError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState("");
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [pickedClientId, setPickedClientId] = useState<string | null>(null);
  const [pickedClientName, setPickedClientName] = useState<string>("");
  const [reassignReason, setReassignReason] = useState("");

  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadedFor = useRef<string | null>(null);

  const load = useCallback(async (id: string) => {
    setLoadState("loading");
    setError(null);
    const res = await fetchJson<{ movement: MovementDTO; identification: AssociationDTO }>(
      `/api/copilot/bank-reconciliation/movements/${id}/association`
    );
    if (loadedFor.current !== id) return;
    if (!res.ok || !res.data) {
      setError(res.error ?? "No se pudo cargar el movimiento.");
      setLoadState("error");
      return;
    }
    setMovement(res.data.movement);
    setAssociation(res.data.identification);
    setLoadState("ready");
  }, []);

  useEffect(() => {
    loadedFor.current = movementId;
    // Fetch-on-open: el estado se sincroniza desde una fuente externa (API).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(movementId);
    return () => {
      loadedFor.current = null;
    };
  }, [movementId, load]);

  useEffect(() => {
    if (!pickerOpen) return;
    const t = setTimeout(async () => {
      const params = new URLSearchParams({ limit: "10" });
      if (clientQuery.trim()) params.set("q", clientQuery.trim());
      const res = await fetchJson<ClientOption[]>(`/api/copilot/bank-reconciliation/clients-search?${params.toString()}`);
      if (res.ok && res.data) setClientOptions(res.data);
    }, 250);
    return () => clearTimeout(t);
  }, [clientQuery, pickerOpen]);

  const isAssociated = association != null;

  const handleConfirm = useCallback(async () => {
    if (!pickedClientId) return;
    setSubmitting(true);
    setFeedback(null);
    const res = await fetchJson<{ createdCount: number }>("/api/copilot/bank-reconciliation/client-identifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientCompanyId: pickedClientId, movementIds: [movementId], reason: null }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setFeedback({ tone: "error", message: res.error ?? "No se pudo guardar la asociación." });
      return;
    }
    setFeedback({ tone: "ok", message: `Movimiento asociado a ${pickedClientName}.` });
    await load(movementId);
    onChanged();
  }, [pickedClientId, pickedClientName, movementId, load, onChanged]);

  const handleReassign = useCallback(async () => {
    if (!pickedClientId || !reassignReason.trim()) return;
    setSubmitting(true);
    setFeedback(null);
    const res = await fetchJson("/api/copilot/bank-reconciliation/client-identifications/reassign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movementId, newClientCompanyId: pickedClientId, reason: reassignReason.trim() }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setFeedback({ tone: "error", message: res.error ?? "No se pudo actualizar la asociación." });
      return;
    }
    setFeedback({ tone: "ok", message: "Asociación actualizada." });
    setPickedClientId(null);
    setPickedClientName("");
    setReassignReason("");
    await load(movementId);
    onChanged();
  }, [pickedClientId, reassignReason, movementId, load, onChanged]);

  const handleRevoke = useCallback(async () => {
    setSubmitting(true);
    setFeedback(null);
    const res = await fetchJson("/api/copilot/bank-reconciliation/client-identifications/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movementId }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setFeedback({ tone: "error", message: res.error ?? "No se pudo revocar la asociación." });
      return;
    }
    setFeedback({ tone: "ok", message: "Asociación revocada. El movimiento volvió a Sin cliente." });
    await load(movementId);
    onChanged();
  }, [movementId, load, onChanged]);

  const handlePending = useCallback(async () => {
    setSubmitting(true);
    setFeedback(null);
    const res = await fetchJson(`/api/copilot/bank-movements/${movementId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "needs_review" }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setFeedback({ tone: "error", message: res.error ?? "No se pudo dejar pendiente." });
      return;
    }
    setFeedback({ tone: "ok", message: "Movimiento dejado pendiente." });
    onChanged();
  }, [movementId, onChanged]);

  const handleNonCommercial = useCallback(async () => {
    setSubmitting(true);
    setFeedback(null);
    const res = await fetchJson(`/api/copilot/bank-movements/${movementId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ignored" }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setFeedback({ tone: "error", message: res.error ?? "No se pudo marcar como no comercial." });
      return;
    }
    setFeedback({ tone: "ok", message: "Movimiento excluido de la conciliación comercial." });
    onChanged();
  }, [movementId, onChanged]);

  return (
    <BankDrawerShell aria-label="Asociar movimiento a cliente" onBackdropClick={onClose} panelClassName="w-full max-w-xl">
      <BankDrawerHeader className="flex items-center justify-between border-b border-[var(--copilot-border)] px-5 py-4">
        <div className="min-w-0">
          <p className={copilotCaptionClass}>Banco → Conciliación</p>
          <h3 className="text-base font-semibold text-[var(--copilot-text)]">
            {isAssociated ? "Ver asociación" : "Asignar cliente"}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
          data-bank-drawer-close
        >
          Cerrar
        </button>
      </BankDrawerHeader>

      <BankDrawerBody className="px-5 py-4">
        {loadState === "loading" ? <p className={copilotCaptionClass}>Cargando movimiento…</p> : null}
        {loadState === "error" ? (
          <p className="text-sm text-[var(--copilot-danger-text-strong)]">{error}</p>
        ) : null}

        {loadState === "ready" && movement ? (
          <div className="space-y-4">
            <section className="space-y-2">
              <p className={copilotMetricLabelClass}>Movimiento bancario</p>
              <DetailRow label="Fecha" value={movement.movement_date} />
              <DetailRow
                label="Fecha valor"
                value={metaString(movement.metadata, "value_date") ?? metaString(movement.metadata, "valueDate")}
              />
              <DetailRow
                label="Importe"
                value={`${movement.currency} ${Number(movement.amount).toLocaleString("es-UY", { minimumFractionDigits: 2 })}`}
              />
              <DetailRow
                label="Dirección"
                value={movement.direction === "inflow" ? "Ingreso" : "Egreso"}
              />
              <div className="grid grid-cols-[7.5rem_1fr] gap-2 text-sm">
                <dt className="text-[var(--copilot-muted)]">Descripción Santander</dt>
                <dd className={`text-[var(--copilot-text)] ${BANK_MOVEMENT_DESCRIPTION_CLASS}`}>
                  {getBankMovementDisplayDescription(movement)}
                </dd>
              </div>
              <DetailRow label="Referencia" value={movement.bank_reference} />
              <DetailRow
                label="Nº operación"
                value={
                  metaString(movement.metadata, "operation_number") ??
                  metaString(movement.metadata, "operation_group_key")
                }
              />
              <DetailRow
                label="Pagador"
                value={
                  metaString(movement.metadata, "payer_name_raw") ??
                  metaString(movement.metadata, "payer_name_normalized")
                }
              />
              <DetailRow
                label="Cuenta / ref."
                value={(() => {
                  const token =
                    metaString(movement.metadata, "payer_token") ??
                    metaString(movement.metadata, "masked_account");
                  if (!token) return null;
                  return maskAccountOrReference(token);
                })()}
              />
              <DetailRow
                label="Saldo posterior"
                value={(() => {
                  const bal = metaNumber(movement.metadata, "balance");
                  return bal == null
                    ? null
                    : `${movement.currency} ${bal.toLocaleString("es-UY", { minimumFractionDigits: 2 })}`;
                })()}
              />
              <DetailRow label="Banco" value={movement.bank_name} />
              <DetailRow label="Cuenta" value={movement.account_label} />
              <DetailRow
                label="Archivo fuente"
                value={
                  metaString(movement.metadata, "source_file") ??
                  metaString(movement.metadata, "parser")
                }
              />
              <DetailRow
                label="Importado"
                value={movement.created_at ? movement.created_at.slice(0, 10) : null}
              />
            </section>

            {feedback ? (
              <p
                className={`text-sm ${
                  feedback.tone === "ok"
                    ? "text-[var(--copilot-success-text-strong)]"
                    : "text-[var(--copilot-danger-text-strong)]"
                }`}
              >
                {feedback.message}
              </p>
            ) : null}

            {isAssociated ? (
              <div className="space-y-3">
                <div>
                  <p className={copilotMetricLabelClass}>Cliente</p>
                  {association?.clientCompanyId && association.clientName ? (
                    <BankClientNameLink
                      clientCompanyId={association.clientCompanyId}
                      clientName={association.clientName}
                      returnTo={buildBankReturnToQuery({
                        tab: "conciliacion",
                        movementId,
                        baseQuery: returnToSearch,
                      })}
                    />
                  ) : (
                    <p className="text-sm font-medium text-[var(--copilot-text)]">—</p>
                  )}
                </div>

                {association?.source === "financial_link" ? (
                  <p className={copilotCaptionClass}>
                    Este movimiento ya está conciliado financieramente con un recibo real de Zeta. Cambiar o
                    revocar el cliente no está disponible acá — eso afectaría una conciliación financiera real,
                    fuera de alcance de este panel.
                  </p>
                ) : pickedClientId ? (
                  <div className="space-y-2">
                    <p className={copilotCaptionClass}>Nuevo cliente: {pickedClientName}</p>
                    <div>
                      <label className={copilotMetricLabelClass}>Motivo (obligatorio para cambiar de cliente)</label>
                      <textarea
                        value={reassignReason}
                        onChange={(e) => setReassignReason(e.target.value)}
                        rows={2}
                        className={copilotInputClass}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div>
                <label className={copilotMetricLabelClass}>Cliente</label>
                {pickedClientId ? (
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-sm font-medium text-[var(--copilot-text)]">{pickedClientName}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setPickedClientId(null);
                        setPickedClientName("");
                        setPickerOpen(true);
                      }}
                      className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                    >
                      Elegir otro cliente
                    </button>
                  </div>
                ) : (
                  <div className="mt-1">
                    <input
                      type="search"
                      value={clientQuery}
                      onChange={(e) => {
                        setClientQuery(e.target.value);
                        setPickerOpen(true);
                      }}
                      placeholder="Buscar cliente…"
                      className={copilotInputClass}
                    />
                    {pickerOpen && clientOptions.length > 0 ? (
                      <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-[var(--copilot-border)]">
                        {clientOptions.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setPickedClientId(c.id);
                                setPickedClientName(c.name);
                                setPickerOpen(false);
                              }}
                              className="w-full px-2 py-1 text-left text-sm hover:bg-[var(--copilot-hover-bg)]"
                            >
                              {c.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </BankDrawerBody>

      {loadState === "ready" && movement ? (
        <BankDrawerFooter className="flex flex-wrap gap-2 border-t border-[var(--copilot-border)] px-5 py-3">
          {isAssociated ? (
            association?.source === "financial_link" ? (
              <a
                href={buildClientBankingHref({
                  clientCompanyId: association.clientCompanyId,
                  returnTo: buildBankReturnToQuery({
                    tab: "conciliacion",
                    movementId,
                    baseQuery: returnToSearch,
                  }),
                })}
                className={copilotButtonClassName({ variant: "primary", size: "sm" })}
              >
                Ver ficha del cliente
              </a>
            ) : !pickedClientId ? (
              <>
                <a
                  href={
                    association
                      ? buildClientBankingHref({
                          clientCompanyId: association.clientCompanyId,
                          returnTo: buildBankReturnToQuery({
                            tab: "conciliacion",
                            movementId,
                            baseQuery: returnToSearch,
                          }),
                        })
                      : "#"
                  }
                  className={copilotButtonClassName({ variant: "primary", size: "sm" })}
                >
                  Ver ficha del cliente
                </a>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                >
                  Cambiar cliente
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleRevoke()}
                  className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                >
                  Revocar asociación
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={submitting || !reassignReason.trim()}
                  onClick={() => void handleReassign()}
                  className={copilotButtonClassName({ variant: "primary", size: "sm" })}
                >
                  Confirmar cambio
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPickedClientId(null);
                    setPickedClientName("");
                  }}
                  className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                >
                  Cancelar
                </button>
              </>
            )
          ) : (
            <>
              <button
                type="button"
                disabled={!pickedClientId || submitting}
                onClick={() => void handleConfirm()}
                className={copilotButtonClassName({ variant: "primary", size: "sm" })}
              >
                {submitting ? "Guardando asociación…" : "Confirmar asociación"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handlePending()}
                className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
              >
                Dejar pendiente
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleNonCommercial()}
                className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
              >
                Marcar ingreso no comercial
              </button>
            </>
          )}
        </BankDrawerFooter>
      ) : null}
    </BankDrawerShell>
  );
}
