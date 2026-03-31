import { redirect } from "next/navigation";

/** La demo de agentes vive en el módulo IA (`/demo/ia/agentes`). */
export default function DemoAgentesLegacyRedirectPage() {
  redirect("/demo/ia/agentes");
}
