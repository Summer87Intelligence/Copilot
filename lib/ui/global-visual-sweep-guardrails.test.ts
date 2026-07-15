import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("FASE 6A I5 global visual guardrails", () => {
  it("Cliente 360 tabs expose tab semantics and selected state", () => {
    const s = source("components/copilot/copilot-client-360-view.tsx");

    expect(s).toContain('role="tablist"');
    expect(s).toContain('role="tab"');
    expect(s).toContain("aria-selected={activeTab === tab.id}");
    expect(s).toContain('role="tabpanel"');
  });

  it("Admin keeps deactivation visually distinct from irreversible delete", () => {
    const s = source("app/copilot/admin/admin-panel-client.tsx");

    expect(s).toContain("Desactivar cuenta");
    expect(s).toContain("Eliminar cuenta");
    expect(s).toContain("historial se conservarán");
    expect(s).toContain("No se puede deshacer");
    expect(s).toContain("bg-[var(--copilot-tone-warning-bg)]");
    expect(s).toContain("bg-[var(--copilot-tone-danger-bg)]");
    expect(s).not.toContain("focus:ring-rose");
    expect(s).not.toContain("rgba(0,0,0");
  });

  it("remaining touched operational surfaces use DS-Core empty/loading primitives", () => {
    const tareas = source("components/copilot/daily-tasks/daily-tasks-page-client.tsx");
    const banco = source("components/copilot/bank-movements/bank-movements-page-client.tsx");
    const alertas = source("app/copilot/alertas/page.tsx");

    expect(tareas).toContain("EmptyState as DsEmptyState");
    expect(tareas).toContain("SkeletonMetricGrid");
    expect(banco).toContain("EmptyState as DsEmptyState");
    expect(banco).toContain("StatusBadge");
    expect(alertas).toContain("EmptyState as DsEmptyState");
    expect(alertas).toContain('aria-label={`Severidad: ${cfg.label}`}');
  });

  it("dashboard and helpdesk touched files avoid isolated legacy color utilities", () => {
    const dashboard = source("app/copilot/dashboard/dashboard-page-client.tsx");
    const helpdeskFiles = [
      "components/copilot/helpdesk/helpdesk-page-client.tsx",
      "components/copilot/helpdesk/helpdesk-comments.tsx",
      "components/copilot/helpdesk/helpdesk-ticket-form.tsx",
      "components/copilot/helpdesk/helpdesk-ticket-detail.tsx",
    ].map(source).join("\n");

    expect(dashboard).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(dashboard).not.toMatch(/text-red-|bg-violet-/);
    expect(helpdeskFiles).not.toMatch(/bg-blue-|hover:bg-blue-|text-red-/);
    expect(helpdeskFiles).toContain("var(--copilot-accent)");
    expect(helpdeskFiles).toContain("var(--copilot-danger-text-strong)");
  });
});
