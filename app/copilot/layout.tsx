import type { Metadata } from "next";

import { CopilotShell } from "@/components/copilot/copilot-shell";

export const metadata: Metadata = {
  title: "Summer87 Copilot · Prototipo",
  description:
    "Prototipo operativo (Supabase) — inicio en /copilot. Demo visual en /demo.",
};

export default function CopilotModuleLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <CopilotShell>{children}</CopilotShell>;
}
