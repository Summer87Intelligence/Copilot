"use client";

/**
 * FASE F — Centro de Integridad y Salud (panel ejecutivo).
 * Consume /api/copilot/integrity (motor canónico) y muestra estado global,
 * cards, tabla filtrable por severidad/categoría, y detalle con evidencia.
 * No modifica datos; la autorreparación (cuando aplica) es acción explícita.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotSectionTitleClass,
} from "@/components/copilot/ui/copilot-visual-system";

type Severity = "critical" | "warning" | "info";
type Evidence = { entityId: string; label: string; detail: string };
type Finding = {
  ruleId: string;
  category: string;
  severity: Severity;
  title: string;
  count: number;
  impact: string;
  where: string;
  modules: string[];
  resolution: string;
  autoRepairable: boolean;
  evidence: Evidence[];
};
type Report = {
  status: "healthy" | "info" | "warning" | "critical";
  computedAt: string;
  findings: Finding[];
  counts: { critical: number; warning: number; info: number; total: number };
  byCategory: Record<string, number>;
  coverage: { evaluated: number; skipped: number; skippedRules: string[] };
  observability: {
    lastCronAt: string | null;
    lastSyncAt: string | null;
    pendingJobs: number;
    hoursSinceCron: number | null;
    hoursSinceSync: number | null;
  };
};

const STATUS_LABEL: Record<Report["status"], string> = {
  healthy: "Saludable",
  info: "Con información",
  warning: "Con advertencias",
  critical: "Con críticos",
};
const SEVERITY_LABEL: Record<Severity, string> = { critical: "Crítico", warning: "Advertencia", info: "Información" };
const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]",
  warning: "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  info: "border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] text-[var(--copilot-text)]",
};
const CATEGORY_LABEL: Record<string, string> = {
  documents: "Documentos",
  sales: "Ventas",
  cobranza: "Cobranza",
  banco: "Banco",
  comerciales: "Comerciales",
  clientes: "Clientes",
  system: "Sistema",
};

function fmtAge(hours: number | null): string {
  if (hours == null) return "—";
  if (hours < 1) return `hace ${Math.round(hours * 60)} min`;
  if (hours < 48) return `hace ${Math.round(hours)} h`;
  return `hace ${Math.round(hours / 24)} días`;
}

export function IntegridadClient() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sevFilter, setSevFilter] = useState<Severity | "all">("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [openRule, setOpenRule] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/copilot/integrity");
      const json = (await res.json()) as { ok: boolean; data?: Report; error?: string };
      if (!res.ok || !json.ok || !json.data) {
        setError(json.error ?? "No se pudo cargar el panel de integridad.");
        return;
      }
      setReport(json.data);
    } catch {
      setError("No se pudo cargar el panel de integridad.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!report) return [];
    return report.findings.filter(
      (f) => (sevFilter === "all" || f.severity === sevFilter) && (catFilter === "all" || f.category === catFilter)
    );
  }, [report, sevFilter, catFilter]);

  const cards = useMemo(() => {
    if (!report) return [];
    return [
      { label: "Estado general", value: STATUS_LABEL[report.status] },
      { label: "Críticos", value: report.counts.critical },
      { label: "Advertencias", value: report.counts.warning },
      { label: "Información", value: report.counts.info },
      { label: "Último sync", value: fmtAge(report.observability.hoursSinceSync) },
      { label: "Último cron", value: fmtAge(report.observability.hoursSinceCron) },
      { label: "Jobs pendientes", value: report.observability.pendingJobs },
      { label: "Cobertura reglas", value: `${report.coverage.evaluated} eval / ${report.coverage.skipped} n/d` },
    ];
  }, [report]);

  return (
    <div className="space-y-4">
      <CopilotPageHeader
        eyebrow="Centro de control"
        title="Integridad y Salud"
        description="Consistencia, seguridad y observabilidad de toda la plataforma."
      />

      {error ? (
        <p className="rounded-lg border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-3 py-2 text-xs text-[var(--copilot-danger-text-strong)]">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--copilot-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calculando salud del sistema…
        </div>
      ) : report ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className={copilotCardStandardClass}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">{c.label}</p>
                <p className="mt-1 text-xl font-semibold text-[var(--copilot-text)]">{c.value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Severidad"
              value={sevFilter}
              onChange={(e) => setSevFilter(e.target.value as Severity | "all")}
              className="rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card)] px-2 py-1 text-xs text-[var(--copilot-text)]"
            >
              <option value="all">Todas las severidades</option>
              <option value="critical">Críticos</option>
              <option value="warning">Advertencias</option>
              <option value="info">Información</option>
            </select>
            <select
              aria-label="Categoría"
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card)] px-2 py-1 text-xs text-[var(--copilot-text)]"
            >
              <option value="all">Todas las categorías</option>
              {Object.keys(CATEGORY_LABEL).map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </select>
            <span className={copilotCaptionClass}>{filtered.length} de {report.findings.length} hallazgos</span>
          </div>

          <section className={copilotCardStandardClass}>
            <h2 className={copilotSectionTitleClass}>Hallazgos</h2>
            {filtered.length === 0 ? (
              <p className={`${copilotCaptionClass} mt-2`}>Sin hallazgos con estos filtros. ✓</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[var(--copilot-muted)]">
                    <tr>
                      <th className="py-1 pr-2">Severidad</th>
                      <th className="py-1 pr-2">Categoría</th>
                      <th className="py-1 pr-2">Regla</th>
                      <th className="py-1 pr-2 text-right">Cantidad</th>
                      <th className="py-1 pr-2">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((f) => (
                      <Fragment key={f.ruleId}>
                        <tr className="border-t border-[var(--copilot-border)]">
                          <td className="py-1.5 pr-2">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SEVERITY_STYLE[f.severity]}`}>
                              {SEVERITY_LABEL[f.severity]}
                            </span>
                          </td>
                          <td className="py-1.5 pr-2">{CATEGORY_LABEL[f.category] ?? f.category}</td>
                          <td className="py-1.5 pr-2 font-medium text-[var(--copilot-text)]">{f.title}</td>
                          <td className="py-1.5 pr-2 text-right">{f.count}</td>
                          <td className="py-1.5 pr-2">
                            <button
                              type="button"
                              className="text-[var(--copilot-text)] underline"
                              onClick={() => setOpenRule(openRule === f.ruleId ? null : f.ruleId)}
                            >
                              {openRule === f.ruleId ? "Ocultar" : "Ver"}
                            </button>
                          </td>
                        </tr>
                        {openRule === f.ruleId ? (
                          <tr key={`${f.ruleId}-detail`} className="bg-[var(--copilot-soft-bg)]">
                            <td colSpan={5} className="px-3 py-3">
                              <dl className="grid gap-1 sm:grid-cols-2">
                                <div><dt className="text-[var(--copilot-muted)]">Impacto</dt><dd>{f.impact}</dd></div>
                                <div><dt className="text-[var(--copilot-muted)]">Dónde</dt><dd>{f.where}</dd></div>
                                <div><dt className="text-[var(--copilot-muted)]">Módulos afectados</dt><dd>{f.modules.join(", ")}</dd></div>
                                <div><dt className="text-[var(--copilot-muted)]">Cómo resolver</dt><dd>{f.resolution}</dd></div>
                                <div><dt className="text-[var(--copilot-muted)]">Autorreparable</dt><dd>{f.autoRepairable ? "Sí (acción segura)" : "No — requiere revisión humana"}</dd></div>
                              </dl>
                              {f.evidence.length > 0 ? (
                                <div className="mt-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Evidencia</p>
                                  <ul className="mt-1 space-y-0.5">
                                    {f.evidence.map((e, idx) => (
                                      <li key={`${e.entityId}-${idx}`}>• <span className="font-medium">{e.label}</span> — {e.detail}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className={copilotCaptionClass}>
            Última revisión: {new Date(report.computedAt).toLocaleString("es-UY")}. Nunca se borran datos automáticamente.
          </p>
        </>
      ) : null}
    </div>
  );
}
