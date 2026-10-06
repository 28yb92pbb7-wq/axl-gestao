import type { Metadata } from "next";
import "./globals.css";
import RecoveryRedirect from "@/components/recovery-redirect";
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
      <body>
        <RecoveryRedirect />
        {children}
      </body>
    </html>
  );
}
