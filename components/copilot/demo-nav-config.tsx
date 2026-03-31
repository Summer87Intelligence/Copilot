import {
  BarChart3,
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

import type { CopilotNavItem } from "@/components/copilot/copilot-nav-config";

export const DEMO_NAV_ITEMS: CopilotNavItem[] = [
  { href: "/demo", label: "Inicio", icon: LayoutDashboard },
  {
    href: "/demo/ia",
    label: "IA",
    shortLabel: "IA",
    icon: Brain,
  },
  { href: "/demo/alertas", label: "Alertas", icon: TriangleAlert },
  { href: "/demo/acciones", label: "Acciones", icon: CheckSquare },
  { href: "/demo/clientes", label: "Clientes", icon: Users },
  { href: "/demo/finanzas", label: "Finanzas", icon: Wallet },
  { href: "/demo/escenarios", label: "Escenarios", icon: BarChart3 },
  { href: "/demo/insights", label: "Insights", icon: Lightbulb },
  {
    href: "/demo/datos",
    label: "Datos / Integraciones",
    shortLabel: "Datos",
    icon: Database,
  },
  { href: "/demo/configuracion", label: "Configuración", icon: Settings },
  {
    href: "/demo/personalizacion",
    label: "Personalización",
    icon: SlidersHorizontal,
  },
  {
    href: "/demo/ayuda",
    label: "Mesa de ayuda",
    shortLabel: "Ayuda",
    icon: MessageSquareMore,
  },
];
