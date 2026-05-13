/** Navegación del entorno PROTOTIPO (`/copilot`). */
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  Building2,
  CheckSquare,
  Database,
  Landmark,
  LayoutDashboard,
  Lightbulb,
  ListTodo,
  MessageSquareMore,
  Settings,
  Siren,
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

/** Flujo principal: narrativa operativa del producto. */
const COPILOT_NAV_MAIN: CopilotNavItem[] = [
  {
    href: "/copilot/rutas",
    label: "Qué hacer hoy",
    shortLabel: "Hoy",
    icon: ListTodo,
  },
  { href: "/copilot", label: "Inicio", icon: LayoutDashboard },
  {
    href: "/copilot/datos",
    label: "Datos / Integraciones",
    shortLabel: "Datos",
    icon: Database,
  },
  {
    href: "/copilot/agentes",
    label: "Agentes IA",
    shortLabel: "Agentes",
    icon: Bot,
  },
  {
    href: "/copilot/gestion-ia",
    label: "Acciones recomendadas",
    shortLabel: "Acciones",
    icon: Brain,
  },
  { href: "/copilot/alertas", label: "Alertas", icon: TriangleAlert },
  {
    href: "/copilot/atencion-prioritaria",
    label: "Atención prioritaria",
    shortLabel: "Prioridad",
    icon: Siren,
  },
  { href: "/copilot/acciones", label: "Acciones", icon: CheckSquare },
  { href: "/copilot/clientes", label: "Clientes", icon: Users },
  { href: "/copilot/finanzas", label: "Finanzas", icon: Wallet },
  { href: "/copilot/tesoreria", label: "Tesorería", icon: Banknote },
  { href: "/copilot/cartera", label: "Cartera", icon: Landmark },
  { href: "/copilot/escenarios", label: "Escenarios", icon: BarChart3 },
  { href: "/copilot/insights", label: "Insights", icon: Lightbulb },
];

/** Configuración y soporte (separado visualmente en el sidebar). */
const COPILOT_NAV_SYSTEM: CopilotNavItem[] = [
  { href: "/copilot/configuracion", label: "Configuración", icon: Settings },
  {
    href: "/copilot/personalizacion",
    label: "Personalización",
    icon: SlidersHorizontal,
  },
  {
    href: "/copilot/mesa-de-ayuda",
    label: "Mesa de ayuda",
    shortLabel: "Ayuda",
    icon: MessageSquareMore,
  },
];

/** Grupos base del menú lateral: principal + sistema. */
export const COPILOT_NAV_BASE_GROUPS: CopilotNavGroup[] = [
  { sectionTitle: null, items: COPILOT_NAV_MAIN },
  { sectionTitle: "Sistema", items: COPILOT_NAV_SYSTEM },
];

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
      label: "Biblioteca Zeta",
      shortLabel: "Zeta KB",
      icon: BookOpen,
    },
  ],
};

/** Menú lateral completo según rol (resuelto en servidor en `app/copilot/layout.tsx`). */
export function buildCopilotNavItemGroups(
  isSuperadmin: boolean
): CopilotNavGroup[] {
  const base = [...COPILOT_NAV_BASE_GROUPS];
  return isSuperadmin === true
    ? [...base, COPILOT_NAV_ADMIN_GROUP]
    : base;
}

/** Lista plana del módulo Copilot (sin rutas admin). */
export const COPILOT_NAV_ITEMS: CopilotNavItem[] =
  COPILOT_NAV_BASE_GROUPS.flatMap((g) => g.items);
