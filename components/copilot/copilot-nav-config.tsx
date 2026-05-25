/** Navegación del módulo Copilot. */
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BookOpen,
  Building2,
  CheckSquare,
  Database,
  Landmark,
  ListTodo,
  Settings,
  SlidersHorizontal,
  TriangleAlert,
  Users,
  Wallet,
  Banknote,
} from "lucide-react";

export type CopilotNavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
};

/** Bloque del sidebar: título opcional (mayúsculas pequeñas en UI) + enlaces. */
export type CopilotNavGroup = {
  sectionTitle: string | null;
  items: CopilotNavItem[];
};

const COPILOT_NAV_HOY: CopilotNavGroup = {
  sectionTitle: null,
  items: [{ href: "/copilot/hoy", label: "Hoy", icon: ListTodo }],
};

const COPILOT_NAV_PRINCIPAL: CopilotNavGroup = {
  sectionTitle: "Principal",
  items: [
    { href: "/copilot/acciones", label: "Acciones", icon: CheckSquare },
    { href: "/copilot/alertas", label: "Alertas", icon: TriangleAlert },
    { href: "/copilot/cartera", label: "Cartera", icon: Landmark },
    { href: "/copilot/clientes", label: "Clientes", icon: Users },
    { href: "/copilot/tesoreria", label: "Tesorería", icon: Banknote },
    { href: "/copilot/finanzas", label: "Finanzas", icon: Wallet },
    { href: "/copilot/datos", label: "Datos", icon: Database },
  ],
};

const COPILOT_NAV_SISTEMA: CopilotNavGroup = {
  sectionTitle: "Sistema",
  items: [
    { href: "/copilot/operacional", label: "Operacional", icon: Activity },
    { href: "/copilot/configuracion", label: "Configuración", icon: Settings },
    { href: "/copilot/personalizacion", label: "Personalización", icon: SlidersHorizontal },
  ],
};

/** Panel superadmin (se concatena si `isSuperadmin` viene true desde el layout servidor). */
export const COPILOT_NAV_ADMIN_GROUP: CopilotNavGroup = {
  sectionTitle: "Admin",
  items: [
    {
      href: "/admin/companies",
      label: "Empresas",
      icon: Building2,
    },
    {
      href: "/copilot/knowledge/zeta",
      label: "Zeta KB",
      icon: BookOpen,
    },
  ],
};

/** Grupos base del menú lateral. */
export const COPILOT_NAV_BASE_GROUPS: CopilotNavGroup[] = [
  COPILOT_NAV_HOY,
  COPILOT_NAV_PRINCIPAL,
  COPILOT_NAV_SISTEMA,
];

/** Menú lateral completo según rol (resuelto en servidor en `app/copilot/layout.tsx`). */
export function buildCopilotNavItemGroups(
  isSuperadmin: boolean
): CopilotNavGroup[] {
  const base = [...COPILOT_NAV_BASE_GROUPS];
  return isSuperadmin === true ? [...base, COPILOT_NAV_ADMIN_GROUP] : base;
}

/** Lista plana del módulo Copilot (sin rutas admin). */
export const COPILOT_NAV_ITEMS: CopilotNavItem[] =
  COPILOT_NAV_BASE_GROUPS.flatMap((g) => g.items);
