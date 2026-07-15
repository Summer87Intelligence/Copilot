"use client";

import { useCallback, useEffect, useState } from "react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { UserWorkload } from "@/lib/tasks/task-summary";

type UserRow = { id: string; full_name: string | null; email: string | null };

/**
 * FASE 7 — Vista administrativa de carga de trabajo por usuario (§21).
 * Solo tareas (sin monedas). Se apoya en /summary, que ya restringe el workload
 * a admins. Silencioso si no hay datos o la migración está pendiente.
 */
export function AdminTasksWorkloadPanel() {
  const [workload, setWorkload] = useState<UserWorkload[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(true);

  const load = useCallback(async () => {
    try {
      const [sumRes, usersRes] = await Promise.allSettled([
        copilotApiFetch("/api/copilot/daily-tasks/summary"),
        copilotApiFetch("/api/copilot/daily-tasks/users"),
      ]);
      if (sumRes.status === "fulfilled") {
        const json = (await sumRes.value.json().catch(() => null)) as
          | { ok?: boolean; workload?: UserWorkload[]; meta?: { is_admin?: boolean } }
          | null;
        if (json?.ok) {
          setWorkload(json.workload ?? []);
          setVisible(Boolean(json.meta?.is_admin));
        }
      }
      if (usersRes.status === "fulfilled") {
        const json = (await usersRes.value.json().catch(() => null)) as { ok?: boolean; data?: UserRow[] } | null;
        if (json?.ok) setUsers(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!visible) return null;

  const name = (id: string | null) => {
    if (!id) return "Sin asignar";
    const u = users.find((x) => x.id === id);
    return u?.full_name || u?.email || "Usuario";
  };

  return (
    <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-4 shadow-sm">
      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
        Carga de trabajo (tareas)
      </p>
      {loading ? (
        <p className="text-xs text-[var(--copilot-ink-muted)]">Cargando…</p>
      ) : workload.length === 0 ? (
        <p className="text-xs text-[var(--copilot-ink-muted)]">Sin tareas activas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead>
              <tr className="text-[var(--copilot-ink-muted)]">
                <th className="py-1.5 pr-3 font-semibold">Usuario</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Activas</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Atrasadas</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Para hoy</th>
                <th className="py-1.5 text-right font-semibold">Completadas</th>
              </tr>
            </thead>
            <tbody>
              {workload.map((w) => (
                <tr key={w.userId ?? "unassigned"} className="border-t border-[var(--copilot-border)]">
                  <td className="py-1.5 pr-3 text-[var(--copilot-ink)]">{name(w.userId)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-[var(--copilot-ink)]">{w.active}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-[var(--copilot-danger-text-strong)]">{w.overdue}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-[var(--copilot-ink)]">{w.dueToday}</td>
                  <td className="py-1.5 text-right tabular-nums text-[var(--copilot-ink)]">{w.completedInPeriod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
