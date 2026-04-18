"use client";

import { useCallback, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotCard, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import {
  DOCUMENT_INVENTORY,
  REGISTRATION_RULES,
  ROADMAP_SENIOR,
  TABLE_RELATIONSHIPS,
  roadmapPriorityTone,
} from "@/lib/copilot-document-architecture";

function RoadmapValorCell({
  admin,
  cliente,
  contadora,
}: {
  admin: string;
  cliente: string;
  contadora: string;
}) {
  return (
    <ul className="list-none space-y-2 text-[var(--copilot-ink-muted)]">
      <li>
        <span className="font-semibold text-[var(--copilot-ink)]">Admin: </span>
        {admin}
      </li>
      <li>
        <span className="font-semibold text-[var(--copilot-ink)]">Cliente: </span>
        {cliente}
      </li>
      <li>
        <span className="font-semibold text-[var(--copilot-ink)]">Contadora: </span>
        {contadora}
      </li>
    </ul>
  );
}

type AccordionKey = "tables" | "relations" | "rules" | "roadmap";

function ConfigAccordionSection({
  sectionKey,
  title,
  subtitle,
  isOpen,
  onToggle,
  children,
}: {
  sectionKey: AccordionKey;
  title: string;
  subtitle: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const baseId = useId();
  const headingId = `${baseId}-${sectionKey}-heading`;
  const panelId = `${baseId}-${sectionKey}-panel`;

  return (
    <CopilotCard className="overflow-hidden p-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-[rgba(31,107,74,0.04)]"
        aria-expanded={isOpen}
        aria-controls={panelId}
        id={headingId}
      >
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.12)]"
          aria-hidden
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ease-out ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-[var(--copilot-ink)]">{title}</span>
          <span className="mt-1 block text-sm leading-snug text-[var(--copilot-ink-muted)]">
            {subtitle}
          </span>
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headingId}
        className="border-t border-[var(--copilot-border)]"
        hidden={!isOpen}
      >
        <div className="space-y-4 px-5 py-5">{children}</div>
      </div>
    </CopilotCard>
  );
}

export default function CopilotConfiguracionPage() {
  const [open, setOpen] = useState<Record<AccordionKey, boolean>>({
    tables: true,
    relations: false,
    rules: false,
    roadmap: false,
  });

  const toggle = useCallback((key: AccordionKey) => {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.configuracion"
        title="Configuración"
        description="Mapa documental, contable y fiscal: tablas activas, reglas de registro, relaciones entre entidades y roadmap senior — sin cambiar tu base todavía."
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        <CopilotCard className="border-[rgba(31,107,74,0.14)] bg-[rgba(31,107,74,0.03)]">
          <CopilotSectionTitle
            title="Inventario y cobertura hoy"
            subtitle="Qué está vivo en Supabase y qué huecos quedan para una versión senior."
          />
          <p className="mt-3 text-sm leading-relaxed text-[var(--copilot-ink)]">
            Hoy el Copilot se apoya en <strong>tablas proto activas</strong> para operación
            comercial (empresas, contactos, facturas, recibos, pagos),{" "}
            <strong>respaldo documental</strong> (archivos vinculados a cada caso) y{" "}
            <strong>fiscal</strong> (obligaciones y pagos tributarios). Con eso funcionan cartera,
            liquidez, evidencias y alertas sobre datos reales.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
            Para madurez tipo ERP/contaduría faltan aún —entre otras— notas de crédito/débito,
            órdenes de pago, <strong>cuentas y movimientos bancarios</strong>,{" "}
            <strong>plan de cuentas, asientos y líneas de mayor</strong>,{" "}
            <strong>conciliaciones</strong>, documentos adjuntos, presentaciones fiscales explícitas
            y períodos cerrados. El roadmap detalla prioridades y propósito de cada pieza.
          </p>
        </CopilotCard>

        <CopilotCard className="border-dashed border-[var(--copilot-border)] bg-[rgba(255,255,255,0.55)]">
          <p className="text-sm font-semibold text-[var(--copilot-ink)]">
            Cómo recorrer el mapa técnico
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
            Los bloques de abajo están colapsados salvo el primero, para que la página sea más
            fácil de escanear. Tocá el encabezado de cada uno para desplegarlo cuando necesites
            profundizar: el contenido es el mismo de siempre, solo cambia la forma de navegarlo.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
            Podés tener varios abiertos a la vez si querés comparar, por ejemplo relaciones y
            reglas de registro en la misma lectura.
          </p>
          <div
            role="note"
            className="mt-4 rounded-xl border border-amber-200/90 bg-amber-50/85 px-4 py-3 text-sm text-amber-950"
          >
            <span className="font-semibold">Importante: </span>
            nada de esto modifica tu base de datos; es documentación viva para alinear equipo,
            cliente y contadora antes de implementar tablas nuevas.
          </div>
        </CopilotCard>

        <div className="space-y-4">
          <ConfigAccordionSection
            sectionKey="tables"
            title="Tablas activas hoy"
            subtitle="Cada fila es un tipo documental o maestro que ya podés poblar en el prototipo."
            isOpen={open.tables}
            onToggle={() => toggle("tables")}
          >
            <CopilotCard className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1020px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-[rgba(255,255,255,0.65)] text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      <th className="px-5 py-3">Tipo documental</th>
                      <th className="px-5 py-3">Tabla</th>
                      <th className="px-5 py-3">Qué registra</th>
                      <th className="px-5 py-3">Ejemplo de uso</th>
                      <th className="px-5 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DOCUMENT_INVENTORY.map((row, i) => (
                      <tr
                        key={row.tabla}
                        className={
                          i % 2 === 0
                            ? "bg-[var(--copilot-card)]"
                            : "bg-[rgba(255,255,255,0.5)]"
                        }
                      >
                        <td className="px-5 py-3.5 font-medium text-[var(--copilot-ink)]">
                          {row.tipo}
                        </td>
                        <td className="px-5 py-3.5 align-top">
                          <code className="rounded-md bg-[rgba(44,40,37,0.06)] px-2 py-1 text-xs font-semibold text-[var(--copilot-ink)]">
                            {row.tabla}
                          </code>
                        </td>
                        <td className="max-w-[280px] px-5 py-3.5 align-top text-[var(--copilot-ink-muted)]">
                          {row.queRegistra}
                        </td>
                        <td className="max-w-[260px] px-5 py-3.5 align-top text-[var(--copilot-ink-muted)]">
                          {row.ejemploUso}
                        </td>
                        <td className="px-5 py-3.5 align-top">
                          <span className="inline-flex rounded-full bg-emerald-100/85 px-2.5 py-1 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200/70">
                            {row.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CopilotCard>
          </ConfigAccordionSection>

          <ConfigAccordionSection
            sectionKey="relations"
            title="Relaciones entre tablas"
            subtitle="Modelo mental para negocio y contaduría: quién cuelga de quién en el diseño actual."
            isOpen={open.relations}
            onToggle={() => toggle("relations")}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {TABLE_RELATIONSHIPS.map((grupo) => (
                <CopilotCard key={grupo.titulo} className="h-full">
                  <p className="text-sm font-semibold text-[var(--copilot-ink)]">{grupo.titulo}</p>
                  <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">{grupo.descripcion}</p>
                  <ul className="mt-3 space-y-2 border-t border-[var(--copilot-border)] pt-3 text-sm text-[var(--copilot-ink-muted)]">
                    {grupo.enlaces.map((linea) => (
                      <li key={linea} className="flex gap-2">
                        <span
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]"
                          aria-hidden
                        />
                        <span className="leading-relaxed">{linea}</span>
                      </li>
                    ))}
                  </ul>
                </CopilotCard>
              ))}
            </div>
            <CopilotCard className="border-dashed border-[var(--copilot-border)] bg-[rgba(31,107,74,0.02)]">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Lectura rápida
              </p>
              <pre
                className="mt-3 overflow-x-auto rounded-lg bg-[rgba(44,40,37,0.04)] p-4 font-mono text-xs leading-relaxed text-[var(--copilot-ink)]"
                aria-label="Esquema de relaciones simplificado"
              >
{`proto_companies ─┬─► proto_contacts
                   ├─► proto_invoices ─► proto_receipts
                   ├─► proto_receipts
                   └─► proto_payments

proto_tax_obligations ─► proto_tax_payments

proto_documents ─► (vínculos a filas de las tablas anteriores)`}
              </pre>
            </CopilotCard>
          </ConfigAccordionSection>

          <ConfigAccordionSection
            sectionKey="rules"
            title="Regla de registro"
            subtitle="Un hecho en el mundo real → una fila coherente en la tabla que le corresponde."
            isOpen={open.rules}
            onToggle={() => toggle("rules")}
          >
            <div className="grid gap-4 md:grid-cols-2">
              {REGISTRATION_RULES.map((rule) => (
                <CopilotCard
                  key={rule.titulo}
                  className={`h-full ${rule.destacado ? "ring-2 ring-[rgba(31,107,74,0.2)]" : ""}`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-accent)]">
                    {rule.titulo}
                    {rule.destacado ? (
                      <span className="ml-2 font-normal normal-case text-[var(--copilot-ink-muted)]">
                        (regla base)
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                    {rule.cuerpo}
                  </p>
                </CopilotCard>
              ))}
            </div>
          </ConfigAccordionSection>

          <ConfigAccordionSection
            sectionKey="roadmap"
            title="Roadmap senior recomendado"
            subtitle="Tablas propuestas para documentación, bancos, mayor y conciliación — referencia de producto; aún no creadas en este paso."
            isOpen={open.roadmap}
            onToggle={() => toggle("roadmap")}
          >
            <CopilotCard className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-[rgba(255,255,255,0.65)] text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      <th className="px-5 py-3">Documento / entidad</th>
                      <th className="px-5 py-3">Tabla sugerida</th>
                      <th className="px-5 py-3">Prioridad</th>
                      <th className="min-w-[200px] px-5 py-3">Propósito</th>
                      <th className="min-w-[320px] px-5 py-3">Valor (admin / cliente / contadora)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROADMAP_SENIOR.map((row, i) => (
                      <tr
                        key={row.tablaSugerida}
                        className={
                          i % 2 === 0
                            ? "bg-[var(--copilot-card)]"
                            : "bg-[rgba(255,255,255,0.5)]"
                        }
                      >
                        <td className="px-5 py-3.5 align-top font-medium text-[var(--copilot-ink)]">
                          {row.documento}
                        </td>
                        <td className="px-5 py-3.5 align-top">
                          <code className="rounded-md bg-[rgba(44,40,37,0.06)] px-2 py-1 text-xs font-semibold text-[var(--copilot-ink-muted)]">
                            {row.tablaSugerida}
                          </code>
                        </td>
                        <td className="px-5 py-3.5 align-top">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${roadmapPriorityTone(row.prioridad)}`}
                          >
                            {row.prioridad}
                          </span>
                        </td>
                        <td className="max-w-xs px-5 py-3.5 align-top text-[var(--copilot-ink-muted)]">
                          {row.proposito}
                        </td>
                        <td className="px-5 py-3.5 align-top">
                          <RoadmapValorCell
                            admin={row.valorAdmin}
                            cliente={row.valorCliente}
                            contadora={row.valorContadora}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CopilotCard>
            <p className="text-xs text-[var(--copilot-ink-muted)]">
              La creación en base de datos y el cableado en API se harán cuando definas el alcance de
              implementación; este mapa no modifica el esquema actual.
            </p>
          </ConfigAccordionSection>
        </div>
      </div>
    </div>
  );
}
