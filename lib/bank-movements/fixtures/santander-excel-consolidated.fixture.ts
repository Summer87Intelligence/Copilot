import * as XLSX from "xlsx";

import { SANTANDER_CONSOLIDATED_SHEET_NAME } from "@/lib/bank-movements/santander-excel-consolidated-parser";

export type SantanderConsolidatedFixtureRow = {
  fecha: string;
  referencia?: string;
  tipoConcepto: string;
  descripcion?: string;
  debito?: string;
  credito?: string;
  importeNeto?: string;
  saldo?: string;
  moneda: "UYU" | "USD";
  cuenta: string;
  archivosOrigen?: string;
};

const UYU_HEADERS = [
  "Fecha",
  "Referencia",
  "Tipo Movimiento / Concepto",
  "Descripción",
  "Débito",
  "Crédito",
  "Importe neto",
  "Saldo",
  "Moneda",
  "Cuenta",
  "Archivos origen",
];

const USD_HEADERS = [
  "Fecha",
  "Referencia",
  "Tipo Movimiento / Concepto",
  "Descripción",
  "Débito USD",
  "Crédito USD",
  "Importe neto USD",
  "Saldo USD",
  "Moneda",
  "Cuenta",
  "Archivos origen",
];

function rowToCells(row: SantanderConsolidatedFixtureRow, currency: "UYU" | "USD"): string[] {
  const debitCol = currency === "USD" ? row.debito ?? "" : row.debito ?? "";
  const creditCol = currency === "USD" ? row.credito ?? "" : row.credito ?? "";
  const netCol = row.importeNeto ?? "";
  const saldoCol = row.saldo ?? "";
  return [
    row.fecha,
    row.referencia ?? "",
    row.tipoConcepto,
    row.descripcion ?? "",
    debitCol,
    creditCol,
    netCol,
    saldoCol,
    row.moneda,
    row.cuenta,
    row.archivosOrigen ?? "",
  ];
}

export function buildSantanderConsolidatedExcelBuffer(input: {
  currency: "UYU" | "USD";
  accountNumber: string;
  rows: SantanderConsolidatedFixtureRow[];
}): Buffer {
  const headers = input.currency === "USD" ? USD_HEADERS : UYU_HEADERS;
  const sheetRows = [
    headers,
    ...input.rows.map((row) =>
      rowToCells(
        {
          ...row,
          moneda: input.currency,
          cuenta: input.accountNumber,
        },
        input.currency
      )
    ),
  ];

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(workbook, sheet, SANTANDER_CONSOLIDATED_SHEET_NAME);
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

export const SANTANDER_CONSOLIDATED_UYU_ROWS: SantanderConsolidatedFixtureRow[] = [
  {
    fecha: "01/07/2026",
    referencia: "REF001",
    tipoConcepto: "Transferencia recibida",
    descripcion: "Detalle transferencia cliente A",
    credito: "1.500,00",
    importeNeto: "1.500,00",
    saldo: "10.500,00",
    moneda: "UYU",
    cuenta: "000001211749",
    archivosOrigen: "julio-uyu-1.pdf",
  },
  {
    fecha: "02/07/2026",
    referencia: "ZETA001",
    tipoConcepto: "Pago ZETA",
    descripcion: "Factura servicios",
    debito: "3.721,00",
    importeNeto: "-3.721,00",
    saldo: "6.779,00",
    moneda: "UYU",
    cuenta: "000001211749",
    archivosOrigen: "julio-uyu-2.pdf",
  },
  {
    fecha: "03/07/2026",
    referencia: "REF003",
    tipoConcepto: "Comisión mantenimiento",
    debito: "250,00",
    importeNeto: "-250,00",
    saldo: "6.529,00",
    moneda: "UYU",
    cuenta: "000001211749",
    archivosOrigen: "julio-uyu-2.pdf",
  },
];

export const SANTANDER_CONSOLIDATED_USD_ROWS: SantanderConsolidatedFixtureRow[] = [
  {
    fecha: "05/07/2026",
    referencia: "USD001",
    tipoConcepto: "Wire transfer",
    credito: "2.000,00",
    importeNeto: "2.000,00",
    saldo: "12.000,00",
    moneda: "USD",
    cuenta: "005205831977",
    archivosOrigen: "julio-usd-1.pdf",
  },
  {
    fecha: "06/07/2026",
    referencia: "USD002",
    tipoConcepto: "SWIFT fee",
    debito: "35,00",
    importeNeto: "-35,00",
    saldo: "11.965,00",
    moneda: "USD",
    cuenta: "005205831977",
    archivosOrigen: "julio-usd-1.pdf",
  },
];

export function buildSantanderConsolidatedUyuFixtureBuffer(): Buffer {
  return buildSantanderConsolidatedExcelBuffer({
    currency: "UYU",
    accountNumber: "000001211749",
    rows: SANTANDER_CONSOLIDATED_UYU_ROWS,
  });
}

export function buildSantanderConsolidatedUsdFixtureBuffer(): Buffer {
  return buildSantanderConsolidatedExcelBuffer({
    currency: "USD",
    accountNumber: "005205831977",
    rows: SANTANDER_CONSOLIDATED_USD_ROWS,
  });
}
