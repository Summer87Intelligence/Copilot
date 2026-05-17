/**
 * /admin/ops/resync
 *
 * Dead Letter Operations — FASE E (ZETA-16).
 *
 * Shows resync jobs across all workspaces with filter by status.
 * Supports: retry, cancel, inspect payload, inspect logs.
 *
 * Read and action via /api/admin/zeta/resync-jobs/*.
 * Auth guard: superadmin only (enforced at API layer).
 */

import { cookies, headers } from "next/headers";
import { ResyncJobsTable } from "./resync-jobs-table";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "pending", label: "Pending" },
  { value: "running", label: "Running" },
  { value: "failed", label: "Failed" },
  { value: "dead_letter", label: "Dead Letter" },
  { value: "completed", label: "Completado" },
];

type SearchParams = { status?: string; workspace_id?: string; limit?: string };

async function fetchResyncJobs(searchParams: SearchParams) {
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const proto = headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  const qs = new URLSearchParams();
  if (searchParams.status) qs.set("status", searchParams.status);
  if (searchParams.workspace_id) qs.set("workspace_id", searchParams.workspace_id);
  qs.set("limit", searchParams.limit ?? "100");

  const url = `${proto}://${host}/api/admin/zeta/resync-jobs?${qs.toString()}`;

  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join("; ");

  try {
    const res = await fetch(url, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({ jobs: [], total: 0 }));
    return json as { jobs: unknown[]; total: number };
  } catch {
    return { jobs: [], total: 0 };
  }
}

function StatusSummary({ jobs }: { jobs: { status: string }[] }) {
  const counts: Record<string, number> = {};
  for (const j of jobs) {
    counts[j.status] = (counts[j.status] ?? 0) + 1;
  }

  const pills = [
    { key: "dead_letter", label: "Dead Letter", color: "bg-red-200 text-red-900" },
    { key: "failed",      label: "Failed",      color: "bg-red-100 text-red-700" },
    { key: "running",     label: "Running",     color: "bg-blue-100 text-blue-700" },
    { key: "pending",     label: "Pending",     color: "bg-yellow-100 text-yellow-800" },
    { key: "completed",   label: "Completed",   color: "bg-green-100 text-green-700" },
    { key: "skipped",     label: "Skipped",     color: "bg-gray-100 text-gray-600" },
  ].filter((p) => counts[p.key]);

  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {pills.map((p) => (
        <span key={p.key} className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${p.color}`}>
          {p.label}: {counts[p.key]}
        </span>
      ))}
    </div>
  );
}

export default async function ResyncOpsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { jobs } = await fetchResyncJobs(params);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Resync Operations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Cola de resync jobs. Retry y cancel disponibles para jobs en estado failed / dead_letter / pending.
        </p>
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3 mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Workspace ID</label>
          <input
            name="workspace_id"
            defaultValue={params.workspace_id ?? ""}
            placeholder="uuid…"
            className="border border-gray-300 rounded px-2 py-1.5 text-sm w-72 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="px-4 py-1.5 text-sm font-medium rounded bg-gray-800 text-white hover:bg-gray-700 transition-colors"
          >
            Filtrar
          </button>
        </div>
      </form>

      <StatusSummary jobs={jobs as { status: string }[]} />

      {/* Non-destructive notice */}
      <div className="mb-4 px-3 py-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
        Las acciones de retry y cancel nunca eliminan datos ni hacen force-overwrite. Cancel marca el job como failed, preservando el registro para auditoría.
      </div>

      <ResyncJobsTable initialJobs={jobs as Parameters<typeof ResyncJobsTable>[0]["initialJobs"]} />

      <div className="mt-4 text-xs text-gray-400">
        {jobs.length} jobs mostrados · Actualizar página para refrescar.
      </div>
    </div>
  );
}
