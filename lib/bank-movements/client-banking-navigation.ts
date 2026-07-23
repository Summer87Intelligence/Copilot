/**
 * FASE BANK-IDEMPOTENT-IMPORT-CLIENT-BANKING-HISTORY-001
 * Enlace seguro Banco → Cliente 360 (Identificación bancaria).
 */
export function buildClientBankingHref(input: {
  clientCompanyId: string;
  /** Query string de retorno (sin ?), p.ej. tab=movimientos&movementId=... */
  returnTo?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("tab", "identificacion");
  if (input.returnTo && input.returnTo.trim()) {
    params.set("returnTo", input.returnTo.trim());
  }
  return `/copilot/clientes/${input.clientCompanyId}?${params.toString()}`;
}

export function buildBankReturnToQuery(input: {
  tab?: string | null;
  movementId?: string | null;
  duplicates?: string | null;
  text?: string | null;
}): string {
  const params = new URLSearchParams();
  if (input.tab) params.set("tab", input.tab);
  if (input.movementId) params.set("movementId", input.movementId);
  if (input.duplicates) params.set("duplicates", input.duplicates);
  if (input.text) params.set("q", input.text);
  return params.toString();
}
