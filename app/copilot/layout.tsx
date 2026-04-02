import type { Metadata } from "next";

import { CopilotShell } from "@/components/copilot/copilot-shell";

export const metadata: Metadata = {
  title: "Summer87 Copilot · Prototipo",
  description:
    "Gestión operativa con datos reales (Supabase). La entrada principal es / y redirige a este módulo.",
};

export default function CopilotModuleLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <CopilotShell>{children}</CopilotShell>;
}
