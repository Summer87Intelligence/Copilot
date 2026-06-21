/** UI-only helpers compartidos (sin lógica financiera). */

export function formatLastIncomeOrigin(concept: string): string {
  const trimmed = concept.trim();
  if (/^Recibo\b/i.test(trimmed)) {
    const ref = trimmed.replace(/^Recibo\s*/i, "").trim() || trimmed;
    return `Recibo Zeta: ${ref}`;
  }
  return `Ingreso manual: ${trimmed}`;
}

export function formatLastExpenseOrigin(concept: string): string {
  const trimmed = concept.trim();
  if (/^Pago\b/i.test(trimmed)) {
    const rest = trimmed.replace(/^Pago\s*:?\s*/i, "").trim();
    return rest ? `Pago: ${rest}` : trimmed;
  }
  return `Egreso manual: ${trimmed}`;
}
