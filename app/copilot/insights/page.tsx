import { redirect } from "next/navigation";

/** Ruta legacy — el menú canónico usa Dashboard Resumen. */
export default function CopilotInsightsLegacyPage() {
  redirect("/copilot/dashboard");
}
