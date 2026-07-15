/**
 * Capa de transición canónica de Tesorería (FASE-4). Barrel público.
 *
 * Punto único de adaptación entre Tesorería y las fuentes legacy/canónicas.
 * Ver docs/technical/treasury-canonical-migration.md.
 */
export {
  loadTreasuryCashflowBankMovements,
  buildTreasuryLegacyBankSnapshot,
  type TreasuryBankCashflowSource,
} from "@/lib/treasury/canonical/treasury-bank-source";
