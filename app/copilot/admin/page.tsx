import { AccessDeniedCard } from "@/components/copilot/access-denied-card";
import { isModuleAccessDenied } from "@/lib/auth/server-module-permissions";

import AdminPanelClient from "./admin-panel-client";

export const dynamic = "force-dynamic";

export default async function CopilotAdminPage() {
  if (await isModuleAccessDenied("admin")) return <AccessDeniedCard />;
  return <AdminPanelClient />;
}
