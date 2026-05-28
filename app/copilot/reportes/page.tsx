"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  FileDown,
  FileText,
  Loader2,
  Users,
  Wallet,
} from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotCard, CopilotGhostLink, copilotPageMainClass } from "@/components/copilot/copilot-ui";
import { DebtorsReportTrigger } from "@/components/copilot/reports/debtors-report-dialog";
import { fetchClientPortfolioLoad } from "@/lib/copilot-client-portfolio-fetch";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import { actionCardClass } from "@/components/copilot/ui/copilot-visual-system";

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
        description="Descargá reportes operativos para revisar deuda, cobranza y caja."
      />

      <div className={`${copilotPageMainClass} max-w-3xl`}>
        <p className="text-xs text-[var(--copilot-ink-muted)]">
          Los reportes son de solo lectura: no modifican facturas, caja ni gestiones registradas.
        </p>

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
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--copilot-accent)] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90"
            />
          ) : (
            <span className="text-xs text-[var(--copilot-ink-muted)]">Sin clientes con deuda</span>
          )}
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

        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--copilot-ink-muted)]">
            Próximamente
          </p>
          <ReportCard
            muted
            icon={<CalendarClock className="h-5 w-5 opacity-60" aria-hidden />}
            title="Agenda de cobranza"
            description="Resumen exportable de seguimientos y promesas."
          />
          <ReportCard
            muted
            icon={<Wallet className="h-5 w-5 opacity-60" aria-hidden />}
            title="Tesorería"
            description="Movimientos y proyección de caja en PDF."
          />
          <ReportCard
            muted
            icon={<FileText className="h-5 w-5 opacity-60" aria-hidden />}
            title="Recibos"
            description="Listado de cobros por período."
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
