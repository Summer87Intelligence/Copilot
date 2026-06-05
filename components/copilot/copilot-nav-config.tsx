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
  ShieldCheck,
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
  /** Clave de módulo para filtrar por permisos efectivos. Undefined = siempre visible. */
  moduleKey?: string;
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
      moduleKey: "hoy",
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
      moduleKey: "acciones",
    },
    {
      href: "/copilot/clientes",
      label: "Clientes",
      description: "Ficha y cobranza",
      icon: Users,
      moduleKey: "clientes",
    },
    {
      href: "/copilot/cartera",
      label: "Cartera",
      description: "Deuda y cobros",
      icon: Landmark,
      moduleKey: "cartera",
    },
    {
      href: "/copilot/tesoreria",
      label: "Tesorería",
      description: "Caja y pagos",
      icon: Banknote,
      moduleKey: "tesoreria",
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
      moduleKey: "agentes",
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
      moduleKey: "datos",
    },
    {
      href: "/copilot/reportes",
      label: "Reportes",
      description: "PDFs operativos",
      icon: FileText,
      moduleKey: "reportes",
    },
    {
      href: "/copilot/finanzas",
      label: "Panorama financiero",
      shortLabel: "Finanzas",
      description: "Lectura general",
      icon: Wallet,
      moduleKey: "finanzas",
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
      moduleKey: "manual",
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
  ],
};

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

/** Grupos base del menú lateral. */
export const COPILOT_NAV_BASE_GROUPS: CopilotNavGroup[] = [
  COPILOT_NAV_INICIO,
  COPILOT_NAV_OPERAR,
  COPILOT_NAV_IA,
  COPILOT_NAV_CONSULTAR,
  COPILOT_NAV_AYUDA,
  COPILOT_NAV_SISTEMA,
];

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
    if (!hasPermissions) return group;
    return {
      ...group,
      items: group.items.filter((item) => {
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

/** Lista plana del módulo Copilot (sin rutas admin). */
export const COPILOT_NAV_ITEMS: CopilotNavItem[] =
  COPILOT_NAV_BASE_GROUPS.flatMap((g) => g.items);
