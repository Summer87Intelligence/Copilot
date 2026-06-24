import { AccessDeniedCard } from "@/components/copilot/access-denied-card";
import { isModuleAccessDenied } from "@/lib/auth/server-module-permissions";

import { Cliente360PageClient } from "./cliente-360-page-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await isModuleAccessDenied("clientes")) {
    return <AccessDeniedCard />;
  }
  return <Cliente360PageClient />;
}
