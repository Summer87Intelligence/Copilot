export type BankImportAuthMode = "read" | "write";

/** apply=true persiste movimientos; requiere superadmin. Cualquier otro valor es preview. */
export function resolveBankImportAuthMode(apply: boolean | undefined): BankImportAuthMode {
  return apply === true ? "write" : "read";
}
