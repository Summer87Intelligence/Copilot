/** Detección de violación de unicidad (Postgres 23505 / mensaje PostgREST). */
export function isPgUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  if (e.code === "23505") return true;
  if (
    typeof e.message === "string" &&
    /duplicate key|unique constraint/i.test(e.message)
  ) {
    return true;
  }
  return false;
}
