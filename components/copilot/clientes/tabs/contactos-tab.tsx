"use client";

import { useState } from "react";
import { Copy, Mail, MessageCircle } from "lucide-react";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import type { Client360Payload } from "@/lib/copilot-client-360";
import { normalizeUruguayPhoneForWhatsApp } from "@/lib/phone/normalize-phone-for-whatsapp";

function DataField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-[var(--copilot-ink)]">
        {value && value.trim() ? value : "Sin dato cargado"}
      </dd>
    </div>
  );
}

export function ContactosTab({ data }: { data: Client360Payload }) {
  const [copied, setCopied] = useState<string | null>(null);
  const { summary, contacts } = data;
  const waPhone = normalizeUruguayPhoneForWhatsApp(summary.phone);
  const primary = contacts.find((c) => c.email) ?? contacts[0] ?? null;

  function copy(value: string) {
    navigator.clipboard?.writeText(value).catch(() => null);
    setCopied(value);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-4 px-5 py-4">
      {/* Identidad */}
      <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-5 shadow-sm">
        <p className="mb-4 text-[11px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
          Datos del cliente
        </p>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
          <DataField label="Razón social" value={summary.razon_social} />
          <DataField label="Nombre" value={summary.nombre_visible} />
          <DataField label="Código Zeta" value={summary.codigo} />
          <DataField label="RUT" value={summary.rut_documento} />
          <DataField label="Email" value={contacts.find((c) => c.email)?.email} />
          <DataField label="Teléfono" value={summary.phone} />
        </dl>
      </div>

      {/* Contactos */}
      <CopilotCard>
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--copilot-ink)]">
            Contactos
            {contacts.length > 0 ? (
              <span className="ml-2 text-xs font-normal text-[var(--copilot-ink-muted)]">
                ({contacts.length})
              </span>
            ) : null}
          </p>
          <span className="text-[11px] text-[var(--copilot-ink-muted)]">Dato de Zeta</span>
        </div>

        {contacts.length === 0 && !summary.phone ? (
          <p className="text-sm text-[var(--copilot-ink-muted)]">
            Sin contactos registrados para este cliente.
          </p>
        ) : (
          <ul className="space-y-2">
            {contacts.map((c) => {
              const isPrimary = primary && c.id === primary.id;
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-[var(--copilot-border)] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--copilot-ink)]">
                      {c.full_name}
                      {isPrimary ? (
                        <span className="ml-2 rounded-full bg-[var(--copilot-accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--copilot-accent)]">
                          Principal
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
                      {c.job_title ?? "Sin rol cargado"}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
                      {c.email ?? "Sin email cargado"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {c.email ? (
                      <>
                        <a
                          href={`mailto:${c.email}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--copilot-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-soft-bg)]"
                        >
                          <Mail className="h-3 w-3" aria-hidden />
                          Email
                        </a>
                        <button
                          type="button"
                          onClick={() => copy(c.email!)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--copilot-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-soft-bg)]"
                        >
                          <Copy className="h-3 w-3" aria-hidden />
                          {copied === c.email ? "Copiado" : "Copiar"}
                        </button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Teléfono / WhatsApp del cliente */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--copilot-border)] pt-3">
          <MessageCircle className="h-3.5 w-3.5 text-[var(--copilot-ink-muted)]" aria-hidden />
          {summary.phone ? (
            <span className="text-sm text-[var(--copilot-ink)]">
              {waPhone?.isValid ? waPhone.display : summary.phone}
            </span>
          ) : (
            <span className="text-sm text-[var(--copilot-ink-muted)]">Sin WhatsApp cargado</span>
          )}
          {waPhone?.isValid ? (
            <a
              href={waPhone.waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--copilot-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-soft-bg)]"
            >
              <MessageCircle className="h-3 w-3" aria-hidden />
              WhatsApp
            </a>
          ) : null}
        </div>
      </CopilotCard>
    </div>
  );
}
