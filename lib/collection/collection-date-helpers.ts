// Pure date helpers for collection followup rendering.
// All functions return null / "—" instead of ever producing "Invalid Date".

/** Format a YYYY-MM-DD date string as "26 may." style. Returns null for missing or invalid input. */
export function formatYmd(ymd: string | null | undefined): string | null {
  if (!ymd || !ymd.trim()) return null;
  try {
    const d = new Date(ymd + "T12:00:00");
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("es-UY", { day: "numeric", month: "short" });
  } catch {
    return null;
  }
}

/** Format a full ISO timestamp as "26 may. 2026" style. Returns "—" for invalid input. */
export function formatActionDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-UY", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

/** Format an ISO timestamp as a relative label ("hoy", "ayer", "hace N días", or short date). Returns "—" for invalid input. */
export function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const diff = Math.round((Date.now() - d.getTime()) / 86_400_000);
    if (diff === 0) return "hoy";
    if (diff === 1) return "ayer";
    if (diff <= 6) return `hace ${diff} días`;
    return d.toLocaleDateString("es-UY", { day: "numeric", month: "short" });
  } catch {
    return "—";
  }
}
