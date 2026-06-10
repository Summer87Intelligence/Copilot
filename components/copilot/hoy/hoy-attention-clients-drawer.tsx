"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { HOY_COPY } from "@/lib/copilot-hoy-ui-contract";
import type { AttentionClientsSummary } from "@/lib/copilot-today-business-pulse";

import { HoyDrawer } from "./hoy-drawer";
import { MoneyValue } from "./hoy-money-value";

export function AttentionClientsDrawer({
  data,
  onViewAllDebtors,
  onClose,
}: {
  data: AttentionClientsSummary;
  onViewAllDebtors: () => void;
  onClose: () => void;
}) {
  const debtorBtn =
    data.totalActiveDebtors === 1
      ? "Ver el deudor en la lista"
      : `Ver todos los deudores (${data.totalActiveDebtors})`;

  return (
    <HoyDrawer
      title={HOY_COPY.attentionDrawerTitle}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onViewAllDebtors}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--copilot-ink)]"
          >
            {debtorBtn}
          </button>
          <Link
            href="/copilot/cartera"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Ver cartera completa
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      }
    >
      <p className="mb-3 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
        {HOY_COPY.attentionDrawerSubtitle} Hay {data.totalActiveDebtors} con deuda activa en total.
      </p>

      <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-2.5">
          <p className="text-[var(--copilot-ink-muted)]">Casos</p>
          <p className="text-xl font-bold text-[var(--copilot-ink)]">{data.total}</p>
        </div>
        <div className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-2.5">
          <p className="text-[var(--copilot-ink-muted)]">Vencido UYU</p>
          <MoneyValue
            amount={
              data.vencidoTotalUyu > 0
                ? {
                    currency: "UYU",
                    amount: data.vencidoTotalUyu,
                    formatted: `UYU $ ${data.vencidoTotalUyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`,
                  }
                : null
            }
            tone="danger"
          />
        </div>
        <div className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-2.5">
          <p className="text-[var(--copilot-ink-muted)]">Vencido USD</p>
          <MoneyValue
            amount={
              data.vencidoTotalUsd > 0
                ? {
                    currency: "USD",
                    amount: data.vencidoTotalUsd,
                    formatted: `USD U$S ${data.vencidoTotalUsd.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`,
                  }
                : null
            }
            tone="danger"
          />
        </div>
        <div className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-2.5">
          <p className="text-[var(--copilot-ink-muted)]">Deuda actual UYU</p>
          <MoneyValue
            amount={
              data.deudaTotalUyu > 0
                ? {
                    currency: "UYU",
                    amount: data.deudaTotalUyu,
                    formatted: `UYU $ ${data.deudaTotalUyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`,
                  }
                : null
            }
            tone="warning"
          />
        </div>
        <div className="col-span-2 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-2.5">
          <p className="text-[var(--copilot-ink-muted)]">Deuda actual USD</p>
          <MoneyValue
            amount={
              data.deudaTotalUsd > 0
                ? {
                    currency: "USD",
                    amount: data.deudaTotalUsd,
                    formatted: `USD U$S ${data.deudaTotalUsd.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`,
                  }
                : null
            }
            tone="warning"
          />
        </div>
      </div>

      <ul className="space-y-3">
        {data.clients.map((c) => (
          <li key={c.company_id} className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-[var(--copilot-ink)]">{c.name}</p>
              <Link
                href={c.deepLink}
                className="shrink-0 text-[10px] font-semibold text-[var(--copilot-accent)]"
                onClick={(e) => e.stopPropagation()}
              >
                Ficha 360
              </Link>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {c.deuda_uyu ? <MoneyValue amount={c.deuda_uyu} tone="warning" /> : null}
              {c.deuda_usd ? <MoneyValue amount={c.deuda_usd} tone="warning" /> : null}
              {c.vencido_uyu ? <MoneyValue amount={c.vencido_uyu} tone="danger" /> : null}
              {c.vencido_usd ? <MoneyValue amount={c.vencido_usd} tone="danger" /> : null}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {c.motivos.map((m) => (
                <span
                  key={m}
                  className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-700"
                >
                  {m}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-[var(--copilot-ink)]">{c.accion}</p>
          </li>
        ))}
      </ul>
    </HoyDrawer>
  );
}
