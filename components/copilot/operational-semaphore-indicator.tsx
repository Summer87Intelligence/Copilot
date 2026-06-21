"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import { useCopilotOperationalPulse } from "@/components/copilot/copilot-operational-pulse-context";
import type { OperationalSemaphoreLevel } from "@/lib/copilot-operational-semaphore";

const LEVEL_THEME: Record<
  OperationalSemaphoreLevel,
  { dot: string; labelClass: string; panelBorder: string }
> = {
  ok: {
    dot: "bg-[var(--copilot-status-ok-dot)] shadow-[0_0_0_2px_rgba(16,185,129,0.25)]",
    labelClass: "text-[var(--copilot-success-text-strong)]",
    panelBorder: "border-[var(--copilot-success-border)]/80",
  },
  attention: {
    dot: "bg-[var(--copilot-status-warn-dot)] shadow-[0_0_0_2px_rgba(251,191,36,0.35)]",
    labelClass: "text-[var(--copilot-warning-text-strong)]",
    panelBorder: "border-[var(--copilot-warning-border)]/80",
  },
  critical: {
    dot: "bg-[var(--copilot-status-critical-dot)] shadow-[0_0_0_2px_rgba(244,63,94,0.25)]",
    labelClass: "text-[var(--copilot-danger-text-strong)]",
    panelBorder: "border-[var(--copilot-danger-border)]/80",
  },
};

function SeverityList({
  label,
  items,
  empty,
}: {
  label: string;
  items: string[];
  empty: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {label}
      </p>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-1 text-xs leading-snug text-[var(--copilot-ink)]">
          {items.map((item) => (
            <li key={item} className="flex gap-1.5">
              <span className="text-[var(--copilot-ink-muted)]" aria-hidden>
                ·
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function compactSemaphoreLabel(
  level: OperationalSemaphoreLevel,
  signalCount: number
): string {
  if (level === "ok") return "OK";
  if (signalCount > 0) return String(signalCount);
  return level === "critical" ? "Crítico" : "Atención";
}

export function OperationalSemaphoreIndicator() {
  const { semaphore, loading } = useCopilotOperationalPulse();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const theme = LEVEL_THEME[semaphore.level];

  const signalCount =
    semaphore.criticalCount +
    semaphore.highCount +
    semaphore.mediumCount +
    semaphore.operativeItems.length;

  const compactLabel = useMemo(
    () => compactSemaphoreLabel(semaphore.level, signalCount),
    [semaphore.level, signalCount]
  );

  const tooltip = useMemo(() => {
    const lines = [
      `Estado: ${semaphore.statusLabel}`,
      semaphore.counterLine,
      semaphore.primaryReason,
    ];
    return lines.filter(Boolean).join("\n");
  }, [semaphore]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open, close]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/90 px-2.5 py-1 text-left shadow-sm transition-colors duration-200 hover:bg-[var(--copilot-panel-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]"
        aria-expanded={open}
        aria-controls={panelId}
        title={loading ? "Estado del negocio" : tooltip}
        aria-label={
          loading
            ? "Estado del negocio"
            : `Estado del negocio: ${semaphore.statusLabel}. ${semaphore.counterLine}`
        }
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            loading ? "animate-pulse bg-[var(--copilot-subtle)] shadow-none" : theme.dot
          }`}
          aria-hidden
        />
        <span
          className={`truncate text-[11px] font-semibold leading-none ${
            loading ? "text-[var(--copilot-ink-muted)]" : theme.labelClass
          }`}
        >
          {loading ? "…" : compactLabel}
        </span>
      </button>

      {open && !loading ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Estado del negocio"
          className={`absolute right-0 top-full z-[80] mt-2 w-[min(100vw-2rem,20rem)] rounded-xl border bg-[var(--copilot-card-bg)] p-3 shadow-xl ${theme.panelBorder}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Estado del negocio
              </p>
              <p className={`mt-0.5 text-sm font-semibold ${theme.labelClass}`}>
                {semaphore.statusLabel}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">
                {semaphore.counterLine}
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              className="shrink-0 rounded-md p-1 text-[var(--copilot-ink-muted)] hover:bg-[rgba(44,40,37,0.06)]"
              aria-label="Cerrar"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
            {semaphore.primaryReason}
          </p>

          <div className="mt-3 space-y-2.5 border-t border-[var(--copilot-border)]/70 pt-2.5">
            {semaphore.criticalItems.length > 0 ? (
              <SeverityList label="Críticas" items={semaphore.criticalItems} empty="Ninguna" />
            ) : null}
            {semaphore.highItems.length > 0 ? (
              <SeverityList label="Alertas altas" items={semaphore.highItems} empty="Ninguna" />
            ) : null}
            {semaphore.mediumItems.length > 0 ? (
              <SeverityList label="Alertas medias" items={semaphore.mediumItems} empty="Ninguna" />
            ) : null}
            {semaphore.operativeItems.length > 0 ? (
              <SeverityList label="Señales operativas" items={semaphore.operativeItems} empty="" />
            ) : null}
            {semaphore.criticalItems.length === 0 &&
             semaphore.highItems.length === 0 &&
             semaphore.mediumItems.length === 0 &&
             semaphore.operativeItems.length === 0 ? (
              <p className="text-xs text-[var(--copilot-ink-muted)]">Sin señales activas.</p>
            ) : null}
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <Link
              href={semaphore.ctaHref}
              onClick={close}
              className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--copilot-accent)] px-3 py-2 text-xs font-semibold text-[var(--copilot-on-accent)] hover:opacity-95"
            >
              {semaphore.ctaLabel}
            </Link>
            {semaphore.level !== "ok" ? (
              <Link
                href="/copilot/alertas"
                onClick={close}
                className="inline-flex w-full items-center justify-center rounded-lg border border-[var(--copilot-border)] px-3 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] hover:bg-[rgba(44,40,37,0.04)]"
              >
                Ver alertas
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
