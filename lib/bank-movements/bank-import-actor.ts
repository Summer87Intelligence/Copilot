/**
 * Presentación canónica del actor de una importación bancaria.
 * El UUID técnico puede vivir en `imported_by` / `id`; nunca como texto principal de UI.
 */

export type BankImportActorKind = "user" | "system" | "deleted" | "unknown" | "legacy";

export type BankImportActorView = {
  id: string | null;
  displayName: string;
  email: string | null;
  kind: BankImportActorKind;
};

/** UUID v1–v5 (forma canónica). */
export const BANK_IMPORT_ACTOR_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SYSTEM_TOKENS = new Set([
  "system",
  "sistema",
  "automatic",
  "automatico",
  "automático",
  "cron",
  "proceso-automatico",
  "proceso_automatico",
  "proceso automatico",
  "internal",
  "bot",
]);

export type ResolvedUserForImportActor = {
  id: string;
  fullName: string | null;
  email: string | null;
  deletedAt?: string | null;
  isActive?: boolean | null;
};

export function isBankImportActorUuid(value: string): boolean {
  return BANK_IMPORT_ACTOR_UUID_RE.test(value.trim());
}

/** True si el texto principal es (casi) solo un UUID — no debe renderizarse así en UI. */
export function isUuidAsPrimaryActorLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  const trimmed = label.trim();
  if (isBankImportActorUuid(trimmed)) return true;
  // Algunos renders concatenan solo el id.
  return BANK_IMPORT_ACTOR_UUID_RE.test(trimmed.replace(/^·\s*/, ""));
}

function metaString(meta: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!meta) return null;
  const raw = meta[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function isSystemToken(value: string): boolean {
  const key = value.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return SYSTEM_TOKENS.has(key);
}

function isAutomaticMetadata(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta) return false;
  const source = metaString(meta, "source") ?? metaString(meta, "import_source") ?? metaString(meta, "actor_kind");
  if (source && isSystemToken(source)) return true;
  if (meta.automatic === true || meta.is_automatic === true || meta.system === true) return true;
  return false;
}

/**
 * Construye el view model de actor a partir de `imported_by` + metadata + perfil resuelto (batch).
 * No consulta DB.
 */
export function buildBankImportActorView(input: {
  importedBy: string | null | undefined;
  metadata?: Record<string, unknown> | null;
  resolved?: ResolvedUserForImportActor | null;
}): BankImportActorView {
  const raw = typeof input.importedBy === "string" ? input.importedBy.trim() : "";
  const meta = (input.metadata ?? null) as Record<string, unknown> | null;
  const metaName =
    metaString(meta, "imported_by_name") ??
    metaString(meta, "actor_name") ??
    metaString(meta, "imported_by_full_name");
  const metaEmail =
    metaString(meta, "imported_by_email") ??
    metaString(meta, "actor_email");

  if (!raw) {
    if (isAutomaticMetadata(meta)) {
      return { id: null, displayName: "Proceso automático", email: null, kind: "system" };
    }
    if (metaName) {
      return { id: null, displayName: metaName, email: metaEmail, kind: "legacy" };
    }
    if (metaEmail) {
      return { id: null, displayName: metaEmail, email: metaEmail, kind: "legacy" };
    }
    return { id: null, displayName: "Usuario no disponible", email: null, kind: "unknown" };
  }

  if (isSystemToken(raw) || isAutomaticMetadata(meta)) {
    return {
      id: isBankImportActorUuid(raw) ? raw : null,
      displayName: "Proceso automático",
      email: null,
      kind: "system",
    };
  }

  if (!isBankImportActorUuid(raw)) {
    // Legacy: nombre o email guardado directamente en imported_by.
    const email = raw.includes("@") ? raw : metaEmail;
    return {
      id: null,
      displayName: raw,
      email: email && email !== raw ? email : email === raw ? raw : metaEmail,
      kind: "legacy",
    };
  }

  const resolved = input.resolved;
  if (resolved?.deletedAt) {
    return {
      id: raw,
      displayName: "Usuario eliminado",
      email: null,
      kind: "deleted",
    };
  }

  if (resolved) {
    const fullName = resolved.fullName?.trim() || null;
    const email = resolved.email?.trim() || metaEmail;
    if (fullName) {
      return { id: raw, displayName: fullName, email, kind: "user" };
    }
    if (email) {
      return { id: raw, displayName: email, email, kind: "user" };
    }
  }

  if (metaName) {
    return { id: raw, displayName: metaName, email: metaEmail, kind: "user" };
  }
  if (metaEmail) {
    return { id: raw, displayName: metaEmail, email: metaEmail, kind: "user" };
  }

  // UUID en DB sin perfil visible: no mostrar el id.
  return {
    id: raw,
    displayName: "Usuario del sistema",
    email: null,
    kind: "unknown",
  };
}
