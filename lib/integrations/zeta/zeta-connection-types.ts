/**
 * Contrato de conexión ZetaSoftware (REST/JSON).
 * Fuente: https://zetasoftware.info/ayuda/apis/datos-de-conexion/
 *
 * `UsuarioCodigo` / `UsuarioClave` no deben enviarse con valor operativo (omitir).
 */
export type ZetaConnectionBlock = {
  DesarrolladorCodigo: string;
  DesarrolladorClave: string;
  EmpresaCodigo: string;
  EmpresaClave: string;
  RolCodigo: string;
};

/** Credenciales del integrador (ZetaSoftware). */
export type ZetaDeveloperCredentials = {
  desarrolladorCodigo: string;
  desarrolladorClave: string;
};

/** Credenciales de la empresa cliente (par desarrollador–empresa). */
export type ZetaCompanyCredentials = {
  empresaCodigo: string;
  empresaClave: string;
  /** Rol activo en la empresa; documentación recomienda `"1"`. */
  rolCodigo: string;
};

export type ZetaStaticCredentials = ZetaDeveloperCredentials & ZetaCompanyCredentials;
