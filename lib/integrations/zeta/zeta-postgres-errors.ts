/** Postgres SQLSTATE 23505 — unique_violation. */
export function isPostgresUniqueViolation(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  return (err as { code?: string }).code === "23505";
}
