import { AccessDeniedCard } from "@/components/copilot/access-denied-card";
import { isModuleAccessDenied } from "@/lib/auth/server-module-permissions";

import { ReportesClient } from "./reportes-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await isModuleAccessDenied("reportes")) {
    return <AccessDeniedCard />;
  }
  return <ReportesClient />;
}
