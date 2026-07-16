import { AccessDeniedCard } from "@/components/copilot/access-denied-card";
import { hasModuleAdminAccess } from "@/lib/auth/server-module-permissions";
import { VentasConfiguracionClient } from "@/components/copilot/ventas/ventas-configuracion-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Configuración comercial es superficie administrativa: requiere admin del módulo.
  if (!(await hasModuleAdminAccess("ventas"))) {
    return <AccessDeniedCard />;
  }
  return <VentasConfiguracionClient />;
}
