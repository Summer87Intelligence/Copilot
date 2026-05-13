import type { BankImportedFrom, BankMovementType, TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

export type SantanderParsedMovement = {
  movementDate: string;
  description: string;
  amount: number;
  currencyCode: TreasuryCurrencyCode;
  movementType: BankMovementType;
  externalId: string;
  documentNumber: string | null;
  balanceAfter: number | null;
  importedFrom: BankImportedFrom;
  rawPayload: Record<string, unknown>;
};

const HEADER_ALIASES: Record<string, string[]> = {
  movementDate: ["fecha", "date", "fecha movimiento", "fecha operacion", "fecha operación"],
  description: ["concepto", "descripcion", "descripción", "detalle", "movimiento", "glosa"],
  debit: ["debito", "débito", "debe", "importe debito", "importe débito"],
  credit: ["credito", "crédito", "haber", "importe credito", "importe crédito"],
  amount: ["importe", "monto", "amount", "valor"],
  balanceAfter: ["saldo", "balance", "saldo final"],
  documentNumber: ["documento", "nro documento", "numero", "número", "comprobante"],
  currencyCode: ["moneda", "currency", "divisa"],
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

function detectDelimiter(line: string): string {
  const semicolons = (line.match(/;/g) ?? []).length;
  const commas = (line.match(/,/g) ?? []).length;
  return semicolons >= commas ? ";" : ",";
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delimiter) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

function parseMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.abs(value);
  if (typeof value !== "string") return null;
  const cleaned = value
    .trim()
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

function parseDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Math.round((value - 25569) * 86_400_000));
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(trimmed);
  if (slash) {
    const day = slash[1]!.padStart(2, "0");
    const month = slash[2]!.padStart(2, "0");
    const year = slash[3]!.length === 2 ? `20${slash[3]}` : slash[3]!;
    return `${year}-${month}-${day}`;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

function parseCurrency(value: unknown, fallback: TreasuryCurrencyCode): TreasuryCurrencyCode {
  if (typeof value !== "string") return fallback;
  const upper = value.trim().toUpperCase();
  if (upper.includes("USD") || upper.includes("U$S") || upper === "840") return "USD";
  return "UYU";
}

function resolveHeaderIndex(headers: string[]): Record<string, number> {
  const normalized = headers.map(normalizeHeader);
  const out: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = normalized.findIndex((header) => aliases.includes(header));
    if (idx >= 0) out[field] = idx;
  }
  return out;
}

function readCell(row: string[], index: number | undefined): string {
  if (index == null) return "";
  return row[index] ?? "";
}

function buildExternalId(input: {
  movementDate: string;
  description: string;
  amount: number;
  movementType: BankMovementType;
  documentNumber: string | null;
}): string {
  const base = [
    input.movementDate,
    input.movementType,
    input.amount.toFixed(2),
    input.description.trim().toLowerCase().slice(0, 80),
    input.documentNumber ?? "",
  ].join("|");
  let hash = 0;
  for (let i = 0; i < base.length; i += 1) {
    hash = (hash * 31 + base.charCodeAt(i)) >>> 0;
  }
  return `santander:${input.movementDate}:${input.movementType}:${input.amount.toFixed(2)}:${hash.toString(16)}`;
}

function rowToMovement(
  row: string[],
  headerIndex: Record<string, number>,
  fallbackCurrency: TreasuryCurrencyCode
): SantanderParsedMovement | null {
  const movementDate = parseDate(readCell(row, headerIndex.movementDate));
  const description = readCell(row, headerIndex.description).trim();
  const debit = parseMoney(readCell(row, headerIndex.debit));
  const credit = parseMoney(readCell(row, headerIndex.credit));
  const genericAmount = parseMoney(readCell(row, headerIndex.amount));
  const amount = debit ?? credit ?? genericAmount;
  if (!movementDate || !description || amount == null || amount <= 0) return null;

  const movementType: BankMovementType =
    debit != null && debit > 0 ? "debit" : credit != null && credit > 0 ? "credit" : "debit";
  const currencyCode = parseCurrency(readCell(row, headerIndex.currencyCode), fallbackCurrency);
  const balanceAfter = parseMoney(readCell(row, headerIndex.balanceAfter));
  const documentNumber = readCell(row, headerIndex.documentNumber).trim() || null;
  const externalId = buildExternalId({
    movementDate,
    description,
    amount,
    movementType,
    documentNumber,
  });

  return {
    movementDate,
    description,
    amount,
    currencyCode,
    movementType,
    externalId,
    documentNumber,
    balanceAfter,
    importedFrom: "csv",
    rawPayload: Object.fromEntries(
      Object.entries(headerIndex).map(([field, index]) => [field, row[index] ?? ""])
    ),
  };
}

export function parseSantanderCsvText(
  text: string,
  fallbackCurrency: TreasuryCurrencyCode = "UYU"
): SantanderParsedMovement[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]!);
  const headers = splitCsvLine(lines[0]!, delimiter);
  const headerIndex = resolveHeaderIndex(headers);
  const out: SantanderParsedMovement[] = [];

  for (const line of lines.slice(1)) {
    const row = splitCsvLine(line, delimiter);
    const movement = rowToMovement(row, headerIndex, fallbackCurrency);
    if (movement) out.push(movement);
  }

  return out;
}

export async function parseSantanderStatementFile(
  file: File,
  fallbackCurrency: TreasuryCurrencyCode = "UYU"
): Promise<SantanderParsedMovement[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    if (rows.length < 2) return [];
    const headers = rows[0]!.map((cell) => String(cell ?? ""));
    const headerIndex = resolveHeaderIndex(headers);
    const out: SantanderParsedMovement[] = [];
    for (const row of rows.slice(1)) {
      const cells = row.map((cell) => String(cell ?? ""));
      const movement = rowToMovement(cells, headerIndex, fallbackCurrency);
      if (!movement) continue;
      out.push({ ...movement, importedFrom: "csv", rawPayload: { ...movement.rawPayload, source: "xlsx" } });
    }
    return out;
  }

  const text = await file.text();
  return parseSantanderCsvText(text, fallbackCurrency);
}
