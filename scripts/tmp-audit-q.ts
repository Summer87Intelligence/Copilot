import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    process.env[key] = val;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const WID =
  process.env.COPILOT_WORKSPACE_COMPANY_ID?.trim() ??
  process.env.WORKSPACE_COMPANY_ID?.trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Usá node --env-file=.env.local …"
  );
  process.exit(1);
}

if (!WID) {
  console.error(
    "Falta COPILOT_WORKSPACE_COMPANY_ID (o WORKSPACE_COMPANY_ID) para acotar el tenant del audit."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  console.log('='.repeat(80));
  console.log('QUERY 1: zeta_sync_runs error_summary for id starting with 5de598bc');
  console.log('='.repeat(80));

  const { data: q1, error: e1 } = await supabase.rpc('run_raw_query', {
    sql: `SELECT id, resource_flow, status, started_at, records_fetched, records_processed, error_summary, error_code FROM zeta_sync_runs WHERE id::text LIKE '5de598bc%' LIMIT 1`,
  }).select();

  // Fallback: try via filter on text cast using gte/lt trick
  let q1data: any = q1;
  let q1err: any = e1;

  if (e1) {
    // Try: id >= '5de598bc-0000...' AND id < '5de598bd-0000...'
    const { data: q1b, error: e1b } = await supabase
      .from('zeta_sync_runs')
      .select('id, resource_flow, status, started_at, records_fetched, records_processed, error_summary, error_code')
      .gte('id', '5de598bc-0000-0000-0000-000000000000')
      .lt('id', '5de598bd-0000-0000-0000-000000000000')
      .limit(1);
    q1data = q1b;
    q1err = e1b;
  }

  if (q1err) {
    console.error('ERROR:', JSON.stringify(q1err, null, 2));
  } else {
    console.log(JSON.stringify(q1data, null, 2));
  }

  console.log('\n' + '='.repeat(80));
  console.log('QUERY 2: Sample inactive April 2026 proto_invoices (zeta_metadata structure)');
  console.log('='.repeat(80));

  const { data: q2, error: e2 } = await supabase
    .from('proto_invoices')
    .select('id, invoice_number, issue_date, is_active, status, total_amount, balance_amount, zeta_metadata')
    .eq('workspace_company_id', WID)
    .eq('is_active', false)
    .gte('issue_date', '2026-04-01')
    .lte('issue_date', '2026-04-30')
    .limit(3);

  if (e2) {
    console.error('ERROR:', JSON.stringify(e2, null, 2));
  } else {
    console.log(JSON.stringify(q2, null, 2));
  }

  console.log('\n' + '='.repeat(80));
  console.log('QUERY 3: skip_reason check on inactive April 2026 invoices');
  console.log('='.repeat(80));

  // Supabase JS client doesn't support jsonb path operators directly in select,
  // so we fetch the fields we need and extract in JS, or use rpc/raw SQL.
  // We'll use .rpc or fetch zeta_metadata and extract manually.
  const { data: q3raw, error: e3 } = await supabase
    .from('proto_invoices')
    .select('id, invoice_number, is_active, zeta_metadata')
    .eq('workspace_company_id', WID)
    .eq('is_active', false)
    .gte('issue_date', '2026-04-01')
    .lte('issue_date', '2026-04-30')
    .limit(5);

  if (e3) {
    console.error('ERROR:', JSON.stringify(e3, null, 2));
  } else {
    const q3 = (q3raw ?? []).map((row: any) => {
      const vcv = row.zeta_metadata?.zeta_customer_voucher_v1;
      return {
        id: row.id,
        invoice_number: row.invoice_number,
        is_active: row.is_active,
        fecha: vcv?.fecha_emision ?? null,
        skip_reason: vcv?.skip_reason ?? null,
        zeta_metadata_keys: row.zeta_metadata ? Object.keys(row.zeta_metadata) : [],
      };
    });
    console.log(JSON.stringify(q3, null, 2));
  }

  console.log('\n' + '='.repeat(80));
  console.log('DONE');
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
