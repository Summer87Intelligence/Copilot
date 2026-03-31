import { supabase } from "./supabase-client";

export async function testSupabaseConnection() {
  const { data, error } = await supabase.from("_test").select("*").limit(1);

  return { data, error };
}
