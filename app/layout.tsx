import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "AXL Gestão & Prospecção",
  description: "AXL NFC — Tecnologia que aproxima.",
  manifest: "/manifest.webmanifest",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
