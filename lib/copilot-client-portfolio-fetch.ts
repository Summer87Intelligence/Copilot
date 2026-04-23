import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";

/**
 * Carga cartera desde la API (cookies / sesión Copilot).
 * Evita `getClientPortfolio()` con el browser client sin JWT (rol `anon` → sin GRANT en proto_*).
 */
export async function fetchClientPortfolioLoad(): Promise<ClientPortfolioLoad> {
  const res = await fetch("/api/copilot/portfolio", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const body = (await res.json().catch(() => null)) as
    | { ok?: boolean; portfolio?: ClientPortfolioLoad; error?: string }
    | null;
  if (!res.ok || !body?.ok || !body.portfolio) {
    const msg =
      typeof body?.error === "string" && body.error.trim()
        ? body.error
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body.portfolio;
}
