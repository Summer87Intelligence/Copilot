/**
 * Perfil + tenant desde el layout (sesión cookie Copilot + fila `app_users`).
 * `tenantCompanyId` siempre desde DB (`company_id`), no desde la cookie sola.
 */
export type CopilotSessionPreview = {
  displayEmail: string;
  displayRole: string;
  tenantCompanyId: string;
};
