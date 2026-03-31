/** Navegación del entorno PROTOTIPO (`/copilot`). */
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  Brain,
  CheckSquare,
  Database,
  LayoutDashboard,
  Lightbulb,
  MessageSquareMore,
  Settings,
  SlidersHorizontal,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react";

export type CopilotNavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
};

/** Flujo principal: narrativa operativa del producto. */
const COPILOT_NAV_MAIN: CopilotNavItem[] = [
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
    label: "Gestión IA",
    shortLabel: "Gestión IA",
    icon: Brain,
  },
  { href: "/copilot/alertas", label: "Alertas", icon: TriangleAlert },
  { href: "/copilot/acciones", label: "Acciones", icon: CheckSquare },
  { href: "/copilot/clientes", label: "Clientes", icon: Users },
  { href: "/copilot/finanzas", label: "Finanzas", icon: Wallet },
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

/** Grupos para el menú lateral: bloque principal + bloque sistema. */
export const COPILOT_NAV_GROUPS: CopilotNavItem[][] = [
  COPILOT_NAV_MAIN,
  COPILOT_NAV_SYSTEM,
];

/** Lista plana (p. ej. enlaces rápidos o compatibilidad). */
export const COPILOT_NAV_ITEMS: CopilotNavItem[] = COPILOT_NAV_GROUPS.flat();
