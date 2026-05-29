/** Navegación del módulo Copilot. */
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BookMarked,
  BookOpen,
  Bot,
  Building2,
  CheckSquare,
  Database,
  FileText,
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
  /** Etiqueta corta en sidebar colapsado (iconos). */
  shortLabel?: string;
  /** Subtítulo en sidebar expandido y tooltip en colapsado. */
  description?: string;
  icon: LucideIcon;
};

/** Bloque del sidebar: título opcional (mayúsculas pequeñas en UI) + enlaces. */
export type CopilotNavGroup = {
  sectionTitle: string | null;
  items: CopilotNavItem[];
};

const COPILOT_NAV_INICIO: CopilotNavGroup = {
  sectionTitle: "Inicio",
  items: [
    {
      href: "/copilot/hoy",
      label: "Hoy",
      description: "Resumen y prioridad diaria",
      icon: ListTodo,
    },
  ],
};

const COPILOT_NAV_OPERAR: CopilotNavGroup = {
  sectionTitle: "Operar",
  items: [
    {
      href: "/copilot/acciones",
      label: "Acciones",
      description: "Tareas operativas",
      icon: CheckSquare,
    },
    {
      href: "/copilot/clientes",
      label: "Clientes",
      description: "Ficha y cobranza",
      icon: Users,
    },
    {
      href: "/copilot/cartera",
      label: "Cartera",
      description: "Deuda y cobros",
      icon: Landmark,
    },
    {
      href: "/copilot/tesoreria",
      label: "Tesorería",
      description: "Caja y pagos",
      icon: Banknote,
    },
  ],
};

const COPILOT_NAV_IA: CopilotNavGroup = {
  sectionTitle: "IA",
  items: [
    {
      href: "/copilot/agentes",
      label: "Agentes IA",
      description: "Análisis de tendencias",
      icon: Bot,
    },
  ],
};

const COPILOT_NAV_CONSULTAR: CopilotNavGroup = {
  sectionTitle: "Consultar",
  items: [
    {
      href: "/copilot/datos",
      label: "Datos",
      description: "Consulta de registros",
      icon: Database,
    },
    {
      href: "/copilot/reportes",
      label: "Reportes",
      description: "PDFs operativos",
      icon: FileText,
    },
    {
      href: "/copilot/finanzas",
      label: "Panorama financiero",
      shortLabel: "Finanzas",
      description: "Lectura general",
      icon: Wallet,
    },
  ],
};

const COPILOT_NAV_AYUDA: CopilotNavGroup = {
  sectionTitle: "Ayuda",
  items: [
    {
      href: "/copilot/manual",
      label: "Manual de uso",
      shortLabel: "Manual",
      description: "Guía paso a paso",
      icon: BookMarked,
    },
  ],
};

const COPILOT_NAV_SISTEMA: CopilotNavGroup = {
  sectionTitle: "Sistema",
  items: [
    {
      href: "/copilot/alertas",
      label: "Alertas",
      description: "Avisos y novedades",
      icon: TriangleAlert,
    },
    {
      href: "/copilot/operacional",
      label: "Estado del sistema",
      shortLabel: "Sistema",
      description: "Integraciones y salud técnica",
      icon: Activity,
    },
    {
      href: "/copilot/configuracion",
      label: "Configuración",
      description: "Ajustes del workspace",
      icon: Settings,
    },
    {
      href: "/copilot/personalizacion",
      label: "Personalización",
      description: "Preferencias de vista",
      icon: SlidersHorizontal,
    },
  ],
};

/** Panel superadmin (se concatena si `isSuperadmin` viene true desde el layout servidor). */
export const COPILOT_NAV_ADMIN_GROUP: CopilotNavGroup = {
  sectionTitle: "Admin",
  items: [
    {
      href: "/admin/companies",
      label: "Empresas",
      description: "Gestión multi-empresa",
      icon: Building2,
    },
    {
      href: "/copilot/knowledge/zeta",
      label: "Base Zeta",
      shortLabel: "Zeta",
      description: "Documentación de integración",
      icon: BookOpen,
    },
  ],
};

/** Grupos base del menú lateral. */
export const COPILOT_NAV_BASE_GROUPS: CopilotNavGroup[] = [
  COPILOT_NAV_INICIO,
  COPILOT_NAV_OPERAR,
  COPILOT_NAV_IA,
  COPILOT_NAV_CONSULTAR,
  COPILOT_NAV_AYUDA,
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
