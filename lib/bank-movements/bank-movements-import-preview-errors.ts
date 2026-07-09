/**
 * Mensajes de error accionables para preview de importación bancaria.
 */

export const BANK_STATEMENT_PREVIEW_FALLBACK_ERROR =
  "No pudimos leer este archivo. Revisá que sea un PDF o Excel consolidado de Santander con tabla de movimientos.";

const FILE_ERROR_PREFIX = "No pudimos leer este archivo:";

export function formatBankStatementPreviewFileError(reason: string): string {
  return `${FILE_ERROR_PREFIX} ${reason}`;
}

export function mapBankStatementPreviewError(err: unknown): string {
  const code = err instanceof Error ? err.message : String(err ?? "");

  switch (code) {
    case "NOT_CONSOLIDATED":
      return formatBankStatementPreviewFileError(
        'no encontramos la hoja "Movimientos consolidados" ni columnas requeridas.'
      );
    case "NO_MOVEMENTS":
    case "EMPTY_FILE":
      return formatBankStatementPreviewFileError("no encontramos movimientos en el archivo.");
    case "PDF_READ_FAILED":
      return formatBankStatementPreviewFileError("no pudimos leer el PDF.");
    case "PARSE_FAILED":
      return formatBankStatementPreviewFileError("no reconocemos el formato del extracto PDF.");
    case "UNSUPPORTED":
      return formatBankStatementPreviewFileError("el tipo de archivo no es compatible.");
    case "EXCEL_READ_FAILED":
      return formatBankStatementPreviewFileError("no pudimos leer el archivo Excel.");
    default:
      if (/xlsx|excel|sheet|workbook/i.test(code)) {
        return formatBankStatementPreviewFileError("no pudimos leer el archivo Excel.");
      }
      return BANK_STATEMENT_PREVIEW_FALLBACK_ERROR;
  }
}

export function buildBulkPreviewFailureSummary(
  parsedCount: number,
  errorsCount: number
): string | null {
  if (parsedCount === 0 && errorsCount > 0) {
    return "No pudimos leer ninguno de los archivos seleccionados.";
  }
  return null;
}

export function resolveBankImportPreviewHttpError(input: {
  status: number;
  jsonOk: boolean;
  jsonError?: string;
  bodyParseFailed: boolean;
}): string {
  if (input.bodyParseFailed) {
    if (input.status >= 500) {
      return "El servidor no pudo procesar los extractos. Intentá de nuevo en unos segundos.";
    }
    if (input.status >= 400) {
      return `No pudimos leer los extractos (error ${input.status}).`;
    }
    return "La respuesta del servidor no fue válida. Intentá de nuevo.";
  }

  if (!input.jsonOk) {
    return input.jsonError ?? "No pudimos leer los extractos.";
  }

  return "No pudimos leer los extractos.";
}
