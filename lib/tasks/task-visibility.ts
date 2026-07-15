/**
 * FASE 7 — Contrato de visibilidad y capacidades de tareas (núcleo puro).
 *
 * Toda la lógica multiusuario vive acá y NO toca la red ni la DB: recibe la tarea
 * y el "viewer" (usuario + rol + permisos efectivos ya resueltos server-side) y
 * decide qué puede ver y hacer. La frontera dura de workspace la garantiza RLS;
 * esta capa refina la visibilidad por usuario/rol/módulo/visibility.
 *
 * Determinista y testeable de punta a punta (ver task-visibility.test.ts).
 */

import {
  canAdminModule,
  canReadModule,
  canWriteModule,
  isValidModuleKey,
  type ModulePermission,
} from "@/lib/auth/module-permissions";
import {
  taskVisibility,
  type DailyTask,
  type DailyTaskPriority,
} from "@/lib/daily-tasks/daily-tasks-types";

const DAILY_TASKS_MODULE = "daily_tasks" as const;

export type TaskViewer = {
  userId: string;
  role: string;
  /** Permisos de módulo efectivos (preset + overrides), ya resueltos. */
  permissions: ModulePermission[];
};

/** Campos mínimos que la visibilidad necesita (facilita fixtures de test). */
export type VisibilityTask = Pick<
  DailyTask,
  "module_key" | "assigned_to_user_id" | "created_by_user_id" | "visibility"
>;

// ─── Rol admin de tareas ──────────────────────────────────────────────────────

/** Admin de tareas: superadmin o access_level 'admin' en el módulo daily_tasks. */
export function isTaskAdmin(viewer: Pick<TaskViewer, "role" | "permissions">): boolean {
  if (viewer.role.trim().toLowerCase() === "superadmin") return true;
  return canAdminModule(viewer.role, viewer.permissions, DAILY_TASKS_MODULE);
}

function isAssignee(task: VisibilityTask, userId: string): boolean {
  return !!task.assigned_to_user_id && task.assigned_to_user_id === userId;
}

function isCreator(task: VisibilityTask, userId: string): boolean {
  return !!task.created_by_user_id && task.created_by_user_id === userId;
}

/** El viewer puede LEER el módulo de origen de la tarea. */
function canReadOriginModule(task: VisibilityTask, viewer: TaskViewer): boolean {
  // Módulos desconocidos (p.ej. 'general') no gatean: son tareas transversales.
  if (!isValidModuleKey(task.module_key)) return true;
  return canReadModule(viewer.role, viewer.permissions, task.module_key);
}

// ─── Visibilidad de lectura ───────────────────────────────────────────────────

/**
 * ¿Puede el viewer VER esta tarea? Asume que ya pasó el gate de entrada
 * (read en el módulo daily_tasks + mismo workspace por RLS).
 *
 *  - Admin ve todo.
 *  - Requiere lectura del módulo de origen (módulos deshabilitados → oculta).
 *  - Asignado o creador → siempre la ve.
 *  - visibility 'private' ajena → oculta.
 *  - visibility 'team' / 'workspace' → visible si pasó el gate de módulo.
 */
export function canViewTask(task: VisibilityTask, viewer: TaskViewer): boolean {
  if (isTaskAdmin(viewer)) return true;
  if (!canReadOriginModule(task, viewer)) return false;

  if (isAssignee(task, viewer.userId) || isCreator(task, viewer.userId)) return true;

  return taskVisibility(task) !== "private";
}

/** Filtra una lista de tareas dejando solo las visibles para el viewer. */
export function filterVisibleTasks<T extends VisibilityTask>(
  tasks: readonly T[],
  viewer: TaskViewer
): T[] {
  return tasks.filter((t) => canViewTask(t, viewer));
}

// ─── Capacidades (mapeo permisos de módulo → capacidades de tareas) ────────────

export type TaskCapabilities = {
  /** Ver el módulo de Tareas. */
  read: boolean;
  /** Crear tareas manuales en módulos habilitados. */
  create: boolean;
  /** Actualizar tareas propias (asignadas o creadas por el usuario). */
  updateOwn: boolean;
  /** Actualizar cualquier tarea del workspace. */
  updateAll: boolean;
  /** Asignar/reasignar tareas a otros usuarios. */
  assign: boolean;
  /** Eliminar tareas de terceros. */
  delete: boolean;
  /** Capacidad administrativa total sobre tareas. */
  admin: boolean;
};

/**
 * Mapea los niveles de módulo reales (read/write/admin) al modelo de permisos
 * de tareas de FASE 7. No introduce un RBAC paralelo: reusa module-permissions.
 *
 *  read      ← read en daily_tasks
 *  create    ← write en daily_tasks
 *  updateOwn ← write en daily_tasks
 *  updateAll ← admin en daily_tasks
 *  assign    ← admin en daily_tasks
 *  delete    ← admin en daily_tasks
 */
export function resolveTaskCapabilities(
  viewer: Pick<TaskViewer, "role" | "permissions">
): TaskCapabilities {
  const admin = isTaskAdmin(viewer);
  const write = admin || canWriteModule(viewer.role, viewer.permissions, DAILY_TASKS_MODULE);
  const read = admin || canReadModule(viewer.role, viewer.permissions, DAILY_TASKS_MODULE);
  return {
    read,
    create: write,
    updateOwn: write,
    updateAll: admin,
    assign: admin,
    delete: admin,
    admin,
  };
}

// ─── Edición por tarea ─────────────────────────────────────────────────────────

/** ¿Puede el viewer MODIFICAR esta tarea concreta? */
export function canEditTask(task: VisibilityTask, viewer: TaskViewer): boolean {
  const caps = resolveTaskCapabilities(viewer);
  if (caps.updateAll) return true;
  if (!caps.updateOwn) return false;
  if (!canViewTask(task, viewer)) return false;
  return isAssignee(task, viewer.userId) || isCreator(task, viewer.userId);
}

/** ¿Puede el viewer ELIMINAR esta tarea? (delete = admin). */
export function canDeleteTask(task: VisibilityTask, viewer: TaskViewer): boolean {
  const caps = resolveTaskCapabilities(viewer);
  if (caps.delete) return true;
  // Un no-admin solo puede borrar una tarea manual que él mismo creó.
  if (!caps.updateOwn) return false;
  return isCreator(task, viewer.userId);
}

/** Solo un admin puede elevar una tarea a prioridad crítica. */
export function canSetCriticalPriority(viewer: Pick<TaskViewer, "role" | "permissions">): boolean {
  return isTaskAdmin(viewer);
}

/**
 * ¿Puede el viewer asignar/reasignar esta tarea al usuario `targetUserId`?
 *  - Admin (assign) → a cualquiera del workspace.
 *  - No-admin        → solo a sí mismo (autoasignación), nunca a terceros.
 *  - null (sin asignar) → permitido para admin (bandeja) y para el creador.
 */
export function canAssignToUser(
  viewer: TaskViewer,
  targetUserId: string | null
): boolean {
  const caps = resolveTaskCapabilities(viewer);
  if (caps.assign) return true;
  if (!caps.updateOwn) return false;
  if (targetUserId === null) return true; // dejar sin asignar
  return targetUserId === viewer.userId; // solo autoasignación
}

/**
 * Campos que un NO-admin puede tocar en una tarea propia. El resto (module_key,
 * created_by, source, workspace, visibilidad ajena) queda reservado a admin.
 */
export const NON_ADMIN_EDITABLE_FIELDS = [
  "title",
  "description",
  "status",
  "priority",
  "due_date",
  "action_url",
] as const;
export type NonAdminEditableField = (typeof NON_ADMIN_EDITABLE_FIELDS)[number];

export function isNonAdminEditableField(field: string): field is NonAdminEditableField {
  return (NON_ADMIN_EDITABLE_FIELDS as readonly string[]).includes(field);
}

export type PatchGuardInput = {
  /** Claves presentes en el patch entrante (ya validado por Zod). */
  fields: readonly string[];
  priority?: DailyTaskPriority;
  /** Nuevo asignado propuesto (si el patch lo trae). */
  assignedToUserId?: string | null;
  hasAssignment: boolean;
};

export type PatchGuardResult =
  | { ok: true }
  | { ok: false; code: "FORBIDDEN_FIELD" | "FORBIDDEN_PRIORITY" | "FORBIDDEN_ASSIGN"; message: string };

/**
 * Valida un patch de un no-admin sobre una tarea propia:
 *  - solo campos permitidos;
 *  - no 'critical';
 *  - no reasignar a terceros.
 * Un admin siempre pasa (se valida antes con canEditTask/updateAll).
 */
export function guardNonAdminPatch(viewer: TaskViewer, input: PatchGuardInput): PatchGuardResult {
  if (isTaskAdmin(viewer)) return { ok: true };

  for (const field of input.fields) {
    if (field === "assigned_to_user_id") continue; // se valida abajo
    if (!isNonAdminEditableField(field)) {
      return {
        ok: false,
        code: "FORBIDDEN_FIELD",
        message: `No podés modificar el campo "${field}" en esta tarea.`,
      };
    }
  }

  if (input.priority === "critical") {
    return {
      ok: false,
      code: "FORBIDDEN_PRIORITY",
      message: "Solo un administrador puede marcar una tarea como crítica.",
    };
  }

  if (input.hasAssignment && !canAssignToUser(viewer, input.assignedToUserId ?? null)) {
    return {
      ok: false,
      code: "FORBIDDEN_ASSIGN",
      message: "No podés reasignar esta tarea a otro usuario.",
    };
  }

  return { ok: true };
}
