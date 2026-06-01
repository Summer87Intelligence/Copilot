export type BankImportFileType = "csv" | "xlsx" | "pdf" | "unsupported";

export const BANK_IMPORT_ERROR_MESSAGES = {
  UNSUPPORTED_FORMAT: "Formato no soportado. Subí CSV, Excel o PDF.",
  PDF_NOT_SUPPORTED:
    "PDF recibido, pero todavía no se puede leer automáticamente. Exportá CSV o Excel desde Santander para generar preview.",
  PDF_NOT_SANTANDER: "No pudimos reconocer este PDF como extracto Santander.",
  PDF_READ_FAILED:
    "No pudimos leer movimientos de este PDF. Probá exportar CSV o Excel desde Santander.",
  EMPTY_FILE: "No encontramos movimientos en el archivo.",
  COLUMNS_NOT_DETECTED:
    "No pudimos detectar fecha, descripción y monto. Revisá el formato del archivo.",
} as const;

export type BankImportParseErrorCode = keyof typeof BANK_IMPORT_ERROR_MESSAGES;

export class SantanderStatementParseError extends Error {
  readonly code: BankImportParseErrorCode;

  constructor(code: BankImportParseErrorCode) {
    super(BANK_IMPORT_ERROR_MESSAGES[code]);
    this.name = "SantanderStatementParseError";
    this.code = code;
  }
}

export function getBankImportFileType(file: { name: string; type?: string }): BankImportFileType {
  const name = file.name.trim().toLowerCase();
  const mime = (file.type ?? "").trim().toLowerCase();

  if (name.endsWith(".csv") || mime === "text/csv" || mime === "application/csv") {
    return "csv";
  }

  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    mime.includes("spreadsheetml") ||
    mime.includes("excel")
  ) {
    return "xlsx";
  }

  if (name.endsWith(".pdf") || mime === "application/pdf") {
    return "pdf";
  }

  return "unsupported";
}

export function hasRequiredSantanderColumns(headerIndex: Record<string, number>): boolean {
  const hasDate = headerIndex.movementDate != null;
  const hasDescription = headerIndex.description != null;
  const hasAmount =
    headerIndex.amount != null ||
    headerIndex.debit != null ||
    headerIndex.credit != null;
  return hasDate && hasDescription && hasAmount;
}
