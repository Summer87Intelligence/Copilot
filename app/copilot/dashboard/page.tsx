import { AccessDeniedCard } from "@/components/copilot/access-denied-card";
import { isModuleAccessDenied } from "@/lib/auth/server-module-permissions";

import DashboardPageClient from "./dashboard-page-client";

export const dynamic = "force-dynamic";

export default async function CopilotDashboardPage() {
  if (await isModuleAccessDenied("dashboard")) return <AccessDeniedCard />;
  return <DashboardPageClient />;
}
