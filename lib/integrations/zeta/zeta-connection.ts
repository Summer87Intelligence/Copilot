import type {
  ZetaCompanyCredentials,
  ZetaConnectionBlock,
  ZetaDeveloperCredentials,
  ZetaStaticCredentials,
} from "@/lib/integrations/zeta/zeta-connection-types";

export class ZetaConfigurationError extends Error {
  readonly code = "ZETA_CONFIG";

  constructor(message: string) {
    super(message);
    this.name = "ZetaConfigurationError";
  }
}

/**
 * Construye el bloque JSON `Connection` tal como lo exige ZetaSoftware en el body.
 * No incluye `UsuarioCodigo` / `UsuarioClave` (no utilizados).
 */
export function buildZetaConnectionBlock(
  dev: ZetaDeveloperCredentials,
  company: ZetaCompanyCredentials
): ZetaConnectionBlock {
  const dc = dev.desarrolladorCodigo.trim();
  const dk = dev.desarrolladorClave.trim();
  const ec = company.empresaCodigo.trim();
  const ek = company.empresaClave.trim();
  const rol = company.rolCodigo.trim();

  if (!dc) throw new ZetaConfigurationError("DesarrolladorCodigo vacío.");
  if (!dk) throw new ZetaConfigurationError("DesarrolladorClave vacía.");
  if (!ec) throw new ZetaConfigurationError("EmpresaCodigo vacío.");
  if (!ek) throw new ZetaConfigurationError("EmpresaClave vacía.");
  if (!rol) throw new ZetaConfigurationError("RolCodigo vacío.");

  return {
    DesarrolladorCodigo: dc,
    DesarrolladorClave: dk,
    EmpresaCodigo: ec,
    EmpresaClave: ek,
    RolCodigo: rol,
  };
}

export function assertZetaStaticCredentials(
  creds: Partial<ZetaStaticCredentials>
): asserts creds is ZetaStaticCredentials {
  const missing: string[] = [];
  if (!creds.desarrolladorCodigo?.trim()) missing.push("desarrolladorCodigo");
  if (!creds.desarrolladorClave?.trim()) missing.push("desarrolladorClave");
  if (!creds.empresaCodigo?.trim()) missing.push("empresaCodigo");
  if (!creds.empresaClave?.trim()) missing.push("empresaClave");
  if (!creds.rolCodigo?.trim()) missing.push("rolCodigo");
  if (missing.length) {
    throw new ZetaConfigurationError(
      `Credenciales Zeta incompletas: faltan ${missing.join(", ")}.`
    );
  }
}
