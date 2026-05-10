import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";
import type {
  CreateZetaSyncRunInput,
  InsertZetaSyncRawPayloadInput,
  UpdateZetaSyncRunInput,
  UpsertZetaSyncStateInput,
  ZetaSyncStateRow,
} from "@/lib/data/zeta-sync-types";

function assertNoError(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

/**
 * Crea una corrida. Con JWT `authenticated`, el trigger puede fijar `company_id`; con `service_role`
 * hay que enviar `input.company_id` (tenant = `public.companies.id`).
 */
export async function insertZetaSyncRun(
  client: OperationalSupabase,
  input: CreateZetaSyncRunInput
) {
  const row: Record<string, unknown> = {
    resource_flow: input.resource_flow,
    sync_mode: input.sync_mode,
    status: input.status ?? "pending",
    overlap_from: input.overlap_from ?? null,
    overlap_to: input.overlap_to ?? null,
    idempotency_key: input.idempotency_key ?? null,
  };
  const cid = typeof input.company_id === "string" ? input.company_id.trim() : "";
  if (cid) row.company_id = cid;
  const res = await client.from("zeta_sync_runs").insert(row).select("id").single();
  assertNoError("insertZetaSyncRun", res.error);
  return res.data as { id: string };
}

/**
 * Marca / actualiza una corrida existente (RLS acota al tenant).
 */
export async function updateZetaSyncRunById(
  client: OperationalSupabase,
  runId: string,
  patch: UpdateZetaSyncRunInput
) {
  const res = await client.from("zeta_sync_runs").update(patch).eq("id", runId).select("id").single();
  assertNoError("updateZetaSyncRunById", res.error);
  return res.data as { id: string };
}

/**
 * Estado actual por recurso (una fila por workspace + resource_flow).
 *
 * @param companyId — Requerido cuando el cliente es `service_role` (sin RLS).
 *   Con JWT `authenticated`, RLS filtra por tenant automáticamente y puede omitirse.
 *   Sin este filtro y con múltiples workspaces, `.maybeSingle()` lanzaría un error
 *   porque encontraría N filas (una por workspace).
 */
export async function selectZetaSyncStateByResource(
  client: OperationalSupabase,
  resourceFlow: string,
  companyId?: string | null
) {
  let query = client
    .from("zeta_sync_state")
    .select("*")
    .eq("resource_flow", resourceFlow);

  const cid = companyId?.trim();
  if (cid) query = query.eq("company_id", cid);

  const res = await query.maybeSingle();
  assertNoError("selectZetaSyncStateByResource", res.error);
  return res.data as ZetaSyncStateRow | null;
}

/**
 * Upsert de estado por (company_id, resource_flow); PK resuelta por trigger + RLS.
 * Fusiona con la fila existente para no anular columnas no enviadas (PostgREST upsert).
 */
export async function upsertZetaSyncState(
  client: OperationalSupabase,
  input: UpsertZetaSyncStateInput
) {
  const existing = await selectZetaSyncStateByResource(client, input.resource_flow, input.company_id);
  const now = new Date().toISOString();
  const fromInput = typeof input.company_id === "string" ? input.company_id.trim() : "";
  const fromExisting =
    existing && typeof existing.company_id === "string" ? existing.company_id.trim() : "";
  const companyId = fromInput || fromExisting;
  if (!companyId) {
    throw new Error(
      "upsertZetaSyncState: falta company_id del tenant (public.companies.id). Pasalo en el input cuando el cliente es service_role o no hay fila previa."
    );
  }
  const row: Record<string, unknown> = {
    company_id: companyId,
    resource_flow: input.resource_flow,
    watermark: input.preserve_watermark
      ? (existing?.watermark ?? "")
      : (input.watermark ?? existing?.watermark ?? ""),
    watermark_type: input.watermark_type ?? existing?.watermark_type ?? "opaque",
    overlap_seconds:
      input.overlap_seconds !== undefined ? input.overlap_seconds : (existing?.overlap_seconds ?? null),
    bootstrap_completed:
      input.bootstrap_completed ?? existing?.bootstrap_completed ?? false,
    last_success_at:
      input.last_success_at !== undefined ? input.last_success_at : (existing?.last_success_at ?? null),
    last_success_run_id:
      input.last_success_run_id !== undefined
        ? input.last_success_run_id
        : (existing?.last_success_run_id ?? null),
    last_run_id:
      input.last_run_id !== undefined ? input.last_run_id : (existing?.last_run_id ?? null),
    updated_at: now,
  };
  if (!existing) {
    row.created_at = now;
  }
  const res = await client
    .from("zeta_sync_state")
    .upsert(row, { onConflict: "company_id,resource_flow" })
    .select("*")
    .single();
  assertNoError("upsertZetaSyncState", res.error);
  return res.data as ZetaSyncStateRow;
}

/**
 * Registra un chunk raw; `company_id` se deriva de la corrida en trigger.
 */
export async function insertZetaSyncRawPayload(
  client: OperationalSupabase,
  input: InsertZetaSyncRawPayloadInput
) {
  const row = {
    sync_run_id: input.sync_run_id,
    resource_flow: input.resource_flow,
    chunk_index: input.chunk_index ?? 0,
    zeta_operation: input.zeta_operation,
    http_status: input.http_status ?? null,
    payload_json: input.payload_json,
    request_fingerprint: input.request_fingerprint ?? null,
  };
  const res = await client.from("zeta_sync_raw_payloads").insert(row).select("id").single();
  assertNoError("insertZetaSyncRawPayload", res.error);
  return res.data as { id: string };
}

/**
 * Última corrida de un recurso (por `started_at`), cualquier estado.
 */
export async function selectLatestZetaSyncRunForResource(
  client: OperationalSupabase,
  resourceFlow: string
) {
  const res = await client
    .from("zeta_sync_runs")
    .select("*")
    .eq("resource_flow", resourceFlow)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  assertNoError("selectLatestZetaSyncRunForResource", res.error);
  return res.data;
}
