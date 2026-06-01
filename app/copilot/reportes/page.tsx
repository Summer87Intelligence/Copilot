"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart2,
  CalendarClock,
  FileDown,
  FileText,
  Landmark,
  Loader2,
  Receipt,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotCard, CopilotGhostLink, copilotPageMainClass } from "@/components/copilot/copilot-ui";
import { CollectionsReportTrigger } from "@/components/copilot/reports/collections-report-dialog";
import { DebtorsReportTrigger } from "@/components/copilot/reports/debtors-report-dialog";
import { MonthlyReportDialog } from "@/components/copilot/reports/monthly-report-dialog";
import { TopClientsReportTrigger } from "@/components/copilot/reports/top-clients-report-dialog";
import { fetchClientPortfolioLoad } from "@/lib/copilot-client-portfolio-fetch";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import { actionCardClass } from "@/components/copilot/ui/copilot-visual-system";

// ── Simple trigger wrappers for the 3 MonthlyReportDialog-based reports ──────

function CashMonthlyReportTrigger({ className = "", label = "Generar PDF" }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className || defaultBtnClass}>
        <FileDown className="h-3.5 w-3.5" aria-hidden />
        {label}
      </button>
      <MonthlyReportDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Reporte de caja mensual"
        description="Movimientos de caja del período con saldo acumulado."
        buildUrl={(y, m, cur) =>
          `/api/copilot/reports/cash-monthly.pdf?year=${y}&month=${m}&currency=${cur}`
        }
        defaultFilename={(y, m, cur) => `caja-${y}-${String(m).padStart(2, "0")}-${cur}.pdf`}
      />
    </>
  );
}

function NetSalesReportTrigger({ className = "", label = "Generar PDF" }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className || defaultBtnClass}>
        <FileDown className="h-3.5 w-3.5" aria-hidden />
        {label}
      </button>
      <MonthlyReportDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Reporte de ventas netas"
        description="Facturación por cliente menos notas de crédito del período."
        buildUrl={(y, m, cur) =>
          `/api/copilot/reports/net-sales.pdf?year=${y}&month=${m}&currency=${cur}`
        }
        defaultFilename={(y, m, cur) =>
          `ventas-netas-${y}-${String(m).padStart(2, "0")}-${cur}.pdf`
        }
      />
    </>
  );
}

function ExecutiveMonthlyReportTrigger({ className = "", label = "Generar PDF" }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className || defaultBtnClass}>
        <FileDown className="h-3.5 w-3.5" aria-hidden />
        {label}
      </button>
      <MonthlyReportDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Reporte ejecutivo mensual"
        description="Indicadores clave, top clientes y deudores en un solo documento."
        buildUrl={(y, m, cur) =>
          `/api/copilot/reports/executive-monthly.pdf?year=${y}&month=${m}&currency=${cur}`
        }
        defaultFilename={(y, m, cur) =>
          `ejecutivo-${y}-${String(m).padStart(2, "0")}-${cur}.pdf`
        }
      />
    </>
  );
}

const defaultBtnClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[var(--copilot-accent)] hover:bg-white";

const primaryBtnClass =
  "inline-flex items-center gap-1.5 rounded-xl bg-[var(--copilot-accent)] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90";

// ── Layout components ─────────────────────────────────────────────────────────

function GroupHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--copilot-ink-muted)]">
      {label}
    </p>
  );
}

function ReportCard({
  icon,
  title,
  description,
  children,
  muted,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <CopilotCard
      className={`${actionCardClass} ${muted ? "opacity-75" : ""} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}
    >
      <div className="flex min-w-0 gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
            {description}
          </p>
        </div>
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </CopilotCard>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CopilotReportesPage() {
  const [portfolio, setPortfolio] = useState<ClientPortfolioLoad | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchClientPortfolioLoad();
        if (!cancelled) setPortfolio(data);
      } catch {
        if (!cancelled) setPortfolio(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.clientes"
        title="Reportes"
        description="Descargá reportes operativos para revisar deuda, cobranza, caja y ventas."
      />

      <div className={`${copilotPageMainClass} max-w-3xl`}>
        <p className="text-xs text-[var(--copilot-ink-muted)]">
          Los reportes son de solo lectura: no modifican facturas, caja ni gestiones registradas.
        </p>

        {/* ── A: Cobranza ─────────────────────────────────────── */}
        <div className="space-y-3">
          <GroupHeader label="Cobranza" />

          <ReportCard
            icon={<FileDown className="h-5 w-5" aria-hidden />}
            title="Reporte de deudores"
            description="Clientes con deuda, moneda, antigüedad y contacto validado. Ideal para priorizar cobranza."
          >
            {loading ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--copilot-ink-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Cargando…
              </span>
            ) : portfolio && portfolio.rows.length > 0 ? (
              <DebtorsReportTrigger
                portfolioRows={portfolio.rows}
                portfolioDetails={portfolio.details}
                label="Generar PDF"
                className={primaryBtnClass}
              />
            ) : (
              <span className="text-xs text-[var(--copilot-ink-muted)]">Sin clientes con deuda</span>
            )}
          </ReportCard>

          <ReportCard
            icon={<Receipt className="h-5 w-5" aria-hidden />}
            title="Reporte de cobranza"
            description="Cobros registrados del mes, separados por moneda. Ideal para conciliar con extracto bancario."
          >
            <CollectionsReportTrigger label="Generar PDF" className={primaryBtnClass} />
          </ReportCard>
        </div>

        {/* ── B: Finanzas ──────────────────────────────────────── */}
        <div className="space-y-3">
          <GroupHeader label="Finanzas" />

          <ReportCard
            icon={<Landmark className="h-5 w-5" aria-hidden />}
            title="Reporte de caja mensual"
            description="Movimientos confirmados del período con saldo inicial, ingresos, egresos y saldo final."
          >
            <CashMonthlyReportTrigger label="Generar PDF" className={primaryBtnClass} />
          </ReportCard>

          <ReportCard
            icon={<TrendingUp className="h-5 w-5" aria-hidden />}
            title="Reporte de ventas netas"
            description="Facturación del mes por cliente, descontando notas de crédito. Agrupa en una vista limpia."
          >
            <NetSalesReportTrigger label="Generar PDF" className={primaryBtnClass} />
          </ReportCard>

          <ReportCard
            icon={<BarChart2 className="h-5 w-5" aria-hidden />}
            title="Reporte ejecutivo mensual"
            description="Resumen CEO: indicadores clave, top 5 clientes, top 5 deudores y estado de caja en un solo PDF."
          >
            <ExecutiveMonthlyReportTrigger label="Generar PDF" className={primaryBtnClass} />
          </ReportCard>
        </div>

        {/* ── C: Clientes ──────────────────────────────────────── */}
        <div className="space-y-3">
          <GroupHeader label="Clientes" />

          <ReportCard
            icon={<Trophy className="h-5 w-5" aria-hidden />}
            title="Clientes principales"
            description="Ranking de clientes ordenado por facturación, deuda o vencimiento. Muestra participación y nivel de riesgo."
          >
            <TopClientsReportTrigger label="Generar PDF" className={primaryBtnClass} />
          </ReportCard>

          <ReportCard
            icon={<FileText className="h-5 w-5" aria-hidden />}
            title="Estado de cuenta por cliente"
            description="Detalle individual de facturas, notas de crédito y recibos. Se genera desde la ficha de cada cliente."
          >
            <CopilotGhostLink
              href="/copilot/clientes"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--copilot-border)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--copilot-accent)] hover:bg-white/90"
            >
              <Users className="h-3.5 w-3.5" aria-hidden />
              Ir a Clientes
            </CopilotGhostLink>
          </ReportCard>
        </div>

        {/* ── Próximamente ─────────────────────────────────────── */}
        <div className="space-y-3">
          <GroupHeader label="Próximamente" />
          <ReportCard
            muted
            icon={<CalendarClock className="h-5 w-5 opacity-60" aria-hidden />}
            title="Agenda de cobranza"
            description="Resumen exportable de seguimientos y promesas."
          />
        </div>

        <p className="text-xs text-[var(--copilot-ink-muted)]">
          También podés generar el reporte de deudores desde{" "}
          <Link href="/copilot/clientes" className="font-semibold text-[var(--copilot-accent)] hover:underline">
            Clientes
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
