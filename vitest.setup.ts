/**
 * Evita fallo al importar módulos que instancian el cliente Supabase por defecto.
 * Los tests unitarios no realizan llamadas de red.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "vitest-anon-key-placeholder";
