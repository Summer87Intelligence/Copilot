import { redirect } from "next/navigation";

/** Ruta retirada del menú; redirige para no romper enlaces antiguos. */
export default function ConfiguracionRedirectPage() {
  redirect("/copilot/hoy");
}
