export type CollectionAccountStatementCurrency = "UYU" | "USD";

export type CollectionAccountStatementAttachment = {
  currency: CollectionAccountStatementCurrency;
  label: string;
  pdfUrl: string;
  downloadFilename: string;
};

export type BuildCollectionAccountStatementAttachmentsInput = {
  companyId: string;
  clientName: string;
  debtUyu: number;
  debtUsd: number;
  /** YYYY-MM-DD; default: 1 ene del año actual */
  from?: string;
  /** YYYY-MM-DD; default: hoy */
  to?: string;
  /** YYYY-MM-DD para nombre de archivo; default: hoy */
  fileDate?: string;
};

export function slugifyClientNameForFilename(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "cliente";
}

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function yearStartYmd(ref: string): string {
  return `${ref.slice(0, 4)}-01-01`;
}

export function buildAccountStatementPdfUrl(
  companyId: string,
  currency: CollectionAccountStatementCurrency,
  from: string,
  to: string
): string {
  const params = new URLSearchParams({ currency, from, to });
  return `/api/copilot/clientes/${encodeURIComponent(companyId)}/account-statement.pdf?${params.toString()}`;
}

export function buildAccountStatementDownloadFilename(
  clientName: string,
  currency: CollectionAccountStatementCurrency,
  fileDate: string
): string {
  const slug = slugifyClientNameForFilename(clientName);
  return `estado-cuenta-${slug}-${currency.toLowerCase()}-${fileDate}.pdf`;
}

/**
 * Resuelve qué PDFs de estado de cuenta sugerir según deuda vigente por moneda.
 * Usa balances reales (debtUyu / debtUsd), no texto visible ni moneda del mensaje.
 */
export function buildCollectionAccountStatementAttachments(
  input: BuildCollectionAccountStatementAttachmentsInput
): CollectionAccountStatementAttachment[] {
  const fileDate = input.fileDate ?? todayYmd();
  const from = input.from ?? yearStartYmd(fileDate);
  const to = input.to ?? fileDate;
  const attachments: CollectionAccountStatementAttachment[] = [];

  if (input.debtUyu > 0) {
    attachments.push({
      currency: "UYU",
      label: "Estado de cuenta UYU",
      pdfUrl: buildAccountStatementPdfUrl(input.companyId, "UYU", from, to),
      downloadFilename: buildAccountStatementDownloadFilename(
        input.clientName,
        "UYU",
        fileDate
      ),
    });
  }

  if (input.debtUsd > 0) {
    attachments.push({
      currency: "USD",
      label: "Estado de cuenta USD",
      pdfUrl: buildAccountStatementPdfUrl(input.companyId, "USD", from, to),
      downloadFilename: buildAccountStatementDownloadFilename(
        input.clientName,
        "USD",
        fileDate
      ),
    });
  }

  return attachments;
}

export function collectionAttachmentChannelHint(
  channel: "whatsapp" | "email"
): string {
  if (channel === "whatsapp") {
    return "Para WhatsApp, descargá el PDF y adjuntalo manualmente al enviar el mensaje.";
  }
  return "Para email, descargá el PDF y adjuntalo antes de enviar.";
}
