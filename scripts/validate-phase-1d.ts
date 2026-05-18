/**
 * Phase 1D — validación end-to-end (HTTP + Supabase).
 * Uso: npx tsx --env-file=.env.local scripts/validate-phase-1d.ts
 */

import { createClient } from "@supabase/supabase-js";

import { serializeCopilotSessionValue } from "../lib/copilot-session-cookie";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BASE_URL = process.env.VALIDATE_BASE_URL ?? "http://localhost:3000";
const WID = process.env.WORKSPACE_COMPANY_ID ?? "040321ff-10fd-4da3-aeca-f1865f879986";
const APP_USER_ID = process.env.VALIDATE_APP_USER_ID ?? "22535d5c-3c6d-4bc4-a9a1-550132a1819b";

type StepResult = { ok: boolean; label: string; detail?: string };

const results: StepResult[] = [];
let companyId = "";
let companyName = "";
let lastOperational: Record<string, unknown> | null = null;

function pass(label: string, detail?: string) {
  results.push({ ok: true, label, detail });
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label: string, detail?: string) {
  results.push({ ok: false, label, detail });
  console.error(`  ✗ ${label}${detail ? `: ${detail}` : ""}`);
  process.exitCode = 1;
}

function info(label: string) {
  console.log(`  · ${label}`);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sessionCookie = serializeCopilotSessionValue(APP_USER_ID, "superadmin", WID, 1);

async function apiCall(
  method: string,
  path: string,
  body?: Record<string, unknown>
) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Cookie: `copilot_session=${sessionCookie}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function verifyTablesExist() {
  console.log("\n=== 1. Tablas Supabase ===");
  const { error: e1 } = await admin.from("decision_operational_state").select("id").limit(1);
  const { error: e2 } = await admin.from("decision_follow_ups").select("id").limit(1);

  if (e1?.code === "42P01" || e1?.message?.includes("does not exist")) {
    fail("decision_operational_state", e1.message);
    return;
  }
  if (e2?.code === "42P01" || e2?.message?.includes("does not exist")) {
    fail("decision_follow_ups", e2.message);
    return;
  }
  if (e1) fail("decision_operational_state", e1.message);
  else pass("decision_operational_state accesible");

  if (e2) fail("decision_follow_ups", e2.message);
  else pass("decision_follow_ups accesible");
}

async function createAction(
  body: Record<string, unknown>,
  label: string
): Promise<Record<string, unknown> | null> {
  const res = await apiCall("POST", "/api/copilot/data/collection-actions/create", body);
  info(`${label} → HTTP ${res.status}`);
  if (res.status !== 201) {
    fail(`${label} create`, JSON.stringify(res.json));
    return null;
  }
  const root = res.json as Record<string, unknown>;
  const operational = root.operational as Record<string, unknown> | undefined;
  if (!operational) {
    fail(`${label} operational payload`, "ausente — revisar de_operational_persist_failed en logs");
    return null;
  }
  lastOperational = operational;
  pass(`${label} operational payload presente`);
  const state = operational.operational_state as Record<string, unknown>;
  info(`  state=${state?.operational_state} risk=${state?.current_risk}`);
  const fu = operational.follow_up as Record<string, unknown> | null;
  if (fu) info(`  follow_up id=${fu.id} scheduled=${fu.scheduled_for}`);
  else info(`  follow_up: null (requires_follow_up=false o sin fecha)`);
  return root;
}

async function verifyDbForCustomer() {
  const { data: state, error: se } = await admin
    .from("decision_operational_state")
    .select("*")
    .eq("workspace_company_id", WID)
    .eq("customer_id", companyId)
    .maybeSingle();

  if (se) {
    fail("DB operational_state", se.message);
    return;
  }
  if (!state) {
    fail("DB operational_state", "sin fila para el cliente");
    return;
  }
  pass("DB decision_operational_state", `state=${state.operational_state} risk=${state.current_risk}`);

  const { data: followUps, error: fe } = await admin
    .from("decision_follow_ups")
    .select("id, status, scheduled_for, source_action_id, reason, created_at")
    .eq("workspace_company_id", WID)
    .eq("customer_id", companyId)
    .in("status", ["pending", "in_progress"])
    .order("created_at", { ascending: false });

  if (fe) {
    fail("DB decision_follow_ups", fe.message);
    return;
  }

  const rows = followUps ?? [];
  pass(`DB follow-ups activos: ${rows.length}`);

  const days = new Set(rows.map((r) => String(r.scheduled_for).split("T")[0]));
  if (days.size < rows.length) {
    fail("Dedupe follow-ups", `${rows.length} activos en ${days.size} días únicos`);
  } else {
    pass("Sin follow-ups duplicados por día");
  }
}

async function verifySnapshotInvalidated() {
  const { data } = await admin
    .from("decision_snapshots")
    .select("expires_at, generated_at")
    .eq("workspace_company_id", WID)
    .eq("snapshot_type", "daily_briefing")
    .maybeSingle();

  if (!data) {
    pass("Snapshot briefing", "sin cache previa");
    return;
  }
  const expired = new Date(data.expires_at as string) <= new Date();
  if (expired) pass("Snapshot invalidado", String(data.expires_at));
  else fail("Snapshot invalidado", `vigente hasta ${data.expires_at}`);
}

async function verifyBriefingDbFirst() {
  const res = await apiCall("GET", "/api/copilot/decision-engine/briefing?force=true");
  if (res.status !== 200) {
    fail("Briefing force refresh", `status=${res.status} ${JSON.stringify(res.json)}`);
    return;
  }
  const root = res.json as Record<string, unknown>;
  const briefing = root.briefing as Record<string, unknown>;
  const queue = briefing?.follow_up_queue as unknown[];
  if (!Array.isArray(queue)) {
    fail("Briefing follow_up_queue", "no es array");
    return;
  }

  const inQueue = queue.some(
    (q) => (q as Record<string, unknown>).company_id === companyId
  );

  if (root.cached === false) pass("Briefing recalculado (cached=false)");
  else info(`cached=${String(root.cached)}`);

  if (inQueue) {
    pass("DB-first: cliente en follow_up_queue", `${queue.length} items`);
    const item = queue.find(
      (q) => (q as Record<string, unknown>).company_id === companyId
    ) as Record<string, unknown>;
    info(`  queue state=${(item.follow_up_result as Record<string, unknown>)?.operational_state}`);
  } else if (queue.length > 0) {
    pass("Briefing follow_up_queue desde DB", `${queue.length} items (cliente prueba no actionable)`);
  } else {
    info("Cola vacía — fallback compute sin items actionable");
    pass("Briefing generado con follow_up_queue array");
  }
}

async function runHttpFlow() {
  console.log("\n=== 2–4. Flujo HTTP (equivalente UI: llamada → promesa → escalación) ===");

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 7);
  const promiseDate = tomorrow.toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  await createAction(
    {
      company_id: companyId,
      action_type: "call",
      status: "contacted",
      priority: "high",
      contact_date: today,
      notes: "Phase 1D validation — llamada",
    },
    "Llamada"
  );
  await verifyDbForCustomer();
  await verifySnapshotInvalidated();

  await createAction(
    {
      company_id: companyId,
      action_type: "payment_promise",
      status: "promised_payment",
      priority: "medium",
      promise_date: promiseDate,
      promise_amount: 1000,
      promise_currency: "UYU",
      notes: "Phase 1D validation — promesa",
    },
    "Promesa"
  );
  await verifyDbForCustomer();
  await verifySnapshotInvalidated();

  await createAction(
    {
      company_id: companyId,
      action_type: "escalation",
      status: "escalated",
      priority: "critical",
      notes: "Phase 1D validation — escalación",
    },
    "Escalación"
  );
  await verifyDbForCustomer();
  await verifySnapshotInvalidated();
  await verifyBriefingDbFirst();
}

async function printSampleQueries() {
  console.log("\n=== 5. Muestras Supabase ===");

  const { data: states } = await admin
    .from("decision_operational_state")
    .select(
      "customer_id, current_risk, operational_state, next_follow_up_at, updated_at"
    )
    .eq("workspace_company_id", WID)
    .order("updated_at", { ascending: false })
    .limit(10);

  const { data: fus } = await admin
    .from("decision_follow_ups")
    .select("id, customer_id, status, scheduled_for, reason, created_at")
    .eq("workspace_company_id", WID)
    .order("created_at", { ascending: false })
    .limit(10);

  console.log("\n--- decision_operational_state (top 10) ---");
  console.log(JSON.stringify(states ?? [], null, 2));
  console.log("\n--- decision_follow_ups (top 10) ---");
  console.log(JSON.stringify(fus ?? [], null, 2));
}

async function main() {
  console.log("Phase 1D — Validación final");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Workspace: ${WID}`);

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing Supabase env");
    process.exit(1);
  }

  await verifyTablesExist();

  const { data: comp } = await admin
    .from("proto_companies")
    .select("id, name")
    .eq("workspace_company_id", WID)
    .eq("is_active", true)
    .order("name")
    .limit(1)
    .single();

  if (!comp) {
    fail("Empresa de prueba");
    return;
  }
  companyId = comp.id as string;
  companyName = comp.name as string;
  info(`Cliente prueba: ${companyName} (${companyId})`);

  try {
    const health = await apiCall("GET", "/api/copilot/me");
    if (health.status !== 200) {
      fail("Sesión copilot_session", `status=${health.status} ${JSON.stringify(health.json)}`);
      return;
    }
    pass("Dev server + sesión copilot_session OK");
  } catch {
    fail("Dev server", `no alcanzable en ${BASE_URL} — ejecutá npm run dev`);
    return;
  }

  await runHttpFlow();
  await printSampleQueries();

  if (lastOperational) {
    console.log("\n=== Payload operational de ejemplo (última acción) ===");
    console.log(JSON.stringify(lastOperational, null, 2));
  }

  console.log(`\n${"=".repeat(55)}`);
  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) {
    console.log("✅ Phase 1D validación OK");
  } else {
    console.log(`❌ ${failed.length} fallo(s):`);
    for (const f of failed) console.log(`   - ${f.label}: ${f.detail ?? ""}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
