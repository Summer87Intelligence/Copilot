"use client";

import { useState } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  CopilotCard,
  CopilotGhostButton,
  CopilotPrimaryButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { MOCK_TICKETS } from "@/lib/copilot-mock-data";

export default function CopilotMesaDeAyudaPage() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"sugerencia" | "problema" | "mejora">(
    "sugerencia"
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.mesa-ayuda"
        title="Mesa de ayuda"
        description="Sugerencias, problemas o ideas — te respondemos con foco en claridad, no en jargon."
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <CopilotCard>
            <CopilotSectionTitle
              title="Enviar mensaje"
              subtitle="Elegí el tipo y contanos en pocas líneas."
            />
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["sugerencia", "Sugerencia"],
                  ["problema", "Reportar problema"],
                  ["mejora", "Solicitar mejora"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setKind(id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                    kind === id
                      ? "bg-[var(--copilot-ink)] text-white"
                      : "bg-white/80 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="mt-5 block text-sm">
              <span className="text-[var(--copilot-ink-muted)]">Asunto</span>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ej.: Quiero ver plazos de cobro en Clientes"
                className="mt-1 w-full rounded-xl border border-[var(--copilot-border)] bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-4 block text-sm">
              <span className="text-[var(--copilot-ink-muted)]">Mensaje</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                placeholder="Contanos qué pasó, qué esperabas y qué te ayudaría."
                className="mt-1 w-full rounded-xl border border-[var(--copilot-border)] bg-white px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-5 flex flex-wrap gap-2">
              <CopilotPrimaryButton type="button">Enviar</CopilotPrimaryButton>
              <CopilotGhostButton type="button" onClick={() => { setSubject(""); setBody(""); }}>
                Limpiar
              </CopilotGhostButton>
            </div>
          </CopilotCard>

          <CopilotCard>
            <CopilotSectionTitle
              title="Historial reciente"
              subtitle="Estado de tus solicitudes."
            />
            <ul className="space-y-3">
              {MOCK_TICKETS.map((t) => (
                <li
                  key={t.id}
                  className="rounded-xl border border-[var(--copilot-border)] bg-white/75 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-mono text-[var(--copilot-ink-muted)]">
                      {t.id}
                    </span>
                    <span className="rounded-full bg-[rgba(44,40,37,0.06)] px-2 py-0.5 text-xs font-semibold text-[var(--copilot-ink)]">
                      {t.state}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-[var(--copilot-ink)]">
                    {t.subject}
                  </p>
                  <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">{t.date}</p>
                </li>
              ))}
            </ul>
          </CopilotCard>
        </div>
      </div>
    </div>
  );
}
