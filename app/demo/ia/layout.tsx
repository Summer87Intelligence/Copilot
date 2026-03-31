import type { Metadata } from "next";

import { DemoIaModuleLayout } from "@/components/copilot/demo-ia-module-layout";

export const metadata: Metadata = {
  title: "Summer87 Copilot · IA (Demo)",
  description:
    "Centro de mando IA — demostración visual sin datos reales.",
};

export default function DemoIaLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <DemoIaModuleLayout>{children}</DemoIaModuleLayout>;
}
