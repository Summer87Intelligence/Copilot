import type { DataRow } from "@/lib/data/proto-operational-read-repository";

/** Respuesta de `GET /api/copilot/dataset`. */
export type CopilotDatasetPayload = {
  companies: DataRow[];
  contacts: DataRow[];
  invoices: DataRow[];
  receipts: DataRow[];
  payments: DataRow[];
  obligations: DataRow[];
  taxPayments: DataRow[];
  rawImports: DataRow[];
};
