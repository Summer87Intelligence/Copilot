import { AccessDeniedCard } from "@/components/copilot/access-denied-card";
import { isModuleAccessDenied } from "@/lib/auth/server-module-permissions";
import { HelpdeskPageClient } from "@/components/copilot/helpdesk/helpdesk-page-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await isModuleAccessDenied("helpdesk")) {
    return <AccessDeniedCard />;
  }
  return <HelpdeskPageClient />;
}
