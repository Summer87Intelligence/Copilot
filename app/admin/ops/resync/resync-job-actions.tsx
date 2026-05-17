"use client";

import { useState, useTransition } from "react";

type JobActionProps = {
  jobId: string;
  status: string;
  onSuccess: (jobId: string, newStatus: string) => void;
};

export function RetryJobButton({ jobId, status, onSuccess }: JobActionProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canRetry = status === "dead_letter" || status === "failed";
  if (!canRetry) return null;

  function handleRetry() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/zeta/resync-jobs/${jobId}/retry`, { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError((json as { message?: string }).message ?? `Error ${res.status}`);
          return;
        }
        onSuccess(jobId, "pending");
      } catch (e) {
        setError(String(e));
      }
    });
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={handleRetry}
        disabled={isPending}
        className="px-3 py-1 text-xs font-medium rounded border border-blue-600 text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Reintentando…" : "Retry"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

export function CancelJobButton({ jobId, status, onSuccess }: JobActionProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canCancel = status === "pending" || status === "running";
  if (!canCancel) return null;

  function handleCancel() {
    if (!confirm("¿Confirmar cancelación del job?")) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/zeta/resync-jobs/${jobId}/cancel`, { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError((json as { message?: string }).message ?? `Error ${res.status}`);
          return;
        }
        onSuccess(jobId, "failed");
      } catch (e) {
        setError(String(e));
      }
    });
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={handleCancel}
        disabled={isPending}
        className="px-3 py-1 text-xs font-medium rounded border border-red-500 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Cancelando…" : "Cancel"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

type PayloadInspectorProps = {
  job: Record<string, unknown>;
};

export function PayloadInspector({ job }: PayloadInspectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-gray-500 hover:text-gray-800 underline"
      >
        {open ? "Ocultar payload" : "Ver payload"}
      </button>
      {open && (
        <pre className="mt-2 text-xs bg-gray-50 border rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all">
          {JSON.stringify(job, null, 2)}
        </pre>
      )}
    </div>
  );
}
