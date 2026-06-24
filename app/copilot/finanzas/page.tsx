import { AccessDeniedCard } from "@/components/copilot/access-denied-card";
import { isModuleAccessDenied } from "@/lib/auth/server-module-permissions";

import { FinanzasClient } from "./finanzas-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await isModuleAccessDenied("finanzas")) {
    return <AccessDeniedCard />;
  }
  return <FinanzasClient />;
}
