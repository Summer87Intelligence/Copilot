"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MoreHorizontal,
  PauseCircle,
  PenLine,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";

import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostButton,
  CopilotKpiCard,
  CopilotPrimaryButton,
  CopilotSectionTitle,
  copilotPageMainClass,
} from "@/components/copilot/copilot-ui";
import { accessLevelLabel, type AccessLevel, type ModuleKey } from "@/lib/auth/module-permissions";
import { ROLE_LABELS, type SupportedRole } from "@/lib/auth/role-permission-presets";
import { AdminTasksWorkloadPanel } from "@/components/copilot/admin/tasks-workload-panel";

const SIMPLE_ROLES: Array<"superadmin" | "usuario"> = ["superadmin", "usuario"];

// ─── Types ───────────────────────────────────────────────────────────────────

type Permission = { moduleKey: string; accessLevel: string };

type AdminUser = {
  id: string;
  full_name: string;
  email: string;
  username: string | null;
  role: string;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  last_login_at: string | null;
  permissions: Permission[];
};

type AdminSummary = {
  active: number;
  readOnly: number;
  superadmins: number;
  inactive: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MODULE_LABELS: Record<ModuleKey, string> = {
  hoy: "Hoy",
  dashboard: "Dashboard",
  acciones: "Acciones",
  clientes: "Clientes",
  cartera: "Cartera",
  cobranza: "Cobranza",
  tesoreria: "Tesorería",
  finanzas: "Finanzas",
  reportes: "Reportes",
  datos: "Datos",
  agentes: "Agentes IA",
  manual: "Manual",
  admin: "Admin",
  helpdesk: "Mesa de ayuda",
  bank_movements: "Movimientos bancarios",
  daily_tasks: "Tareas diarias",
  ventas: "Ventas",
};

/**
 * Orden visual en Configuración → Permisos (USER-ACCESS-LANDING-PERMISSIONS-001):
 * Inicio → Operación → Análisis → Sistema. No altera MODULE_KEYS (orden
 * canónico usado en el resto del código), solo el orden de despliegue de
 * checkboxes en este modal. Debe contener exactamente los MODULE_KEYS.
 */
const MODULE_DISPLAY_ORDER: ModuleKey[] = [
  // Inicio
  "hoy",
  "daily_tasks",
  // Operación
  "clientes",
  "ventas",
  "cartera",
  "bank_movements",
  "tesoreria",
  "cobranza",
  "acciones",
  // Análisis
  "finanzas",
  "reportes",
  "dashboard",
  "datos",
  "agentes",
  // Sistema
  "admin",
  "manual",
  "helpdesk",
];

const READ_ONLY_ROLES = new Set(["usuario", "demo_readonly"]);

function computeSummary(users: AdminUser[]): AdminSummary {
  const activeUsers = users.filter((u) => !isUserDeleted(u));
  return {
    active: activeUsers.filter((u) => u.is_active).length,
    readOnly: activeUsers.filter((u) => u.is_active && READ_ONLY_ROLES.has(u.role)).length,
    superadmins: activeUsers.filter((u) => u.is_active && u.role === "superadmin").length,
    inactive: activeUsers.filter((u) => !u.is_active).length,
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-UY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function ModalOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Diálogo administrativo"
        className="w-full max-w-lg rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Create User Modal ────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (pin: string) => void }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<SupportedRole>("usuario");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/copilot/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, full_name: fullName, role, pin: pin || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message ?? "Error al crear el usuario.");
        return;
      }
      onCreated(data.temporary_pin ?? "—");
    } catch {
      setError("Error de conexión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="border-b border-[var(--copilot-border)] px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">Nuevo usuario</h2>
          <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">Se asigna el preset de permisos según el rol.</p>
        </div>
        <div className="space-y-3 px-5 py-4">
          {error && (
            <p className="rounded-lg bg-[var(--copilot-tone-danger-bg)] px-3 py-2 text-xs text-[var(--copilot-danger-text-strong)]">{error}</p>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink)]">Email *</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2 text-sm text-[var(--copilot-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/30"
              placeholder="usuario@empresa.com"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink)]">Nombre completo *</span>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2 text-sm text-[var(--copilot-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/30"
              placeholder="Juan Pérez"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink)]">Rol *</span>
            <div className="relative">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as SupportedRole)}
                className="w-full appearance-none rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2 pr-8 text-sm text-[var(--copilot-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/30"
              >
                {SIMPLE_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--copilot-ink-muted)]" />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink)]">PIN temporal (opcional — se genera si no se indica)</span>
            <input
              type="text"
              value={pin}
              onChange={(e) => setPin(e.target.value.toUpperCase())}
              maxLength={12}
              className="w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2 text-sm font-mono text-[var(--copilot-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/30"
              placeholder="Auto-generado"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--copilot-border)] px-5 py-3">
          <CopilotGhostButton type="button" onClick={onClose} disabled={loading}>Cancelar</CopilotGhostButton>
          <CopilotPrimaryButton type="submit" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear usuario"}
          </CopilotPrimaryButton>
        </div>
      </form>
    </ModalOverlay>
  );
}

// ─── PIN Display Modal ────────────────────────────────────────────────────────

function PinDisplayModal({ pin, onClose }: { pin: string; onClose: () => void }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(pin).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="px-5 py-5">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-[var(--copilot-warning-text)]" />
          <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">PIN temporal generado</h2>
        </div>
        <p className="mb-4 text-xs text-[var(--copilot-ink-muted)]">
          Este PIN se muestra solo una vez. Entregalo al usuario de forma segura.
        </p>
        <div className="flex items-center gap-2 rounded-xl border border-[var(--copilot-warning-border)] bg-[var(--copilot-soft-bg)] px-4 py-3">
          <span className="flex-1 font-mono text-xl font-bold tracking-widest text-[var(--copilot-warning-text-strong)]">
            {shown ? pin : "••••••"}
          </span>
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            className="rounded-lg p-1.5 text-[var(--copilot-warning-text)] hover:bg-[var(--copilot-tone-warning-bg)]"
            title={shown ? "Ocultar" : "Mostrar"}
          >
            {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-lg p-1.5 text-[var(--copilot-warning-text)] hover:bg-[var(--copilot-tone-warning-bg)]"
            title="Copiar"
          >
            {copied ? <Check className="h-4 w-4 text-[var(--copilot-success-text)]" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <CopilotPrimaryButton onClick={onClose}>Entendido</CopilotPrimaryButton>
        </div>
      </div>
    </ModalOverlay>
  );
}

function isUserDeleted(user: AdminUser): boolean {
  return Boolean(user.deleted_at);
}

function userStatusLabel(user: AdminUser): string {
  if (isUserDeleted(user)) return "Eliminado";
  return user.is_active ? "Activo" : "Inactivo";
}

function userStatusTone(user: AdminUser): "success" | "neutral" | "danger" {
  if (isUserDeleted(user)) return "danger";
  return user.is_active ? "success" : "neutral";
}

type UserActionsMenuProps = {
  user: AdminUser;
  isLoadingActive: boolean;
  isLoadingPin: boolean;
  onEditPermissions: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onResetPin: () => void;
  onDelete: () => void;
};

function UserActionsMenu({
  user,
  isLoadingActive,
  isLoadingPin,
  onEditPermissions,
  onDeactivate,
  onReactivate,
  onResetPin,
  onDelete,
}: UserActionsMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const deleted = isUserDeleted(user);

  const desktopButtonClass =
    "rounded-lg p-1.5 text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-border)] disabled:opacity-50";

  return (
    <>
      {/* Desktop: iconos con tooltip */}
      <div className="hidden items-center gap-1.5 md:flex">
        {!deleted && (
          <>
            <button
              type="button"
              title="Editar permisos"
              aria-label="Editar permisos"
              onClick={onEditPermissions}
              className={`${desktopButtonClass} hover:text-[var(--copilot-accent)]`}
            >
              <PenLine className="h-3.5 w-3.5" />
            </button>
            {user.is_active ? (
              <button
                type="button"
                title="Desactivar cuenta"
                aria-label="Desactivar cuenta"
                onClick={onDeactivate}
                disabled={isLoadingActive}
                className={`${desktopButtonClass} hover:text-[var(--copilot-warning-text-strong)]`}
              >
                {isLoadingActive ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PauseCircle className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <button
                type="button"
                title="Reactivar cuenta"
                aria-label="Reactivar cuenta"
                onClick={onReactivate}
                disabled={isLoadingActive}
                className={`${desktopButtonClass} hover:text-[var(--copilot-accent)]`}
              >
                {isLoadingActive ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserCheck className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            <button
              type="button"
              title="Resetear PIN"
              aria-label="Resetear PIN"
              onClick={onResetPin}
              disabled={isLoadingPin}
              className={`${desktopButtonClass} hover:bg-[var(--copilot-tone-warning-bg)] hover:text-[var(--copilot-warning-text-strong)]`}
            >
              {isLoadingPin ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <KeyRound className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              title="Eliminar cuenta"
              aria-label="Eliminar cuenta"
              onClick={onDelete}
              className={`${desktopButtonClass} hover:bg-[var(--copilot-tone-danger-bg)] hover:text-[var(--copilot-danger-text-strong)]`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Mobile: menú con texto */}
      <div className="relative md:hidden">
        {!deleted && (
          <>
            <button
              type="button"
              aria-label="Abrir menú de acciones"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--copilot-border)] px-2 py-1 text-xs font-medium text-[var(--copilot-ink)]"
            >
              <MoreHorizontal className="h-4 w-4" />
              Acciones
            </button>
            {menuOpen ? (
              <div className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] py-1 shadow-lg" role="menu" aria-label={`Acciones para ${user.full_name}`}>
                <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-xs hover:bg-[var(--copilot-border)]/40" onClick={() => { setMenuOpen(false); onEditPermissions(); }}>
                  Editar permisos
                </button>
                {user.is_active ? (
                  <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-xs hover:bg-[var(--copilot-border)]/40" onClick={() => { setMenuOpen(false); onDeactivate(); }}>
                    Desactivar cuenta
                  </button>
                ) : (
                  <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-xs hover:bg-[var(--copilot-border)]/40" onClick={() => { setMenuOpen(false); onReactivate(); }}>
                    Reactivar cuenta
                  </button>
                )}
                <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-xs hover:bg-[var(--copilot-border)]/40" onClick={() => { setMenuOpen(false); onResetPin(); }}>
                  Resetear PIN
                </button>
                <button type="button" role="menuitem" className="block w-full border-t border-[var(--copilot-border)] px-3 py-2 text-left text-xs text-[var(--copilot-danger-text-strong)] hover:bg-[var(--copilot-tone-danger-bg)]" onClick={() => { setMenuOpen(false); onDelete(); }}>
                  Eliminar cuenta
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

// ─── Deactivate User Modal ────────────────────────────────────────────────────

function DeactivateUserModal({
  user,
  onClose,
  onDeactivated,
}: {
  user: AdminUser;
  onClose: () => void;
  onDeactivated: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDeactivate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/copilot/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: false }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? "Error al desactivar la cuenta.");
        return;
      }
      onDeactivated(
        data.message ??
          "Cuenta desactivada. La persona no podrá iniciar sesión, pero su información e historial se conservan."
      );
    } catch {
      setError("Error de conexión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="px-5 py-5">
        <div className="mb-3 flex items-center gap-2">
          <PauseCircle className="h-5 w-5 text-[var(--copilot-warning-text-strong)]" />
          <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">Desactivar cuenta</h2>
        </div>
        <p className="mb-4 text-xs text-[var(--copilot-ink-muted)]">
          Esta persona no podrá iniciar sesión, pero su información e historial se conservarán.
        </p>
        <p className="mb-4 text-xs text-[var(--copilot-ink)]">
          <span className="font-semibold">{user.full_name}</span> ({user.email})
        </p>
        {error && (
          <p className="mb-3 rounded-lg bg-[var(--copilot-tone-danger-bg)] px-3 py-2 text-xs text-[var(--copilot-danger-text-strong)]">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <CopilotGhostButton onClick={onClose} disabled={loading}>Cancelar</CopilotGhostButton>
          <button
            type="button"
            onClick={() => void handleDeactivate()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] px-4 py-2 text-xs font-semibold text-[var(--copilot-warning-text-strong)] hover:bg-[var(--copilot-badge-warning-bg)] disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PauseCircle className="h-3.5 w-3.5" />}
            Desactivar cuenta
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ─── Delete User Modal ────────────────────────────────────────────────────────

function DeleteUserModal({
  user,
  onClose,
  onDeleted,
}: {
  user: AdminUser;
  onClose: () => void;
  onDeleted: (message: string) => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmValue = user.email.trim().toLowerCase();

  async function handleDelete() {
    if (confirm.trim().toLowerCase() !== confirmValue) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/copilot/admin/users/${user.id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? "Error al eliminar.");
        return;
      }
      onDeleted(data.message ?? "Cuenta eliminada. El acceso fue revocado y no se puede deshacer.");
    } catch {
      setError("Error de conexión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="px-5 py-5">
        <div className="mb-3 flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-[var(--copilot-danger-text)]" />
          <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">Eliminar usuario</h2>
        </div>
        <p className="mb-1 text-xs text-[var(--copilot-ink-muted)]">
          Esta acción elimina el acceso y la cuenta. No se puede deshacer.
        </p>
        <p className="mb-4 text-xs text-[var(--copilot-ink-muted)]">
          Escribí el email{" "}
          <span className="font-mono font-bold text-[var(--copilot-ink)]">{user.email}</span> para confirmar.
        </p>
        {error && (
          <p className="mb-3 rounded-lg bg-[var(--copilot-tone-danger-bg)] px-3 py-2 text-xs text-[var(--copilot-danger-text-strong)]">{error}</p>
        )}
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={user.email}
          aria-label="Email de confirmación para eliminar cuenta"
          className="mb-4 w-full rounded-lg border border-[var(--copilot-danger-border)] bg-[var(--copilot-card-bg)] px-3 py-2 text-sm font-mono text-[var(--copilot-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-danger-border)]/40"
        />
        <div className="flex justify-end gap-2">
          <CopilotGhostButton onClick={onClose} disabled={loading}>Cancelar</CopilotGhostButton>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={confirm.trim().toLowerCase() !== confirmValue || loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-4 py-2 text-xs font-semibold text-[var(--copilot-danger-text-strong)] hover:bg-[var(--copilot-badge-danger-bg)] disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Eliminar cuenta
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ─── Edit Permissions Modal ───────────────────────────────────────────────────

function EditPermissionsModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialPerms = Object.fromEntries(
    user.permissions.map((p) => [p.moduleKey, p.accessLevel as AccessLevel])
  ) as Record<string, AccessLevel>;

  const [perms, setPerms] = useState<Record<string, AccessLevel>>(initialPerms);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSuperadmin = user.role === "superadmin";
  const visibleModules = isSuperadmin
    ? MODULE_DISPLAY_ORDER
    : MODULE_DISPLAY_ORDER.filter((k) => k !== "admin");

  function accessLevelToChecks(level: AccessLevel): { canView: boolean; canEdit: boolean } {
    if (level === "write" || level === "admin") return { canView: true, canEdit: true };
    if (level === "read") return { canView: true, canEdit: false };
    return { canView: false, canEdit: false };
  }

  function checksToAccessLevel(canView: boolean, canEdit: boolean): AccessLevel {
    if (canEdit) return "write";
    if (canView) return "read";
    return "none";
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    const permissions = visibleModules.map((k) => ({
      moduleKey: k,
      accessLevel: perms[k] ?? "none",
    }));
    try {
      const res = await fetch(`/api/copilot/admin/users/${user.id}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message ?? "Error al guardar.");
        return;
      }
      onSaved();
    } catch {
      setError("Error de conexión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="border-b border-[var(--copilot-border)] px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">Editar permisos</h2>
        <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
          {user.full_name} · <span className="font-medium">{ROLE_LABELS[user.role as SupportedRole] ?? user.role}</span>
        </p>
      </div>
      <div className="max-h-96 overflow-y-auto px-5 py-4">
        {error && (
          <p className="mb-3 rounded-lg bg-[var(--copilot-tone-danger-bg)] px-3 py-2 text-xs text-[var(--copilot-danger-text-strong)]">{error}</p>
        )}
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--copilot-border)]">
              <th className="pb-2 text-left font-semibold text-[var(--copilot-ink-muted)]">Módulo</th>
              <th className="pb-2 text-center font-semibold text-[var(--copilot-ink-muted)]">Ver</th>
              <th className="pb-2 text-center font-semibold text-[var(--copilot-ink-muted)]">Modificar</th>
            </tr>
          </thead>
          <tbody>
            {visibleModules.map((moduleKey) => {
              const level = perms[moduleKey] ?? "none";
              const isLocked = isSuperadmin && moduleKey === "admin";

              // FASE BANK-RECONCILIATION-END-TO-END-STABILIZATION-001 — Banco
              // tiene un nivel intermedio (`inflow_readonly`, solo ingresos)
              // que los checkboxes Ver/Modificar no pueden representar. Un
              // select explícito evita que el admin arme una combinación
              // imposible ("ver" + "inflow_readonly" al mismo tiempo).
              if (moduleKey === "bank_movements") {
                return (
                  <tr key={moduleKey} className="border-b border-[var(--copilot-border)]/50">
                    <td className="py-2 font-medium text-[var(--copilot-ink)]">{MODULE_LABELS[moduleKey]}</td>
                    <td className="py-2 text-center" colSpan={2}>
                      <select
                        value={level}
                        onChange={(e) =>
                          setPerms((prev) => ({
                            ...prev,
                            [moduleKey]: e.target.value as AccessLevel,
                          }))
                        }
                        aria-label={`Nivel de acceso para ${MODULE_LABELS[moduleKey]}`}
                        className="w-full max-w-[220px] rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-2 py-1 text-xs text-[var(--copilot-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/40"
                      >
                        {(["none", "inflow_readonly", "read", "write"] as const).map((option) => (
                          <option key={option} value={option}>
                            {accessLevelLabel(option)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              }

              const { canView, canEdit } = accessLevelToChecks(level);
              return (
                <tr key={moduleKey} className="border-b border-[var(--copilot-border)]/50">
                  <td className="py-2 font-medium text-[var(--copilot-ink)]">{MODULE_LABELS[moduleKey]}</td>
                  <td className="py-2 text-center">
                    <input
                      type="checkbox"
                      checked={canView || isLocked}
                      disabled={isLocked}
                      onChange={(e) => {
                        const nextView = e.target.checked;
                        const nextEdit = nextView ? canEdit : false;
                        setPerms((prev) => ({ ...prev, [moduleKey]: checksToAccessLevel(nextView, nextEdit) }));
                      }}
                      className="h-3.5 w-3.5 accent-[var(--copilot-accent)] disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
                    />
                  </td>
                  <td className="py-2 text-center">
                    <input
                      type="checkbox"
                      checked={canEdit || isLocked}
                      disabled={isLocked}
                      onChange={(e) => {
                        const nextEdit = e.target.checked;
                        const nextView = nextEdit ? true : canView;
                        setPerms((prev) => ({ ...prev, [moduleKey]: checksToAccessLevel(nextView, nextEdit) }));
                      }}
                      className="h-3.5 w-3.5 accent-[var(--copilot-accent)] disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--copilot-border)] px-5 py-3">
        <CopilotGhostButton onClick={onClose} disabled={loading}>Cancelar</CopilotGhostButton>
        <CopilotPrimaryButton onClick={handleSave} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar cambios"}
        </CopilotPrimaryButton>
      </div>
    </ModalOverlay>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminPanelClient() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Toast inline para errores de acciones por usuario (no usa alert nativo). */
  const [actionError, setActionError] = useState<string | null>(null);
  /** Toast inline para acciones exitosas. */
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  /** Usuario al que se le va a resetear PIN — abre modal de confirmación. */
  const [resettingPinUser, setResettingPinUser] = useState<AdminUser | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [pendingPin, setPendingPin] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [deactivatingUser, setDeactivatingUser] = useState<AdminUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);

  const [actionState, setActionState] = useState<Record<string, "loading" | "done">>({});
  const [roleChanging, setRoleChanging] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/copilot/admin/users");
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message ?? "Error al cargar usuarios.");
        return;
      }
      setUsers(data.users ?? []);
    } catch {
      setError("Error de conexión.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadUsers(); }, []);

  useEffect(() => {
    if (!actionSuccess) return;
    const timer = setTimeout(() => setActionSuccess(null), 5000);
    return () => clearTimeout(timer);
  }, [actionSuccess]);

  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(null), 8000);
    return () => clearTimeout(timer);
  }, [actionError]);

  function showActionSuccess(message: string) {
    setActionError(null);
    setActionSuccess(message);
  }

  function showActionError(message: string) {
    setActionSuccess(null);
    setActionError(message);
  }

  async function handleReactivate(user: AdminUser) {
    const key = `active-${user.id}`;
    setActionState((s) => ({ ...s, [key]: "loading" }));
    setActionError(null);
    try {
      const res = await fetch(`/api/copilot/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showActionError(data.message ?? "Error al reactivar la cuenta.");
        return;
      }
      showActionSuccess(data.message ?? "Cuenta reactivada. La persona ya puede iniciar sesión.");
      await loadUsers();
    } finally {
      setActionState((s) => ({ ...s, [key]: "done" }));
    }
  }

  async function handleRoleChange(user: AdminUser, newRole: string) {
    setRoleChanging(user.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/copilot/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showActionError(data.message ?? "Error al cambiar el rol del usuario.");
        return;
      }
      showActionSuccess("Rol actualizado.");
      await loadUsers();
    } finally {
      setRoleChanging(null);
    }
  }

  /** Lanzado desde el modal de confirmación (no usa confirm nativo). */
  async function doResetPin(user: AdminUser) {
    const key = `pin-${user.id}`;
    setActionState((s) => ({ ...s, [key]: "loading" }));
    setActionError(null);
    try {
      const res = await fetch(`/api/copilot/admin/users/${user.id}/reset-pin`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showActionError(data.message ?? "Error al resetear el PIN.");
        return;
      }
      setPendingPin(data.temporary_pin ?? "—");
      showActionSuccess("PIN reseteado. Compartilo de forma segura con el usuario.");
    } finally {
      setActionState((s) => ({ ...s, [key]: "done" }));
      setResettingPinUser(null);
    }
  }

  const summary = computeSummary(users);

  return (
    <main className={copilotPageMainClass}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-[var(--copilot-ink)]">Panel administrativo</h1>
          <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
            Gestioná usuarios, roles y permisos de acceso a la empresa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CopilotGhostButton onClick={() => void loadUsers()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </CopilotGhostButton>
          <CopilotPrimaryButton onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Nuevo usuario
          </CopilotPrimaryButton>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CopilotKpiCard
          label="Usuarios activos"
          value={loading ? "—" : String(summary.active)}
          hint="Pueden ingresar a esta empresa"
        />
        <CopilotKpiCard
          label="Solo lectura"
          value={loading ? "—" : String(summary.readOnly)}
          hint="Acceso de consulta"
        />
        <CopilotKpiCard
          label="Administradores"
          value={loading ? "—" : String(summary.superadmins)}
          hint="Gestionan usuarios y permisos"
        />
        <CopilotKpiCard
          label="Inactivos"
          value={loading ? "—" : String(summary.inactive)}
          hint="Sin acceso activo"
        />
      </div>

      {/* Carga de trabajo de tareas (FASE 7) */}
      <AdminTasksWorkloadPanel />

      {/* Error */}
      {error && (
        <CopilotCard className="flex items-center gap-2 border-[var(--copilot-danger-border)] bg-[var(--copilot-card-bg)]">
          <AlertTriangle className="h-4 w-4 text-[var(--copilot-danger-text)]" />
          <p className="text-xs text-[var(--copilot-danger-text-strong)]">{error}</p>
        </CopilotCard>
      )}

      {/* Users Table */}
      <CopilotCard className="overflow-hidden p-0">
        <div className="border-b border-[var(--copilot-border)] px-4 py-3">
          <CopilotSectionTitle
            title="Usuarios de la empresa"
            subtitle={`${users.length} usuario${users.length !== 1 ? "s" : ""} encontrado${users.length !== 1 ? "s" : ""}`}
          />
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--copilot-ink-muted)]" />
          </div>
        )}

        {!loading && users.length === 0 && !error && (
          <div className="py-12 text-center">
            <Users className="mx-auto mb-2 h-8 w-8 text-[var(--copilot-ink-muted)]" />
            <p className="text-sm text-[var(--copilot-ink-muted)]">No hay usuarios en esta empresa.</p>
          </div>
        )}

        {!loading && users.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-[var(--copilot-border)] bg-[var(--copilot-table-header-bg)]">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold text-[var(--copilot-ink-muted)]">Usuario</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[var(--copilot-ink-muted)]">Rol</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[var(--copilot-ink-muted)]">Estado</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[var(--copilot-ink-muted)]">Último acceso</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[var(--copilot-ink-muted)]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const pinKey = `pin-${user.id}`;
                  const activeKey = `active-${user.id}`;
                  const isLoadingPin = actionState[pinKey] === "loading";
                  const isLoadingActive = actionState[activeKey] === "loading";

                  return (
                    <tr
                      key={user.id}
                      className="border-b border-[var(--copilot-border)]/50 last:border-0"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--copilot-ink)]">{user.full_name}</div>
                        <div className="text-[var(--copilot-ink-muted)]">{user.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        {roleChanging === user.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--copilot-ink-muted)]" />
                        ) : (
                          <div className="relative">
                            <select
                              value={SIMPLE_ROLES.includes(user.role as "superadmin" | "usuario") ? user.role : user.role}
                              onChange={(e) => void handleRoleChange(user, e.target.value)}
                              disabled={isUserDeleted(user)}
                              className="appearance-none rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-2 py-1 pr-6 text-xs text-[var(--copilot-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/30 disabled:opacity-60"
                            >
                              {SIMPLE_ROLES.map((r) => (
                                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                              ))}
                              {!SIMPLE_ROLES.includes(user.role as "superadmin" | "usuario") && (
                                <option value={user.role}>{ROLE_LABELS[user.role as SupportedRole] ?? user.role}</option>
                              )}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--copilot-ink-muted)]" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <CopilotBadge tone={userStatusTone(user)}>
                          {userStatusLabel(user)}
                        </CopilotBadge>
                      </td>
                      <td className="px-4 py-3 text-[var(--copilot-ink-muted)]">
                        {formatDate(user.last_login_at)}
                      </td>
                      <td className="px-4 py-3">
                        <UserActionsMenu
                          user={user}
                          isLoadingActive={isLoadingActive}
                          isLoadingPin={isLoadingPin}
                          onEditPermissions={() => setEditingUser(user)}
                          onDeactivate={() => setDeactivatingUser(user)}
                          onReactivate={() => void handleReactivate(user)}
                          onResetPin={() => setResettingPinUser(user)}
                          onDelete={() => setDeletingUser(user)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CopilotCard>

      {/* Security notice */}
      <CopilotCard className="flex items-start gap-2.5 border-[var(--copilot-border)] bg-[var(--copilot-tone-neutral-bg)]/60">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--copilot-accent)]" />
        <div className="text-xs text-[var(--copilot-accent)]">
          <p className="font-semibold">Recomendaciones de seguridad</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-[var(--copilot-accent)]">
            <li>No compartir un usuario administrador entre personas.</li>
            <li>Usá la cuenta <em>Demo solo lectura</em> para mostrar el sistema sin riesgo.</li>
            <li>Resetear el PIN invalida la sesión activa de ese usuario.</li>
            <li>Mantener siempre al menos un administrador activo.</li>
          </ul>
        </div>
      </CopilotCard>

      {/* Modals */}
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(pin) => {
            setShowCreate(false);
            setPendingPin(pin);
            void loadUsers();
          }}
        />
      )}
      {pendingPin && (
        <PinDisplayModal pin={pendingPin} onClose={() => setPendingPin(null)} />
      )}
      {editingUser && (
        <EditPermissionsModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => {
            setEditingUser(null);
            void loadUsers();
          }}
        />
      )}
      {deactivatingUser && (
        <DeactivateUserModal
          user={deactivatingUser}
          onClose={() => setDeactivatingUser(null)}
          onDeactivated={(message) => {
            setDeactivatingUser(null);
            showActionSuccess(message);
            void loadUsers();
          }}
        />
      )}
      {deletingUser && (
        <DeleteUserModal
          user={deletingUser}
          onClose={() => setDeletingUser(null)}
          onDeleted={(message) => {
            setDeletingUser(null);
            showActionSuccess(message);
            void loadUsers();
          }}
        />
      )}
      {actionSuccess && (
        <div
          className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-2 rounded-xl border border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] px-4 py-3 text-xs text-[var(--copilot-success-text-strong)] shadow-lg"
          role="status"
          aria-live="polite"
        >
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="flex-1">{actionSuccess}</p>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="rounded p-0.5 hover:bg-[var(--copilot-success-border)]/30"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      )}
      {resettingPinUser && (
        <ResetPinConfirmModal
          user={resettingPinUser}
          loading={actionState[`pin-${resettingPinUser.id}`] === "loading"}
          onClose={() => setResettingPinUser(null)}
          onConfirm={() => void doResetPin(resettingPinUser)}
        />
      )}
      {actionError && (
        <div
          className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-2 rounded-xl border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-4 py-3 text-xs text-[var(--copilot-danger-text-strong)] shadow-lg"
          role="alert"
          aria-live="polite"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="flex-1">{actionError}</p>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="rounded p-0.5 hover:bg-[var(--copilot-danger-border)]/30"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}

// ─── Reset PIN Confirm Modal ──────────────────────────────────────────────────

function ResetPinConfirmModal({
  user,
  loading,
  onClose,
  onConfirm,
}: {
  user: AdminUser;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalOverlay onClose={onClose}>
      <div className="px-5 py-5">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-[var(--copilot-warning-text)]" />
          <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">Resetear PIN</h2>
        </div>
        <p className="mb-2 text-xs text-[var(--copilot-ink-muted)]">
          Vas a generar un nuevo PIN temporal para{" "}
          <span className="font-semibold text-[var(--copilot-ink)]">{user.full_name}</span>{" "}
          ({user.email}).
        </p>
        <p className="mb-4 text-xs text-[var(--copilot-ink-muted)]">
          La sesión activa del usuario quedará invalidada. Tendrá que ingresar con el PIN nuevo.
        </p>
        <div className="flex justify-end gap-2">
          <CopilotGhostButton onClick={onClose} disabled={loading}>Cancelar</CopilotGhostButton>
          <CopilotPrimaryButton onClick={onConfirm} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generar PIN nuevo"}
          </CopilotPrimaryButton>
        </div>
      </div>
    </ModalOverlay>
  );
}
