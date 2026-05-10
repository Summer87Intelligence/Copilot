export type DataCompletenessWarning = {
  isTruncated: boolean;
  rowCap: number | null;
  returnedRows: number;
  totalRows?: number | null;
  warningCode?: "ROW_CAP_REACHED" | "PARTIAL_DATASET" | "UNKNOWN_TOTAL";
  warningMessage?: string;
};

export function buildCapWarning(returnedRows: number, rowCap: number): DataCompletenessWarning {
  const isTruncated = returnedRows >= rowCap;
  return {
    isTruncated,
    rowCap,
    returnedRows,
    totalRows: null,
    warningCode: isTruncated ? "ROW_CAP_REACHED" : undefined,
    warningMessage: isTruncated
      ? `Los datos pueden estar incompletos porque se alcanzó el límite máximo de ${rowCap} filas procesadas.`
      : undefined,
  };
}
