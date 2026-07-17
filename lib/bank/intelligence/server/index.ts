/**
 * Capa server-side shadow de inteligencia bancaria.
 * FASE BANK-SHADOW-SERVER-IMPLEMENTATION-001
 */

export * from "@/lib/bank/intelligence/server/types";
export * from "@/lib/bank/intelligence/server/guards";
export * from "@/lib/bank/intelligence/server/money";
export {
  resolveShadowScope,
  resolveShadowMode,
  runBankShadowIntelligence,
  ShadowScopeError,
} from "@/lib/bank/intelligence/server/runner";
export {
  buildShadowProposalFromContext,
  filterContextToWorkspace,
  applyReceiptCollisionPolicy,
} from "@/lib/bank/intelligence/server/suggestion-service";
export {
  decideShadowPersistAction,
  hasInsufficientEvidence,
  isIdenticalSuggestion,
  isSubstantialSuggestionChange,
} from "@/lib/bank/intelligence/server/shadow-persistence";
export {
  applyShadowPersistDecision,
  createSupabaseShadowPersistPorts,
  emptyPersistStats,
} from "@/lib/bank/intelligence/server/shadow-persist-apply";
