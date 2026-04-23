/**
 * Deriva una “carpeta” de ayuda Zeta desde la URL (pathname `/ayuda/...`).
 * Sin dependencias de Node; seguro para importar en Client Components.
 */
export function ayudaFolderKey(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] !== "ayuda") return null;
    return parts[1] ?? "(raíz)";
  } catch {
    return null;
  }
}
