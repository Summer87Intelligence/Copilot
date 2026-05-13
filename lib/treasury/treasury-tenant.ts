/**
 * Mapeo tenant Copilot → columna `workspace_id` en tablas ZETA-11.
 *
 * En el resto del proyecto el tenant SaaS vive como `tenantCompanyId` /
 * `workspace_company_id` (UUID de `public.companies`). ZETA-11 usa `workspace_id`
 * con el mismo UUID; `company_id` (text) queda reservado para ERP/Zeta.
 */

export function resolveTreasuryWorkspaceId(tenantCompanyId: string): string {
  const wid = tenantCompanyId.trim();
  if (!wid) {
    throw new Error("treasury: workspace_id vacío");
  }
  return wid;
}

export function normalizeErpCompanyId(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function assertSameTreasuryWorkspace(
  workspaceId: string,
  accountWorkspaceId: string
): void {
  if (workspaceId.trim() !== accountWorkspaceId.trim()) {
    throw new Error("treasury: account_id pertenece a otro workspace");
  }
}
