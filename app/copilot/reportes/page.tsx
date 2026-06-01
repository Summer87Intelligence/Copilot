"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart2,
  CalendarClock,
  Eye,
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

import { CashMonthlyPreviewDialog } from "@/components/copilot/reports/cash-monthly-preview-dialog";
import { CollectionsPreviewDialog } from "@/components/copilot/reports/collections-preview-dialog";
import { DebtorsPreviewDialog } from "@/components/copilot/reports/debtors-preview-dialog";
import { ExecutiveMonthlyPreviewDialog } from "@/components/copilot/reports/executive-monthly-preview-dialog";
import { NetSalesPreviewDialog } from "@/components/copilot/reports/net-sales-preview-dialog";
import { TopClientsPreviewDialog } from "@/components/copilot/reports/top-clients-preview-dialog";

import { fetchClientPortfolioLoad } from "@/lib/copilot-client-portfolio-fetch";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import { actionCardClass } from "@/components/copilot/ui/copilot-visual-system";

// ── PDF-only trigger wrappers using MonthlyReportDialog ───────────────────────

function CashMonthlyReportTrigger({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className || smallPdfBtnClass}>
        <FileDown className="h-3.5 w-3.5" aria-hidden />
        PDF
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

function NetSalesReportTrigger({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className || smallPdfBtnClass}>
        <FileDown className="h-3.5 w-3.5" aria-hidden />
        PDF
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

function ExecutiveMonthlyReportTrigger({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className || smallPdfBtnClass}>
        <FileDown className="h-3.5 w-3.5" aria-hidden />
        PDF
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

const viewBtnClass =
  "inline-flex items-center gap-1.5 rounded-xl border border-[var(--copilot-accent)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--copilot-accent)] hover:bg-[var(--copilot-accent-soft)]";

const smallPdfBtnClass =
  "inline-flex items-center gap-1.5 rounded-xl border border-[var(--copilot-border)] bg-white/80 px-3 py-2 text-xs font-semibold text-[var(--copilot-ink-muted)] hover:bg-white";

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

type ActivePreview =
  | "debtors"
  | "collections"
  | "cash"
  | "netsales"
  | "topclients"
  | "executive"
  | null;

export default function CopilotReportesPage() {
  const [portfolio, setPortfolio] = useState<ClientPortfolioLoad | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePreview, setActivePreview] = useState<ActivePreview>(null);

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

  const closePreview = () => setActivePreview(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.clientes"
        title="Reportes"
        description="Consultá reportes en pantalla o descargalos como PDF."
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActivePreview("debtors")}
                className={viewBtnClass}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden />
                Ver reporte
              </button>
              {loading ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--copilot-ink-muted)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                </span>
              ) : portfolio && portfolio.rows.length > 0 ? (
                <DebtorsReportTrigger
                  portfolioRows={portfolio.rows}
                  portfolioDetails={portfolio.details}
                  label="PDF"
                  className={smallPdfBtnClass}
                />
              ) : null}
            </div>
          </ReportCard>

          <ReportCard
            icon={<Receipt className="h-5 w-5" aria-hidden />}
            title="Reporte de cobranza mensual"
            description="Cobros registrados del mes, separados por moneda. Ideal para conciliar con extracto bancario."
          >
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActivePreview("collections")}
                className={viewBtnClass}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden />
                Ver reporte
              </button>
              <CollectionsReportTrigger label="PDF" className={smallPdfBtnClass} />
            </div>
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActivePreview("cash")}
                className={viewBtnClass}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden />
                Ver reporte
              </button>
              <CashMonthlyReportTrigger className={smallPdfBtnClass} />
            </div>
          </ReportCard>

          <ReportCard
            icon={<TrendingUp className="h-5 w-5" aria-hidden />}
            title="Reporte de ventas netas"
            description="Facturación del mes por cliente, descontando notas de crédito. Agrupa en una vista limpia."
          >
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActivePreview("netsales")}
                className={viewBtnClass}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden />
                Ver reporte
              </button>
              <NetSalesReportTrigger className={smallPdfBtnClass} />
            </div>
          </ReportCard>

          <ReportCard
            icon={<BarChart2 className="h-5 w-5" aria-hidden />}
            title="Reporte ejecutivo mensual"
            description="Resumen CEO: indicadores clave, top 5 clientes, top 5 deudores y estado de caja en un solo PDF."
          >
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActivePreview("executive")}
                className={viewBtnClass}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden />
                Ver reporte
              </button>
              <ExecutiveMonthlyReportTrigger className={smallPdfBtnClass} />
            </div>
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActivePreview("topclients")}
                className={viewBtnClass}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden />
                Ver reporte
              </button>
              <TopClientsReportTrigger label="PDF" className={smallPdfBtnClass} />
            </div>
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

      {/* ── Preview modals ───────────────────────────────────── */}
      <DebtorsPreviewDialog
        open={activePreview === "debtors"}
        onClose={closePreview}
        portfolioRows={portfolio?.rows ?? []}
        portfolioDetails={portfolio?.details}
      />
      <CollectionsPreviewDialog
        open={activePreview === "collections"}
        onClose={closePreview}
      />
      <CashMonthlyPreviewDialog
        open={activePreview === "cash"}
        onClose={closePreview}
      />
      <NetSalesPreviewDialog
        open={activePreview === "netsales"}
        onClose={closePreview}
      />
      <TopClientsPreviewDialog
        open={activePreview === "topclients"}
        onClose={closePreview}
      />
      <ExecutiveMonthlyPreviewDialog
        open={activePreview === "executive"}
        onClose={closePreview}
      />
    </div>
  );
}
