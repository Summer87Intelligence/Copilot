/**
 * Validates hrefs for AI Agent CTAs.
 * Ensures navigation stays within /copilot/* and never produces empty,
 * external, /api/*, or runtime-coerced paths ("/undefined", "/null", etc.)
 * that could trigger middleware redirects or unexpected behavior.
 */

const DEFAULT_AGENT_HREF = "/copilot/acciones";

export function normalizeAgentHref(href: string | null | undefined): string {
  if (!href) return DEFAULT_AGENT_HREF;

  const trimmed = href.trim();

  if (
    !trimmed ||
    trimmed === "#" ||
    trimmed === "undefined" ||
    trimmed === "null" ||
    trimmed.includes("/undefined") ||
    trimmed.includes("/null") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/api/") ||
    trimmed.startsWith("/login") ||
    trimmed.startsWith("/logout")
  ) {
    return DEFAULT_AGENT_HREF;
  }

  if (!trimmed.startsWith("/copilot/")) {
    return DEFAULT_AGENT_HREF;
  }

  if (trimmed === "/copilot/clientes/") {
    return DEFAULT_AGENT_HREF;
  }

  return trimmed;
}
