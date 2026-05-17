"use client";

import { useState } from "react";
import { RetryJobButton, CancelJobButton, PayloadInspector } from "./resync-job-actions";

type ResyncJob = {
  id: string;
  workspace_company_id: string;
  entity: string;
  scope: string;
  status: string;
  triggered_by: string;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  error_summary: string | null;
  retry_after: string | null;
  rows_fetched: number | null;
  rows_synced: number | null;
  rows_skipped: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
  dry_run: boolean;
};

const STATUS_COLORS: Record<string, string> = {
  pending:     "bg-yellow-100 text-yellow-800",
  running:     "bg-blue-100 text-blue-800",
  completed:   "bg-green-100 text-green-800",
  failed:      "bg-red-100 text-red-800",
  dead_letter: "bg-red-200 text-red-900 font-semibold",
  skipped:     "bg-gray-100 text-gray-600",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

type Props = {
  initialJobs: ResyncJob[];
};

export function ResyncJobsTable({ initialJobs }: Props) {
  const [jobs, setJobs] = useState<ResyncJob[]>(initialJobs);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleStatusChange(jobId: string, newStatus: string) {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j))
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-3 py-2 text-left font-medium text-gray-700">Estado</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">Entidad</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">Scope</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">Trigger</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">Retries</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">Retry after</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">Creado</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">Completado</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {jobs.length === 0 && (
            <tr>
              <td colSpan={9} className="px-3 py-8 text-center text-gray-400">
                No hay jobs para mostrar.
              </td>
            </tr>
          )}
          {jobs.map((job) => (
            <>
              <tr
                key={job.id}
                className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                onClick={() => setExpandedId(expandedId === job.id ? null : job.id)}
              >
                <td className="px-3 py-2">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-3 py-2 font-mono text-xs">{job.entity}</td>
                <td className="px-3 py-2 font-mono text-xs max-w-xs truncate" title={job.scope}>
                  {job.scope}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">{job.triggered_by}</td>
                <td className="px-3 py-2 text-xs text-center">
                  {job.retry_count}/{job.max_retries}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {job.retry_after ? fmtDate(job.retry_after) : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{fmtDate(job.created_at)}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{fmtDate(job.completed_at)}</td>
                <td className="px-3 py-2">
                  <div
                    className="flex gap-2 items-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <RetryJobButton jobId={job.id} status={job.status} onSuccess={handleStatusChange} />
                    <CancelJobButton jobId={job.id} status={job.status} onSuccess={handleStatusChange} />
                  </div>
                </td>
              </tr>
              {expandedId === job.id && (
                <tr key={`${job.id}-detail`} className="bg-gray-50 border-b border-gray-200">
                  <td colSpan={9} className="px-4 py-3">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="font-medium text-gray-700 mb-1">ID del job</div>
                        <code className="text-gray-500 break-all">{job.id}</code>
                      </div>
                      <div>
                        <div className="font-medium text-gray-700 mb-1">Workspace</div>
                        <code className="text-gray-500 break-all">{job.workspace_company_id}</code>
                      </div>
                      {(job.last_error || job.error_summary) && (
                        <div className="col-span-2">
                          <div className="font-medium text-red-700 mb-1">Último error</div>
                          <pre className="text-red-600 bg-red-50 rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap break-all">
                            {job.last_error ?? job.error_summary}
                          </pre>
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-gray-700 mb-1">Métricas</div>
                        <span className="text-gray-500">
                          fetched: {job.rows_fetched ?? "—"} · synced: {job.rows_synced ?? "—"} · skipped: {job.rows_skipped ?? "—"}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium text-gray-700 mb-1">Dry run</div>
                        <span className="text-gray-500">{job.dry_run ? "Sí" : "No"}</span>
                      </div>
                      <div className="col-span-2">
                        <PayloadInspector job={job as unknown as Record<string, unknown>} />
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
