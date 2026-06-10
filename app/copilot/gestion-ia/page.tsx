import { redirect } from "next/navigation";

/** Ruta legacy — el menú canónico usa Agentes IA. */
export default function CopilotGestionIaLegacyPage() {
  redirect("/copilot/agentes");
}
