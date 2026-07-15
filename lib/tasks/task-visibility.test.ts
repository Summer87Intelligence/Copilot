import { describe, expect, it } from "vitest";

import type { ModulePermission, ModuleKey, AccessLevel } from "@/lib/auth/module-permissions";
import { getDefaultPermissionsForRole } from "@/lib/auth/role-permission-presets";
import {
  canAssignToUser,
  canDeleteTask,
  canEditTask,
  canSetCriticalPriority,
  canViewTask,
  filterVisibleTasks,
  guardNonAdminPatch,
  isTaskAdmin,
  resolveTaskCapabilities,
  type TaskViewer,
  type VisibilityTask,
} from "@/lib/tasks/task-visibility";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DANIEL = "user-daniel";
const CAMI = "user-cami";
const OTHER = "user-other";

function withOverride(
  role: string,
  overrides: Partial<Record<ModuleKey, AccessLevel>>
): ModulePermission[] {
  return getDefaultPermissionsForRole(role).map((p) =>
    overrides[p.moduleKey] ? { ...p, accessLevel: overrides[p.moduleKey]! } : p
  );
}

const danielSuperadmin: TaskViewer = {
  userId: DANIEL,
  role: "superadmin",
  permissions: getDefaultPermissionsForRole("superadmin"),
};

// 'usuario': daily_tasks=write, bank_movements=none, clientes/cobranza=read.
const camiUser: TaskViewer = {
  userId: CAMI,
  role: "usuario",
  permissions: getDefaultPermissionsForRole("usuario"),
};

// No-superadmin pero admin del módulo de tareas.
const camiTaskAdmin: TaskViewer = {
  userId: CAMI,
  role: "usuario",
  permissions: withOverride("usuario", { daily_tasks: "admin" }),
};

function task(overrides: Partial<VisibilityTask>): VisibilityTask {
  return {
    module_key: "clientes",
    assigned_to_user_id: null,
    created_by_user_id: null,
    visibility: "workspace",
    ...overrides,
  };
}

// ─── isTaskAdmin ──────────────────────────────────────────────────────────────

describe("isTaskAdmin", () => {
  it("superadmin es admin de tareas", () => {
    expect(isTaskAdmin(danielSuperadmin)).toBe(true);
  });
  it("usuario común no es admin", () => {
    expect(isTaskAdmin(camiUser)).toBe(false);
  });
  it("override daily_tasks=admin habilita admin sin ser superadmin", () => {
    expect(isTaskAdmin(camiTaskAdmin)).toBe(true);
  });
});

// ─── canViewTask (contrato de visibilidad §2) ─────────────────────────────────

describe("canViewTask", () => {
  it("admin ve todas, incluidas privadas ajenas y módulos deshabilitados", () => {
    expect(canViewTask(task({ visibility: "private", assigned_to_user_id: OTHER }), danielSuperadmin)).toBe(true);
    expect(canViewTask(task({ module_key: "bank_movements" }), danielSuperadmin)).toBe(true);
  });

  it("usuario ve tarea de equipo en módulo habilitado", () => {
    expect(canViewTask(task({ visibility: "team", module_key: "clientes" }), camiUser)).toBe(true);
  });

  it("usuario ve tarea de workspace en módulo habilitado", () => {
    expect(canViewTask(task({ visibility: "workspace" }), camiUser)).toBe(true);
  });

  it("usuario ve su propia tarea aunque sea privada", () => {
    expect(canViewTask(task({ visibility: "private", assigned_to_user_id: CAMI }), camiUser)).toBe(true);
    expect(canViewTask(task({ visibility: "private", created_by_user_id: CAMI }), camiUser)).toBe(true);
  });

  it("usuario NO ve tarea privada ajena", () => {
    expect(canViewTask(task({ visibility: "private", assigned_to_user_id: OTHER }), camiUser)).toBe(false);
  });

  it("usuario NO ve tarea de módulo deshabilitado aunque sea workspace", () => {
    expect(canViewTask(task({ module_key: "bank_movements", visibility: "workspace" }), camiUser)).toBe(false);
  });

  it("usuario SÍ ve su propia tarea aun en módulo deshabilitado no aplica gate para creador", () => {
    // El gate de módulo se evalúa antes que la propiedad: sin lectura del módulo,
    // no la ve aunque le pertenezca (evita fugas de módulos deshabilitados).
    expect(canViewTask(task({ module_key: "bank_movements", assigned_to_user_id: CAMI }), camiUser)).toBe(false);
  });

  it("módulo desconocido ('general') no gatea", () => {
    expect(canViewTask(task({ module_key: "general", visibility: "team" }), camiUser)).toBe(true);
  });
});

describe("filterVisibleTasks", () => {
  it("deja solo las visibles", () => {
    const tasks = [
      task({ visibility: "workspace" }),
      task({ visibility: "private", assigned_to_user_id: OTHER }),
      task({ visibility: "private", assigned_to_user_id: CAMI }),
    ];
    expect(filterVisibleTasks(tasks, camiUser)).toHaveLength(2);
    expect(filterVisibleTasks(tasks, danielSuperadmin)).toHaveLength(3);
  });
});

// ─── Capacidades ──────────────────────────────────────────────────────────────

describe("resolveTaskCapabilities", () => {
  it("superadmin tiene todas las capacidades", () => {
    expect(resolveTaskCapabilities(danielSuperadmin)).toMatchObject({
      read: true, create: true, updateOwn: true, updateAll: true, assign: true, delete: true, admin: true,
    });
  });
  it("usuario con write puede crear y actualizar propias, no todo", () => {
    expect(resolveTaskCapabilities(camiUser)).toMatchObject({
      read: true, create: true, updateOwn: true, updateAll: false, assign: false, delete: false, admin: false,
    });
  });
});

// ─── canEditTask / canDeleteTask ──────────────────────────────────────────────

describe("canEditTask", () => {
  it("admin edita cualquiera", () => {
    expect(canEditTask(task({ assigned_to_user_id: OTHER }), danielSuperadmin)).toBe(true);
  });
  it("usuario edita su propia tarea", () => {
    expect(canEditTask(task({ assigned_to_user_id: CAMI }), camiUser)).toBe(true);
    expect(canEditTask(task({ created_by_user_id: CAMI }), camiUser)).toBe(true);
  });
  it("usuario NO edita tarea ajena", () => {
    expect(canEditTask(task({ assigned_to_user_id: OTHER, visibility: "workspace" }), camiUser)).toBe(false);
  });
});

describe("canDeleteTask", () => {
  it("admin borra cualquiera", () => {
    expect(canDeleteTask(task({ created_by_user_id: OTHER }), danielSuperadmin)).toBe(true);
  });
  it("usuario borra solo lo que creó", () => {
    expect(canDeleteTask(task({ created_by_user_id: CAMI }), camiUser)).toBe(true);
    expect(canDeleteTask(task({ created_by_user_id: OTHER, assigned_to_user_id: CAMI }), camiUser)).toBe(false);
  });
});

// ─── Asignación y prioridad crítica ───────────────────────────────────────────

describe("canAssignToUser", () => {
  it("admin asigna a cualquiera", () => {
    expect(canAssignToUser(danielSuperadmin, OTHER)).toBe(true);
  });
  it("usuario solo se autoasigna o deja sin asignar", () => {
    expect(canAssignToUser(camiUser, CAMI)).toBe(true);
    expect(canAssignToUser(camiUser, null)).toBe(true);
    expect(canAssignToUser(camiUser, OTHER)).toBe(false);
  });
});

describe("canSetCriticalPriority", () => {
  it("solo admin", () => {
    expect(canSetCriticalPriority(danielSuperadmin)).toBe(true);
    expect(canSetCriticalPriority(camiUser)).toBe(false);
  });
});

// ─── guardNonAdminPatch ───────────────────────────────────────────────────────

describe("guardNonAdminPatch", () => {
  it("admin pasa siempre", () => {
    expect(guardNonAdminPatch(danielSuperadmin, { fields: ["module_key"], hasAssignment: false }).ok).toBe(true);
  });
  it("no-admin no puede tocar module_key", () => {
    const r = guardNonAdminPatch(camiUser, { fields: ["module_key"], hasAssignment: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("FORBIDDEN_FIELD");
  });
  it("no-admin no puede marcar critical", () => {
    const r = guardNonAdminPatch(camiUser, { fields: ["priority"], priority: "critical", hasAssignment: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("FORBIDDEN_PRIORITY");
  });
  it("no-admin puede setear prioridad no crítica y estado", () => {
    expect(guardNonAdminPatch(camiUser, { fields: ["priority", "status"], priority: "high", hasAssignment: false }).ok).toBe(true);
  });
  it("no-admin no puede reasignar a tercero", () => {
    const r = guardNonAdminPatch(camiUser, {
      fields: ["assigned_to_user_id"], hasAssignment: true, assignedToUserId: OTHER,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("FORBIDDEN_ASSIGN");
  });
  it("no-admin puede autoasignarse", () => {
    expect(guardNonAdminPatch(camiUser, {
      fields: ["assigned_to_user_id"], hasAssignment: true, assignedToUserId: CAMI,
    }).ok).toBe(true);
  });
});
