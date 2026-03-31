import type { Company } from "@/types/company";
import { supabase } from "@/lib/supabase-client";

const DEMO_COMPANY_SLUG = "summer87-demo";

function mapRowToCompany(row: {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}): Company {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    created_at: row.created_at,
  };
}

/**
 * Empresa demo (slug `summer87-demo`). Sin uso en UI por ahora.
 */
export async function getDemoCompany(): Promise<Company | null> {
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, slug, created_at")
    .eq("slug", DEMO_COMPANY_SLUG)
    .single();

  if (error || !data) {
    return null;
  }

  return mapRowToCompany(data);
}
