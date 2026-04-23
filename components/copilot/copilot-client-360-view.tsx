"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import type { Client360Payload } from "@/lib/copilot-client-360";

type TabId = "resumen" | "cuenta" | "comprobantes" | "recibos" | "zeta";

const TABS: { id: TabId; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "cuenta", label: "Estado de cuenta" },
  { id: "comprobantes", label: "Comprobantes" },
  { id: "recibos", label: "Recibos" },
  { id: "zeta", label: "Datos Zeta" },
];

function formatMoney(n: number): string {
  return `$ ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function formatDateShort(ymd: string): string {
  if (!ymd || ymd === "—") return ymd;
  try {
    return new Date(ymd + "T12:00:00").toLocaleDateString("es-UY", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return ymd;
  }
}

function safeJsonPreview(value: unknown, max = 12_000): string {
  try {
    const s = JSON.stringify(value, null, 2);
    if (s.length <= max) return s;
    return `${s.slice(0, max)}\n… (${s.length} caracteres; truncado)`;
  } catch {
    return String(value);
  }
}

export function CopilotClient360View({ companyId }: { companyId: string }) {
  const [tab, setTab] = useState<TabId>("resumen");
  const [data, setData] = useState<Client360Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.clientes"
        title="Ficha cliente 360"
        description="Estado de cuenta, comprobantes, recibos y metadata ya sincronizados en Copilot (sin llamadas a Zeta)."
      />
      <div className="border-b border-[var(--copilot-border)] bg-[var(--copilot-card)] px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <CopilotGhostLink
            href="/copilot/clientes"
            className="inline-flex items-center gap-1.5 text-sm font-medium"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Cartera
          </CopilotGhostLink>
          <span className="text-[var(--copilot-ink-muted)]">/</span>
          <span className="text-sm font-semibold text-[var(--copilot-ink)]">Ficha cliente 360</span>
        </div>
        {data ? (
          <div className="mt-3">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--copilot-ink)]">
              {data.summary.nombre_visible}
            </h1>
            <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
              Estado de cuenta y contexto comercial — datos ya sincronizados en Copilot.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.insights.map((i) => (
                <span key={i.id} className={i.active ? "" : "opacity-55"}>
                  <CopilotBadge
                    tone={
                      i.active
                        ? i.tone === "danger"
                          ? "danger"
                          : i.tone === "warning"
                            ? "warning"
                            : i.tone === "success"
                              ? "success"
                              : "neutral"
                        : "neutral"
                    }
                  >
                    {i.label}
                  </CopilotBadge>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-b border-[var(--copilot-border)] bg-[rgba(255,255,255,0.55)] px-6">
        <nav className="flex flex-wrap gap-1 py-2" aria-label="Secciones ficha cliente">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                tab === t.id
                  ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)]"
                  : "text-[var(--copilot-ink-muted)] hover:bg-[rgba(44,40,37,0.06)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 space-y-6 overflow-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Cargando ficha…
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-950">
            {error}
          </div>
        ) : null}

        {!loading && !error && data ? (
          <>
            {tab === "resumen" ? (
              <CopilotCard>
                <CopilotSectionTitle
                  title="Identificación y comercial"
                  subtitle="Columnas proto y bloque comercial Zeta (si fue sincronizado)."
                />
                <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Razón social
                    </dt>
                    <dd className="mt-1 text-sm text-[var(--copilot-ink)]">{data.summary.razon_social || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Nombre visible
                    </dt>
                    <dd className="mt-1 text-sm text-[var(--copilot-ink)]">{data.summary.nombre_visible}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Código
                    </dt>
                    <dd className="mt-1 text-sm text-[var(--copilot-ink)]">{data.summary.codigo ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      RUT / documento
                    </dt>
                    <dd className="mt-1 text-sm text-[var(--copilot-ink)]">{data.summary.rut_documento ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Industria
                    </dt>
                    <dd className="mt-1 text-sm text-[var(--copilot-ink)]">{data.summary.industry ?? "—"}</dd>
                  </div>
                  {data.summary.commercial ? (
                    <>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                          Condición comercial
                        </dt>
                        <dd className="mt-1 text-sm text-[var(--copilot-ink)]">
                          {data.summary.commercial.condicion_comercial ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                          Categoría
                        </dt>
                        <dd className="mt-1 text-sm text-[var(--copilot-ink)]">
                          {data.summary.commercial.categoria ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                          Vendedor (código)
                        </dt>
                        <dd className="mt-1 text-sm text-[var(--copilot-ink)]">
                          {data.summary.commercial.vendedor_codigo ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                          Moneda
                        </dt>
                        <dd className="mt-1 text-sm text-[var(--copilot-ink)]">
                          {data.summary.commercial.moneda_codigo ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                          Local
                        </dt>
                        <dd className="mt-1 text-sm text-[var(--copilot-ink)]">
                          {[data.summary.commercial.local_nombre, data.summary.commercial.local_codigo]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                          Estado comercial
                        </dt>
                        <dd className="mt-1 text-sm text-[var(--copilot-ink)]">
                          {data.summary.commercial.estado_comercial_activo === null
                            ? "—"
                            : data.summary.commercial.estado_comercial_activo
                              ? "Activo"
                              : "Inactivo"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                          Límite crédito
                        </dt>
                        <dd className="mt-1 text-sm text-[var(--copilot-ink)]">
                          {[data.summary.commercial.limite_credito_monto, data.summary.commercial.limite_credito_dias]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </dd>
                      </div>
                    </>
                  ) : (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <p className="text-sm text-[var(--copilot-ink-muted)]">
                        Aún no hay bloque comercial Zeta en `zeta_metadata`. Sincronizá datos comerciales para
                        completar categoría, condición, vendedor y moneda.
                      </p>
                    </div>
                  )}
                </dl>
              </CopilotCard>
            ) : null}

            {tab === "cuenta" ? (
              <div className="grid gap-4 lg:grid-cols-3">
                <CopilotCard>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Saldo pendiente total
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                    {formatMoney(data.cuenta.saldo_pendiente_total)}
                  </p>
                  <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
                    Suma de saldos en facturas activas (`balance_amount` + control opcional `invoice_financials`).
                  </p>
                </CopilotCard>
                <CopilotCard>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Comprobantes
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--copilot-ink)]">
                    {data.cuenta.comprobantes_count}
                  </p>
                  <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">Facturas / comprobantes proto activos.</p>
                </CopilotCard>
                <CopilotCard>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Recibos
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--copilot-ink)]">{data.cuenta.recibos_count}</p>
                  <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">Recibos de cobro registrados en Copilot.</p>
                </CopilotCard>
                <CopilotCard className="lg:col-span-3">
                  <CopilotSectionTitle
                    title="Últimos movimientos"
                    subtitle="Mezcla cronológica de emisiones y cobros recientes."
                  />
                  {data.cuenta.ultimos_movimientos.length === 0 ? (
                    <p className="text-sm text-[var(--copilot-ink-muted)]">Sin movimientos registrados.</p>
                  ) : (
                    <ul className="divide-y divide-[var(--copilot-border)]">
                      {data.cuenta.ultimos_movimientos.map((m, idx) => (
                        <li key={`${m.kind}-${m.fecha}-${idx}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                          <div>
                            <span className="font-medium text-[var(--copilot-ink)]">
                              {m.kind === "factura" ? "Comprobante" : "Recibo"}
                            </span>
                            <span className="text-[var(--copilot-ink-muted)]"> · {m.label}</span>
                          </div>
                          <div className="tabular-nums text-[var(--copilot-ink)]">
                            {formatMoney(m.importe)} · {formatDateShort(m.fecha)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CopilotCard>
              </div>
            ) : null}

            {tab === "comprobantes" ? (
              <CopilotCard className="overflow-hidden p-0">
                <div className="border-b border-[var(--copilot-border)] px-5 py-4">
                  <CopilotSectionTitle title="Comprobantes" subtitle="Facturas y comprobantes asociados al cliente." />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="bg-[rgba(255,255,255,0.65)] text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        <th className="px-5 py-3">Fecha</th>
                        <th className="px-5 py-3">Serie / número</th>
                        <th className="px-5 py-3">Tipo</th>
                        <th className="px-5 py-3">Importe</th>
                        <th className="px-5 py-3">Saldo</th>
                        <th className="px-5 py-3">Estado</th>
                        <th className="px-5 py-3">Referencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.invoices.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-5 py-8 text-[var(--copilot-ink-muted)]">
                            No hay comprobantes para este cliente.
                          </td>
                        </tr>
                      ) : (
                        data.invoices.map((inv, i) => (
                          <tr
                            key={inv.id}
                            className={i % 2 === 0 ? "bg-[var(--copilot-card)]" : "bg-[rgba(255,255,255,0.5)]"}
                          >
                            <td className="px-5 py-3">{formatDateShort(inv.issue_date)}</td>
                            <td className="px-5 py-3 font-medium">{inv.serie_numero}</td>
                            <td className="px-5 py-3 text-[var(--copilot-ink-muted)]">{inv.tipo}</td>
                            <td className="px-5 py-3 tabular-nums">{formatMoney(inv.importe)}</td>
                            <td className="px-5 py-3 tabular-nums text-[var(--copilot-ink-muted)]">{inv.saldo}</td>
                            <td className="px-5 py-3">{inv.estado}</td>
                            <td className="max-w-[220px] px-5 py-3 text-xs text-[var(--copilot-ink-muted)]">
                              <span className="line-clamp-2">{inv.referencia ?? "—"}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CopilotCard>
            ) : null}

            {tab === "recibos" ? (
              <CopilotCard className="overflow-hidden p-0">
                <div className="border-b border-[var(--copilot-border)] px-5 py-4">
                  <CopilotSectionTitle title="Recibos" subtitle="Cobranzas registradas (incluye sync Zeta si aplica)." />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="bg-[rgba(255,255,255,0.65)] text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        <th className="px-5 py-3">Fecha</th>
                        <th className="px-5 py-3">Importe</th>
                        <th className="px-5 py-3">Medio / caja / cobrador</th>
                        <th className="px-5 py-3">Referencia</th>
                        <th className="px-5 py-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.receipts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-5 py-8 text-[var(--copilot-ink-muted)]">
                            No hay recibos para este cliente.
                          </td>
                        </tr>
                      ) : (
                        data.receipts.map((r, i) => (
                          <tr
                            key={r.id}
                            className={i % 2 === 0 ? "bg-[var(--copilot-card)]" : "bg-[rgba(255,255,255,0.5)]"}
                          >
                            <td className="px-5 py-3">{formatDateShort(r.receipt_date)}</td>
                            <td className="px-5 py-3 tabular-nums font-medium">{formatMoney(r.importe)}</td>
                            <td className="px-5 py-3 text-[var(--copilot-ink-muted)]">{r.medio ?? "—"}</td>
                            <td className="px-5 py-3 text-[var(--copilot-ink-muted)]">{r.referencia ?? "—"}</td>
                            <td className="px-5 py-3">{r.estado}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CopilotCard>
            ) : null}

            {tab === "zeta" ? (
              <div className="space-y-4">
                <CopilotCard>
                  <CopilotSectionTitle
                    title="Sincronización por recurso"
                    subtitle="Estado en `zeta_sync_state` del workspace (lectura local)."
                  />
                  {data.zeta_sync_rows.length === 0 ? (
                    <p className="text-sm text-[var(--copilot-ink-muted)]">Sin filas de estado de sync.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                        <thead>
                          <tr className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                            <th className="py-2 pr-4">Recurso</th>
                            <th className="py-2 pr-4">Último éxito</th>
                            <th className="py-2 pr-4">Actualizado</th>
                            <th className="py-2">Bootstrap</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.zeta_sync_rows.map((z) => (
                            <tr key={z.resource_flow} className="border-t border-[var(--copilot-border)]">
                              <td className="py-2 pr-4">
                                <div className="font-medium text-[var(--copilot-ink)]">{z.label}</div>
                                <div className="text-xs text-[var(--copilot-ink-muted)]">{z.resource_flow}</div>
                              </td>
                              <td className="py-2 pr-4 text-[var(--copilot-ink-muted)]">
                                {z.last_success_at ? formatDateShort(z.last_success_at.slice(0, 10)) : "—"}
                              </td>
                              <td className="py-2 pr-4 text-[var(--copilot-ink-muted)]">
                                {z.updated_at ? formatDateShort(z.updated_at.slice(0, 10)) : "—"}
                              </td>
                              <td className="py-2">{z.bootstrap_completed ? "Sí" : "No"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CopilotCard>
                <CopilotCard>
                  <CopilotSectionTitle
                    title="Metadata en cliente (`zeta_metadata`)"
                    subtitle="Incluye `commercial_client_v1` y otros bloques que hayas fusionado."
                  />
                  <pre className="max-h-[420px] overflow-auto rounded-xl bg-[rgba(44,40,37,0.04)] p-4 text-xs leading-relaxed text-[var(--copilot-ink)]">
                    {safeJsonPreview(data.zeta_metadata)}
                  </pre>
                </CopilotCard>
              </div>
            ) : null}
          </>
        ) : null}

        {!loading && !error && !data ? (
          <p className="text-sm text-[var(--copilot-ink-muted)]">Sin datos.</p>
        ) : null}
      </div>
    </div>
  );
}
