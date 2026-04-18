import { supabase } from "@/lib/supabase-client";
import {
  getProtoCompanyById as repoGetProtoCompanyById,
  getProtoInvoiceById as repoGetProtoInvoiceById,
  listProtoCompanies,
  listProtoContacts,
  listProtoContactsByCompanyId,
  listProtoInvoices,
  listProtoInvoicesByCompanyId,
  listProtoPayments,
  listProtoPaymentsByCompanyId,
  listProtoRawImports,
  listProtoReceipts,
  listProtoReceiptsByCompanyId,
  listProtoReceiptsByInvoiceId,
  listProtoTaxObligations,
  type DataRow,
} from "@/lib/data/proto-operational-read-repository";
import type { ProtoActiveListMode } from "@/lib/copilot-proto-active";

export type { CopilotDataEntityKey as DataEntity } from "@/lib/copilot-format";
export type { ProtoActiveListMode } from "@/lib/copilot-proto-active";
export type { DataRow } from "@/lib/data/proto-operational-read-repository";

export {
  mapGenericStatus,
  mapInvoiceStatus,
  mapPaymentStatus,
  mapReceiptStatus,
} from "@/lib/copilot-format";

export async function getProtoCompanies(
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return listProtoCompanies(supabase, activeMode);
}

export async function getProtoContacts(
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return listProtoContacts(supabase, activeMode);
}

export async function getProtoInvoices(
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return listProtoInvoices(supabase, activeMode);
}

export async function getProtoReceipts(
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return listProtoReceipts(supabase, activeMode);
}

export async function getProtoPayments(
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return listProtoPayments(supabase, activeMode);
}

export async function getProtoTaxObligationsRows(
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return listProtoTaxObligations(supabase, activeMode);
}

export async function getProtoRawImports(): Promise<DataRow[]> {
  return listProtoRawImports(supabase, "active");
}

export async function getProtoContactsByCompany(
  companyId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return listProtoContactsByCompanyId(supabase, companyId, activeMode);
}

export async function getProtoInvoicesByCompany(
  companyId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return listProtoInvoicesByCompanyId(supabase, companyId, activeMode);
}

export async function getProtoReceiptsByCompany(
  companyId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return listProtoReceiptsByCompanyId(supabase, companyId, activeMode);
}

export async function getProtoPaymentsByCompany(
  companyId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return listProtoPaymentsByCompanyId(supabase, companyId, activeMode);
}

export async function getProtoCompanyById(companyId: string): Promise<DataRow | null> {
  return repoGetProtoCompanyById(supabase, companyId);
}

export async function getProtoInvoiceById(invoiceId: string): Promise<DataRow | null> {
  return repoGetProtoInvoiceById(supabase, invoiceId);
}

export async function getProtoReceiptsByInvoice(
  invoiceId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return listProtoReceiptsByInvoiceId(supabase, invoiceId, activeMode);
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
