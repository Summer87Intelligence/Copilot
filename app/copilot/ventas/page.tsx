import { AccessDeniedCard } from "@/components/copilot/access-denied-card";
import { isModuleAccessDenied, hasModuleAdminAccess } from "@/lib/auth/server-module-permissions";
import { VentasPageClient } from "@/components/copilot/ventas/ventas-page-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await isModuleAccessDenied("ventas")) {
    return <AccessDeniedCard />;
  }
  const isAdmin = await hasModuleAdminAccess("ventas");
  return <VentasPageClient isAdmin={isAdmin} />;
}
