import { getCopilotDataset, invalidateCopilotDatasetCache } from "@/lib/copilot-dataset-client";
import type { ProtoActiveListMode } from "@/lib/copilot-proto-active";
import type { DataRow } from "@/lib/data/proto-operational-read-repository";

export type { CopilotDataEntityKey as DataEntity } from "@/lib/copilot-format";
export type { ProtoActiveListMode } from "@/lib/copilot-proto-active";
export type { DataRow } from "@/lib/data/proto-operational-read-repository";

export { invalidateCopilotDatasetCache };

export {
  mapGenericStatus,
  mapInvoiceStatus,
  mapPaymentStatus,
  mapReceiptStatus,
} from "@/lib/copilot-format";

function filterByCompanyId(rows: DataRow[], companyId: string): DataRow[] {
  const cid = companyId.trim();
  if (!cid) return [];
  return rows.filter((r) => String(r.company_id ?? "") === cid);
}

function filterByInvoiceId(rows: DataRow[], invoiceId: string): DataRow[] {
  const iid = invoiceId.trim();
  if (!iid) return [];
  return rows.filter((r) => String(r.invoice_id ?? "") === iid);
}

export async function getProtoCompanies(
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  const d = await getCopilotDataset(activeMode);
  return d.companies;
}

export async function getProtoContacts(
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  const d = await getCopilotDataset(activeMode);
  return d.contacts;
}

export async function getProtoInvoices(
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  const d = await getCopilotDataset(activeMode);
  return d.invoices;
}

export async function getProtoReceipts(
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  const d = await getCopilotDataset(activeMode);
  return d.receipts;
}

export async function getProtoPayments(
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  const d = await getCopilotDataset(activeMode);
  return d.payments;
}

export async function getProtoTaxObligationsRows(
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  const d = await getCopilotDataset(activeMode);
  return d.obligations;
}

export async function getProtoRawImports(): Promise<DataRow[]> {
  const d = await getCopilotDataset("active");
  return d.rawImports;
}

export async function getProtoContactsByCompany(
  companyId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  const d = await getCopilotDataset(activeMode);
  return filterByCompanyId(d.contacts, companyId);
}

export async function getProtoInvoicesByCompany(
  companyId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  const d = await getCopilotDataset(activeMode);
  return filterByCompanyId(d.invoices, companyId);
}

export async function getProtoReceiptsByCompany(
  companyId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  const d = await getCopilotDataset(activeMode);
  return filterByCompanyId(d.receipts, companyId);
}

export async function getProtoPaymentsByCompany(
  companyId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  const d = await getCopilotDataset(activeMode);
  return filterByCompanyId(d.payments, companyId);
}

export async function getProtoCompanyById(companyId: string): Promise<DataRow | null> {
  const id = companyId.trim();
  if (!id) return null;
  const d = await getCopilotDataset("all");
  return d.companies.find((r) => String(r.id ?? "") === id) ?? null;
}

export async function getProtoInvoiceById(invoiceId: string): Promise<DataRow | null> {
  const id = invoiceId.trim();
  if (!id) return null;
  const d = await getCopilotDataset("all");
  return d.invoices.find((r) => String(r.id ?? "") === id) ?? null;
}

export async function getProtoReceiptsByInvoice(
  invoiceId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  const d = await getCopilotDataset(activeMode);
  return filterByInvoiceId(d.receipts, invoiceId);
}

export const getCompanies = getProtoCompanies;
export const getContacts = getProtoContacts;
export const getInvoices = getProtoInvoices;
export const getReceipts = getProtoReceipts;
export const getPayments = getProtoPayments;
export const getContactsByCompany = getProtoContactsByCompany;
export const getInvoicesByCompany = getProtoInvoicesByCompany;
export const getReceiptsByCompany = getProtoReceiptsByCompany;
export const getPaymentsByCompany = getProtoPaymentsByCompany;
export const getCompanyById = getProtoCompanyById;
export const getReceiptsByInvoice = getProtoReceiptsByInvoice;
