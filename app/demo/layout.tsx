import type { Metadata } from "next";

import { DemoShell } from "@/components/copilot/demo-shell";

export const metadata: Metadata = {
  title: "Summer87 Copilot · Demo",
  description:
    "Entorno demostración — recorrido visual sin datos reales. Prototipo en /copilot.",
};

export default function DemoModuleLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <DemoShell>{children}</DemoShell>;
}
