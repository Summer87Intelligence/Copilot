import { AccessDeniedCard } from "@/components/copilot/access-denied-card";
import { isModuleAccessDenied } from "@/lib/auth/server-module-permissions";

import { ClientesPageClient } from "./clientes-page-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await isModuleAccessDenied("clientes")) {
    return <AccessDeniedCard />;
  }
  return <ClientesPageClient />;
}
