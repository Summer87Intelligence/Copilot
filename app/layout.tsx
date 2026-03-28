import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Summer87 Copilot",
  description: "Inteligencia de negocio para PyMEs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
