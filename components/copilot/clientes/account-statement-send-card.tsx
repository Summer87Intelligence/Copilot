"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, Copy, Mail, MessageCircle } from "lucide-react";
import { CopilotCard, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { CollectionSuggestedAttachments } from "@/components/copilot/clientes/collection-suggested-attachments";
import { buildAccountStatementMessage } from "@/lib/account-statement/build-account-statement-message";
import { buildCollectionAccountStatementAttachments } from "@/lib/account-statement/build-collection-account-statement-attachments";
import { COLLECTION_UX } from "@/lib/copilot-collection-ux-copy";
import {
  buildAccountStatementFollowupPrefill,
  type CollectionFollowupInitialValues,
} from "@/lib/account-statement/build-account-statement-followup-prefill";
import {
  normalizeUruguayPhoneForWhatsApp,
  buildWhatsAppHref,
} from "@/lib/phone/normalize-phone-for-whatsapp";

type Channel = "email" | "whatsapp";
type Tone = "friendly" | "firm" | "brief";
type LastAction = "copied" | "emailed" | "whatsapped";

type Props = {
  companyId: string;
  clientName: string;
  email: string | null;
  phone: string | null | undefined;
  debtUyu: number;
  debtUsd: number;
  overdueUyu: number;
  overdueUsd: number;
  onSuggestFollowup?: (prefill: CollectionFollowupInitialValues) => void;
};

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const CHANNEL_LABELS: Record<Channel, string> = { email: "Email", whatsapp: "WhatsApp" };
const TONE_LABELS: Record<Tone, string> = { friendly: "Amable", firm: "Firme", brief: "Breve" };
const CURRENCY_LABELS = { UYU: "Pesos (UYU)", USD: "Dólares (USD)" };

export function AccountStatementSendCard({
  companyId,
  clientName,
  email,
  phone,
  debtUyu,
  debtUsd,
  overdueUyu,
  overdueUsd,
  onSuggestFollowup,
}: Props) {
  const [channel, setChannel] = useState<Channel>("email");
  const [tone, setTone] = useState<Tone>("friendly");
  const [currency, setCurrency] = useState<"UYU" | "USD">("UYU");
  const [copied, setCopied] = useState(false);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);

  const today = todayYmd();
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const phoneResult = useMemo(
    () => (phone ? normalizeUruguayPhoneForWhatsApp(phone) : null),
    [phone]
  );

  const canEmail = Boolean(email);
  const canWhatsApp = phoneResult?.isValid === true;

  const message = useMemo(
    () =>
      buildAccountStatementMessage({
        clientName,
        periodFrom: yearStart,
        periodTo: today,
        currency,
        debtAmount: currency === "UYU" ? debtUyu : debtUsd,
        overdueAmount: currency === "UYU" ? overdueUyu : overdueUsd,
        channel,
        tone,
      }),
    [clientName, yearStart, today, currency, debtUyu, debtUsd, overdueUyu, overdueUsd, channel, tone]
  );

  const suggestedAttachments = useMemo(
    () =>
      buildCollectionAccountStatementAttachments({
        companyId,
        clientName,
        debtUyu,
        debtUsd,
        from: yearStart,
        to: today,
        fileDate: today,
      }),
    [companyId, clientName, debtUyu, debtUsd, yearStart, today]
  );

  const handleCopy = useCallback(() => {
    const text = message.subject ? `${message.subject}\n\n${message.body}` : message.body;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setLastAction("copied");
      setTimeout(() => setCopied(false), 2000);
    });
  }, [message]);

  const mailtoHref = useMemo(() => {
    if (!canEmail || !email) return null;
    const params = new URLSearchParams({
      subject: message.subject ?? "",
      body: message.body,
    });
    return `mailto:${email}?${params.toString()}`;
  }, [canEmail, email, message]);

  const waHref = useMemo(() => {
    if (!canWhatsApp || !phoneResult?.digits) return null;
    return buildWhatsAppHref(`+${phoneResult.digits}`, message.body);
  }, [canWhatsApp, phoneResult, message.body]);

  const handleSuggestFollowup = useCallback(() => {
    if (!onSuggestFollowup || !lastAction) return;
    onSuggestFollowup(
      buildAccountStatementFollowupPrefill({
        lastAction,
        channel,
        periodFrom: yearStart,
        periodTo: today,
        currency,
      })
    );
  }, [onSuggestFollowup, lastAction, channel, yearStart, today, currency]);

  return (
    <CopilotCard>
      <CopilotSectionTitle
        title="Enviar estado de cuenta"
        subtitle="Generá un mensaje para enviar junto con el PDF descargado."
      />

      {/* Canal */}
      <div className="mt-4">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Canal
        </p>
        <div className="flex gap-2">
          {(["email", "whatsapp"] as Channel[]).map((c) => (
            <button
              key={c}
              onClick={() => setChannel(c)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                channel === c
                  ? "bg-[var(--copilot-accent)] text-white"
                  : "bg-[var(--copilot-surface-alt)] text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-border)]"
              }`}
            >
              {CHANNEL_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      {/* Moneda */}
      <div className="mt-3">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Moneda
        </p>
        <div className="flex gap-2">
          {(["UYU", "USD"] as const).map((cur) => (
            <button
              key={cur}
              onClick={() => setCurrency(cur)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                currency === cur
                  ? "bg-[var(--copilot-accent)] text-white"
                  : "bg-[var(--copilot-surface-alt)] text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-border)]"
              }`}
            >
              {CURRENCY_LABELS[cur]}
            </button>
          ))}
        </div>
      </div>

      {/* Tono */}
      <div className="mt-3">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Tono
        </p>
        <div className="flex gap-2">
          {(["friendly", "firm", "brief"] as Tone[]).map((t) => (
            <button
              key={t}
              onClick={() => setTone(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                tone === t
                  ? "bg-[var(--copilot-accent)] text-white"
                  : "bg-[var(--copilot-surface-alt)] text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-border)]"
              }`}
            >
              {TONE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="mt-4 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface-alt)] p-3">
        {message.subject && (
          <p className="mb-1.5 text-xs font-semibold text-[var(--copilot-ink)]">
            Asunto: {message.subject}
          </p>
        )}
        <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-[var(--copilot-ink)]">
          {message.body}
        </pre>
      </div>

      <div className="mt-3">
        <CollectionSuggestedAttachments
          attachments={suggestedAttachments}
          channel={channel}
        />
      </div>

      {/* Warning */}
      <div className="mt-3 space-y-1.5 rounded-lg bg-[var(--copilot-tone-warning-bg)]/90 px-2.5 py-2 text-[11px] leading-relaxed text-[var(--copilot-warning-text-strong)]">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{COLLECTION_UX.noAutoSend}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-3 py-1.5 text-xs font-medium text-[var(--copilot-ink)] transition-colors hover:bg-[var(--copilot-surface-alt)]"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {copied ? "Copiado" : "Copiar mensaje"}
        </button>

        {mailtoHref ? (
          <a
            href={mailtoHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setLastAction("emailed")}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-3 py-1.5 text-xs font-medium text-[var(--copilot-ink)] transition-colors hover:bg-[var(--copilot-surface-alt)]"
          >
            <Mail className="h-3.5 w-3.5" aria-hidden />
            Abrir email
          </a>
        ) : (
          <span
            title={email ? undefined : "El cliente no tiene email registrado"}
            className="flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] px-3 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] opacity-50"
          >
            <Mail className="h-3.5 w-3.5" aria-hidden />
            Abrir email
          </span>
        )}

        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setLastAction("whatsapped")}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-3 py-1.5 text-xs font-medium text-[var(--copilot-ink)] transition-colors hover:bg-[var(--copilot-surface-alt)]"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            Abrir WhatsApp
          </a>
        ) : (
          <span
            title={
              phone
                ? phoneResult?.reason ?? "Número no apto para WhatsApp"
                : "El cliente no tiene teléfono registrado"
            }
            className="flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] px-3 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] opacity-50"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            Abrir WhatsApp
          </span>
        )}
      </div>

      {/* Post-action followup callout */}
      {lastAction && onSuggestFollowup ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface-alt)] px-3 py-2.5">
          <p className="text-xs text-[var(--copilot-ink-muted)]">
            ¿Querés registrar esta gestión en cobranza?
          </p>
          <button
            type="button"
            onClick={handleSuggestFollowup}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--copilot-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--copilot-accent)] transition hover:bg-[var(--copilot-accent-soft)]"
          >
            <ClipboardList className="h-3.5 w-3.5" aria-hidden />
            Registrar gestión
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-[var(--copilot-ink-muted)]">
          Después de enviar, registrá el resultado en{" "}
          <span className="font-medium text-[var(--copilot-ink)]">Gestión de cobranza</span>.
        </p>
      )}
    </CopilotCard>
  );
}
