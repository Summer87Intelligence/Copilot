/** Navegación del módulo Copilot. */
import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  BarChart3,
  BookMarked,
  BookOpen,
  Bot,
  Building2,
  CheckSquare,
  Database,
  FileText,
  HelpCircle,
  Landmark,
  ListTodo,
  Settings,
  ShieldCheck,
  TriangleAlert,
  Users,
  Wallet,
  Banknote,
  LayoutDashboard,
  ShoppingBag,
  ClipboardCheck,
} from "lucide-react";

export type CopilotNavItem = {
  href: string;
  label: string;
  /** Etiqueta corta en sidebar colapsado (iconos). */
  shortLabel?: string;
  /** Subtítulo en sidebar expandido y tooltip en colapsado. */
  description?: string;
  icon: LucideIcon;
  /** Clave de módulo para filtrar por permisos efectivos. Undefined = siempre visible. */
  moduleKey?: string;
  /**
   * Rutas secundarias / legacy: siguen activas por URL pero no aparecen en el menú lateral.
   * Ver manual — sección «Cómo moverse por Copilot».
   */
  sidebarHidden?: boolean;
};

/** Bloque del sidebar: título opcional (mayúsculas pequeñas en UI) + enlaces. */
export type CopilotNavGroup = {
  sectionTitle: string | null;
  items: CopilotNavItem[];
};

const COPILOT_NAV_HOY: CopilotNavGroup = {
  sectionTitle: "Hoy",
  items: [
    {
      href: "/copilot/hoy",
      label: "Hoy",
      description: "Caja, cobros y prioridad",
      icon: ListTodo,
      moduleKey: "hoy",
    },
    {
      href: "/copilot/tareas-diarias",
      label: "Tareas diarias",
      shortLabel: "Tareas",
      description: "Tu lista operativa del día",
      icon: CheckSquare,
      moduleKey: "daily_tasks",
    },
  ],
};

const COPILOT_NAV_VENTAS: CopilotNavGroup = {
  sectionTitle: "Ventas",
  items: [
    {
      href: "/copilot/ventas",
      label: "Ventas",
      shortLabel: "Ventas",
      description: "Qué vendimos, cuánto y a quién",
      icon: ShoppingBag,
      moduleKey: "ventas",
    },
    {
      href: "/copilot/dashboard",
      label: "Dashboard",
      shortLabel: "Dashboard",
      description: "Análisis y reportes ejecutivos",
      icon: BarChart3,
      moduleKey: "dashboard",
    },
    {
      href: "/copilot/finanzas",
      label: "Finanzas",
      shortLabel: "Finanzas",
      description: "Caja, cobros y resultados",
      icon: Wallet,
      moduleKey: "finanzas",
    },
    {
      href: "/copilot/reportes",
      label: "Reportes",
      description: "PDFs y reportes",
      icon: FileText,
      moduleKey: "reportes",
    },
  ],
};

const COPILOT_NAV_COBRANZA: CopilotNavGroup = {
  sectionTitle: "Cobranza",
  items: [
    {
      href: "/copilot/cobranza",
      label: "Cobranza",
      description: "Clientes a gestionar y cobros pendientes",
      icon: LayoutDashboard,
      moduleKey: "cobranza",
    },
    {
      href: "/copilot/cartera",
      label: "Cartera",
      description: "Saldos pendientes y seguimiento",
      icon: Landmark,
      moduleKey: "cartera",
    },
    {
      href: "/copilot/clientes",
      label: "Clientes",
      description: "Ficha del cliente y contacto",
      icon: Users,
      moduleKey: "clientes",
    },
    {
      href: "/copilot/acciones",
      label: "Acciones",
      description: "Prioridad del día y tareas concretas",
      icon: CheckSquare,
      moduleKey: "acciones",
      sidebarHidden: true,
    },
  ],
};

const COPILOT_NAV_TESORERIA: CopilotNavGroup = {
  sectionTitle: "Tesorería",
  items: [
    {
      href: "/copilot/tesoreria",
      label: "Tesorería",
      description: "Caja y pagos",
      icon: Banknote,
      moduleKey: "tesoreria",
    },
    {
      href: "/copilot/movimientos-bancarios",
      label: "Movimientos bancarios",
      shortLabel: "Banco",
      description: "Extractos Santander y conciliación",
      icon: ArrowRightLeft,
      moduleKey: "bank_movements",
    },
    {
      href: "/copilot/revision-bancaria",
      label: "Revisión bancaria",
      shortLabel: "Revisión",
      description: "Sugerencias del motor: operativo e histórico",
      icon: ClipboardCheck,
      moduleKey: "bank_movements",
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
      href: "/copilot/agentes",
      label: "Agentes IA",
      shortLabel: "Agentes",
      description: "Asistentes y análisis",
      icon: Bot,
      moduleKey: "agentes",
    },
    {
      href: "/copilot/datos",
      label: "Datos",
      description: "Consulta de registros",
      icon: Database,
      moduleKey: "datos",
    },
    {
      href: "/copilot/mesa-de-ayuda",
      label: "Mesa de ayuda",
      shortLabel: "Ayuda",
      description: "Sugerencias, mejoras y reportes",
      icon: HelpCircle,
      moduleKey: "helpdesk",
    },
  ],
};

const COPILOT_NAV_CONFIGURACION: CopilotNavGroup = {
  sectionTitle: "Configuración",
  items: [
    {
      href: "/copilot/integridad",
      label: "Integridad",
      description: "Salud, consistencia y seguridad de la plataforma",
      icon: ShieldCheck,
      moduleKey: "admin",
    },
    {
      href: "/copilot/admin",
      label: "Configuración",
      description: "Usuarios, permisos y ajustes",
      icon: Settings,
      moduleKey: "admin",
    },
    {
      href: "/copilot/manual",
      label: "Manual de uso",
      shortLabel: "Manual",
      description: "Guía paso a paso",
      icon: BookMarked,
      moduleKey: "manual",
    },
  ],
};

/**
 * Rutas técnicas / secundarias — no en sidebar; accesibles por URL o enlaces internos.
 */
export const COPILOT_NAV_LEGACY_HIDDEN: CopilotNavItem[] = [
  {
    href: "/copilot/decisiones",
    label: "Decisiones",
    icon: CheckSquare,
    sidebarHidden: true,
  },
  {
    href: "/copilot/configuracion",
    label: "Configuración (redirect)",
    icon: Settings,
    sidebarHidden: true,
  },
];

/** Panel superadmin (se concatena si `isSuperadmin` viene true desde el layout servidor). */
export const COPILOT_NAV_ADMIN_GROUP: CopilotNavGroup = {
  sectionTitle: "Admin",
  items: [
    {
      href: "/copilot/admin",
      label: "Panel administrativo",
      shortLabel: "Admin",
      description: "Usuarios, roles y permisos",
      icon: ShieldCheck,
      moduleKey: "admin",
      sidebarHidden: true,
    },
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

/** Grupos base del menú lateral (solo rutas visibles para dirección). */
export const COPILOT_NAV_BASE_GROUPS: CopilotNavGroup[] = [
  COPILOT_NAV_HOY,
  COPILOT_NAV_VENTAS,
  COPILOT_NAV_COBRANZA,
  COPILOT_NAV_TESORERIA,
  COPILOT_NAV_SISTEMA,
  COPILOT_NAV_CONFIGURACION,
];

function filterSidebarItems(group: CopilotNavGroup): CopilotNavGroup {
  return {
    ...group,
    items: group.items.filter((item) => !item.sidebarHidden),
  };
}

/**
 * Menú lateral completo según rol y permisos efectivos.
 * - isSuperadmin: controla si se añade el grupo Admin.
 * - modulePermissions: mapa module_key → access_level para ocultar items con 'none'.
 *   Si está vacío (no cargado aún), no se filtra ningún item.
 */
export function buildCopilotNavItemGroups(
  isSuperadmin: boolean,
  modulePermissions: Record<string, string> = {}
): CopilotNavGroup[] {
  const hasPermissions = Object.keys(modulePermissions).length > 0;

  function filterItems(group: CopilotNavGroup): CopilotNavGroup {
    const visible = filterSidebarItems(group);
    if (!hasPermissions) return visible;
    return {
      ...visible,
      items: visible.items.filter((item) => {
        if (!item.moduleKey) return true;
        const level = modulePermissions[item.moduleKey];
        return level !== "none";
      }),
    };
  }

  function nonEmpty(group: CopilotNavGroup): boolean {
    return group.items.length > 0;
  }

  const baseGroups = COPILOT_NAV_BASE_GROUPS.map(filterItems).filter(nonEmpty);
  if (!isSuperadmin) return baseGroups;
  const adminGroup = filterItems(COPILOT_NAV_ADMIN_GROUP);
  return nonEmpty(adminGroup) ? [...baseGroups, adminGroup] : baseGroups;
}

/** Lista plana del módulo Copilot (sidebar + legacy ocultas, sin rutas admin globales). */
export const COPILOT_NAV_ITEMS: CopilotNavItem[] = [
  ...COPILOT_NAV_BASE_GROUPS.flatMap((g) => g.items),
  ...COPILOT_NAV_LEGACY_HIDDEN,
];
