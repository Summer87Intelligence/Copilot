"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import type { CurrencyExecutiveBlock, HoyTreasuryAlert } from "@/lib/copilot-today-business-pulse";

import { MoneyValue } from "./hoy-money-value";

function balanceTone(
  block: CurrencyExecutiveBlock
): "positive" | "warning" | "danger" | "neutral" {
  if (!block.hasConfiguredOutflows) return "neutral";
  if (block.coverageStatus === "critical") return "danger";
  if (block.coverageStatus === "attention") return "warning";
  return "positive";
}

function ProjectionCurrencyBlock({ block }: { block: CurrencyExecutiveBlock }) {
  const title = block.currency === "USD" ? "Dólares (USD)" : "Pesos (UYU)";
  const balTone = balanceTone(block);

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-white p-4">
      <p className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</p>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[var(--copilot-ink-muted)]">Por cobrar</span>
          {block.pendingCurrent ? (
            <MoneyValue amount={block.pendingCurrent} tone="warning" />
          ) : (
            <span className="text-[var(--copilot-ink-muted)]">—</span>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[var(--copilot-ink-muted)]">Egresos programados</span>
          {block.scheduledOutflows30d ? (
            <MoneyValue amount={block.scheduledOutflows30d} tone="neutral" />
          ) : (
            <span className="text-xs text-[var(--copilot-ink-muted)]">Sin egresos configurados</span>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-2 border-t border-dashed border-[var(--copilot-border)] pt-2">
          <span className="font-medium text-[var(--copilot-ink)]">Balance proyectado</span>
          {block.projectedBalance30d ? (
            <MoneyValue amount={block.projectedBalance30d} tone={balTone} />
          ) : (
            <span className="text-xs text-[var(--copilot-ink-muted)]">—</span>
          )}
        </div>
      </div>
      {block.hasConfiguredOutflows ? (
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--copilot-ink-muted)]">
          Por cobrar menos pagos programados. No es caja real.
        </p>
      ) : null}
    </div>
  );
}

export function HoyProjection30dSection({
  blocks,
  alerts,
  configured,
}: {
  blocks: CurrencyExecutiveBlock[];
  alerts: HoyTreasuryAlert[];
  configured: boolean;
}) {
  if (blocks.length === 0) return null;

  return (
    <CopilotCard>
      <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">Próximos 30 días</h2>
      <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
        Cruce de deuda activa con pagos programados en Tesorería.
      </p>

      {!configured ? (
        <div className="mt-4 rounded-lg border border-amber-200/60 bg-amber-50/40 px-4 py-3 text-sm text-amber-950">
          <p>
            No hay egresos futuros configurados. Configuralos en Tesorería para proyectar caja.
          </p>
          <Link
            href="/copilot/tesoreria?section=obligations"
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
          >
            Ir a Tesorería
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {blocks.map((block) => (
              <ProjectionCurrencyBlock key={block.currency} block={block} />
            ))}
          </div>
          {alerts.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className={`rounded-lg px-3 py-2 text-xs leading-snug ${
                    a.tone === "critical"
                      ? "bg-rose-50/80 text-rose-900"
                      : a.tone === "attention"
                        ? "bg-amber-50/60 text-amber-950"
                        : "bg-emerald-50/60 text-emerald-900"
                  }`}
                >
                  {a.message}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </CopilotCard>
  );
}
