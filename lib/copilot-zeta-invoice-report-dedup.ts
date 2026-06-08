import type { DataRow } from "@/lib/data/proto-operational-read-repository";
import {
  extractRegistroIdsFromInvoiceZetaMetadata,
  parseZetaLegacyRegistroIdFromInvoiceNumber,
} from "@/lib/integrations/zeta/zeta-proto-invoice-registro-match";

function getString(row: DataRow, key: string): string {
  const v = row[key];
  return typeof v === "string" ? v : "";
}

function getNumber(row: DataRow, key: string): number {
  const v = row[key];
  return typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) || 0 : 0;
}

function isCcv1InvoiceNumber(invoiceNumber: string): boolean {
  return invoiceNumber.trim().startsWith("ZETA:CCV1:");
}

function isLegacyShadowInvoiceNumber(invoiceNumber: string): boolean {
  return parseZetaLegacyRegistroIdFromInvoiceNumber(invoiceNumber) !== null;
}

function resolveRegistroReportingKey(row: DataRow): string | null {
  const fromNumber = parseZetaLegacyRegistroIdFromInvoiceNumber(getString(row, "invoice_number"));
  if (fromNumber) return fromNumber;
  const fromMeta = extractRegistroIdsFromInvoiceZetaMetadata(row.zeta_metadata);
  return fromMeta.length === 1 ? fromMeta[0]! : null;
}

function shadowFingerprint(row: DataRow): string {
  return [
    getString(row, "company_id"),
    getString(row, "issue_date"),
    getString(row, "currency_code"),
    getNumber(row, "total_amount").toFixed(2),
  ].join("|");
}

function preferInvoiceRowForReporting(a: DataRow, b: DataRow): DataRow {
  const aNum = getString(a, "invoice_number");
  const bNum = getString(b, "invoice_number");
  const aCcv1 = isCcv1InvoiceNumber(aNum);
  const bCcv1 = isCcv1InvoiceNumber(bNum);
  if (aCcv1 && !bCcv1) return a;
  if (bCcv1 && !aCcv1) return b;
  const aHasMeta = extractRegistroIdsFromInvoiceZetaMetadata(a.zeta_metadata).length > 0;
  const bHasMeta = extractRegistroIdsFromInvoiceZetaMetadata(b.zeta_metadata).length > 0;
  if (aHasMeta && !bHasMeta) return a;
  if (bHasMeta && !aHasMeta) return b;
  return a;
}

/**
 * Elimina pares CCV1 + `ZETA:{RegistroId}` duplicados (saldos legacy + voucher canónico).
 * No altera filas sin colisión de identidad.
 */
export function dedupeZetaShadowInvoicesForReporting(invoices: DataRow[]): DataRow[] {
  const byRegistro = new Map<string, DataRow>();
  const byShadowFingerprint = new Map<string, DataRow>();
  const droppedIds = new Set<string>();

  for (const row of invoices) {
    const companyId = getString(row, "company_id");
    const registroId = resolveRegistroReportingKey(row);

    if (registroId) {
      const regKey = `${companyId}:registro:${registroId}`;
      const prev = byRegistro.get(regKey);
      if (prev) {
        const keep = preferInvoiceRowForReporting(prev, row);
        const drop = keep === prev ? row : prev;
        droppedIds.add(getString(drop, "id"));
        byRegistro.set(regKey, keep);
        continue;
      }
      byRegistro.set(regKey, row);
    }

    if (isLegacyShadowInvoiceNumber(getString(row, "invoice_number"))) {
      const fp = shadowFingerprint(row);
      const prevShadow = byShadowFingerprint.get(fp);
      if (prevShadow) {
        const keep = preferInvoiceRowForReporting(prevShadow, row);
        const drop = keep === prevShadow ? row : prevShadow;
        droppedIds.add(getString(drop, "id"));
        byShadowFingerprint.set(fp, keep);
        continue;
      }
      byShadowFingerprint.set(fp, row);
    }
  }

  const ccv1ByFingerprint = new Map<string, DataRow>();
  for (const row of invoices) {
    if (droppedIds.has(getString(row, "id"))) continue;
    if (!isCcv1InvoiceNumber(getString(row, "invoice_number"))) continue;
    ccv1ByFingerprint.set(shadowFingerprint(row), row);
  }

  for (const [fp, legacyRow] of byShadowFingerprint) {
    if (droppedIds.has(getString(legacyRow, "id"))) continue;
    const ccv1 = ccv1ByFingerprint.get(fp);
    if (!ccv1) continue;
    droppedIds.add(getString(legacyRow, "id"));
  }

  if (droppedIds.size === 0) return invoices;
  return invoices.filter((row) => !droppedIds.has(getString(row, "id")));
}
