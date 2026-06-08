"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Mail, MessageCircle, ShieldCheck } from "lucide-react";

import { CollectionSuggestedAttachments } from "@/components/copilot/clientes/collection-suggested-attachments";
import {
  buildCollectionAccountStatementAttachments,
} from "@/lib/account-statement/build-collection-account-statement-attachments";
import {
  buildCollectionMessage,
  type CollectionMessageChannel,
  type CollectionMessageSuggestion,
  type CollectionMessageTone,
} from "@/lib/copilot-agents/build-collection-message";
import {
  buildWhatsAppHref,
  normalizeUruguayPhoneForWhatsApp,
} from "@/lib/phone/normalize-phone-for-whatsapp";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  companyId: string;
  clientName: string;
  debtUyu: number;
  debtUsd: number;
  overdueUyu: number;
  overdueUsd: number;
  contactEmail: string | null;
  phone: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveAmount(
  overdueUyu: number,
  overdueUsd: number,
  debtUyu: number,
  debtUsd: number
): { amount?: number; currency?: "UYU" | "USD" } {
  if (overdueUyu > 0) return { amount: overdueUyu, currency: "UYU" };
  if (overdueUsd > 0) return { amount: overdueUsd, currency: "USD" };
  if (debtUyu > 0) return { amount: debtUyu, currency: "UYU" };
  if (debtUsd > 0) return { amount: debtUsd, currency: "USD" };
  return {};
}

function buildMailtoHref(email: string, suggestion: CollectionMessageSuggestion): string {
  const subject = encodeURIComponent(suggestion.subject ?? "Consulta por saldo pendiente");
  const body = encodeURIComponent(suggestion.body);
  return `mailto:${email}?subject=${subject}&body=${body}`;
}

// ─── Pill button ──────────────────────────────────────────────────────────────

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[12px] font-medium transition ${
        active
          ? "border-[var(--copilot-accent)] bg-[var(--copilot-accent)] text-white"
          : "border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] text-[var(--copilot-ink-muted)] hover:border-[var(--copilot-accent)]/40"
      }`}
    >
      {label}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CollectionMessageAssistant({
  companyId,
  clientName,
  debtUyu,
  debtUsd,
  overdueUyu,
  overdueUsd,
  contactEmail,
  phone,
}: Props) {
  const waPhone = normalizeUruguayPhoneForWhatsApp(phone);
  const hasDebt = debtUyu > 0 || debtUsd > 0;

  const suggestedAttachments = useMemo(
    () =>
      buildCollectionAccountStatementAttachments({
        companyId,
        clientName,
        debtUyu,
        debtUsd,
      }),
    [companyId, clientName, debtUyu, debtUsd]
  );

  const [channel, setChannel] = useState<CollectionMessageChannel>("whatsapp");
  const [tone, setTone] = useState<CollectionMessageTone>("friendly");
  const [suggestion, setSuggestion] = useState<CollectionMessageSuggestion | null>(null);
  const [copied, setCopied] = useState(false);

  if (!hasDebt) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-[var(--copilot-border)]/60 bg-[rgba(44,40,37,0.02)] px-5 py-4">
        <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)]/50" aria-hidden />
        <div>
          <p className="text-[13px] font-semibold text-[var(--copilot-ink)]">Asistente de cobranza</p>
          <p className="mt-0.5 text-[12px] text-[var(--copilot-ink-muted)]">
            Este cliente no tiene deuda pendiente. No hace falta generar mensaje de cobranza.
          </p>
        </div>
      </div>
    );
  }

  const amountFields = resolveAmount(overdueUyu, overdueUsd, debtUyu, debtUsd);

  const generate = () => {
    const msg = buildCollectionMessage({
      clientName,
      ...amountFields,
      tone,
      channel,
    });
    setSuggestion(msg);
    setCopied(false);
  };

  const copyMessage = () => {
    const text =
      suggestion?.channel === "email" && suggestion.subject
        ? `Asunto: ${suggestion.subject}\n\n${suggestion.body}`
        : (suggestion?.body ?? "");
    navigator.clipboard?.writeText(text).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-[var(--copilot-accent)]" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink)]">
          Asistente de cobranza
        </span>
      </div>
      <p className="mb-3 text-[12.5px] text-[var(--copilot-ink-muted)]">
        Generá un mensaje sugerido para contactar al cliente. Copilot no lo envía
        automáticamente.
      </p>

      {/* Controls */}
      <div className="space-y-2">
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
            Canal
          </p>
          <div className="flex flex-wrap gap-2">
            <Pill
              label="WhatsApp"
              active={channel === "whatsapp"}
              onClick={() => { setChannel("whatsapp"); setSuggestion(null); }}
            />
            <Pill
              label="Email"
              active={channel === "email"}
              onClick={() => { setChannel("email"); setSuggestion(null); }}
            />
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
            Tono
          </p>
          <div className="flex flex-wrap gap-2">
            <Pill
              label="Amable"
              active={tone === "friendly"}
              onClick={() => { setTone("friendly"); setSuggestion(null); }}
            />
            <Pill
              label="Firme"
              active={tone === "firm"}
              onClick={() => { setTone("firm"); setSuggestion(null); }}
            />
            <Pill
              label="Urgente"
              active={tone === "urgent"}
              onClick={() => { setTone("urgent"); setSuggestion(null); }}
            />
          </div>
        </div>
      </div>

      {/* Generate button */}
      <button
        type="button"
        onClick={generate}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[var(--copilot-accent)] px-4 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
      >
        <MessageCircle className="h-3.5 w-3.5" aria-hidden />
        {suggestion ? "Regenerar mensaje" : "Generar mensaje"}
      </button>

      <div className="mt-3">
        <CollectionSuggestedAttachments
          attachments={suggestedAttachments}
          channel={channel}
        />
      </div>

      {/* Generated message */}
      {suggestion && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.02)] p-4">
            {suggestion.subject && (
              <div className="mb-3 border-b border-[var(--copilot-border)]/60 pb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
                  Asunto
                </p>
                <p className="mt-0.5 text-[12.5px] font-medium text-[var(--copilot-ink)]">
                  {suggestion.subject}
                </p>
              </div>
            )}
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
              Mensaje
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--copilot-ink)]">
              {suggestion.body}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {/* Copy */}
            <button
              type="button"
              onClick={copyMessage}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-1.5 text-[12px] font-medium text-[var(--copilot-ink-muted)] transition hover:bg-[var(--copilot-soft-bg)]"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                  <span className="text-emerald-600">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  Copiar mensaje
                </>
              )}
            </button>

            {/* Email */}
            {suggestion.channel === "email" ? (
              contactEmail ? (
                <a
                  href={buildMailtoHref(contactEmail, suggestion)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-1.5 text-[12px] font-medium text-[var(--copilot-ink-muted)] transition hover:bg-[var(--copilot-soft-bg)]"
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden />
                  Enviar email
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--copilot-border)]/50 bg-[var(--copilot-card-bg)]/50 px-3 py-1.5 text-[12px] text-[var(--copilot-ink-muted)]/50">
                  <Mail className="h-3.5 w-3.5" aria-hidden />
                  Sin email cargado
                </span>
              )
            ) : null}

            {/* WhatsApp */}
            {suggestion.channel === "whatsapp" ? (
              waPhone?.isValid ? (
                <a
                  href={buildWhatsAppHref(waPhone.digits, suggestion.body)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-1.5 text-[12px] font-medium text-[var(--copilot-ink-muted)] transition hover:bg-[var(--copilot-soft-bg)]"
                >
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                  Abrir WhatsApp
                </a>
              ) : waPhone ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--copilot-border)]/50 bg-[var(--copilot-card-bg)]/50 px-3 py-1.5 text-[12px] text-[var(--copilot-ink-muted)]/50">
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                  Teléfono no utilizable para WhatsApp
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--copilot-border)]/50 bg-[var(--copilot-card-bg)]/50 px-3 py-1.5 text-[12px] text-[var(--copilot-ink-muted)]/50">
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                  Sin teléfono cargado
                </span>
              )
            ) : null}
          </div>

          {/* Safety callout */}
          <div className="flex items-start gap-2 rounded-xl border border-[var(--copilot-border)]/60 bg-[rgba(44,40,37,0.02)] px-3 py-2.5">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--copilot-ink-muted)]/60" aria-hidden />
            <p className="text-[11.5px] text-[var(--copilot-ink-muted)]">
              Los mensajes son sugerencias: no se envían solos. Revisalos antes de contactar al
              cliente. Después de contactar, registrá el resultado en Gestión de cobranza.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
