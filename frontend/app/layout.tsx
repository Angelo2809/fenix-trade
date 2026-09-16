import type { Metadata } from "next";
import { connection } from "next/server";
import { Providers } from "@/components/providers";
import "./globals.css";
export const metadata: Metadata = {
  title: "Fenix | Plataforma de Investimentos",
  description:
    "Acesso privado dos sócios Fenix. Operações, mesas proprietárias e resultados.",
  robots: { index: false, follow: false },
  icons: { icon: "/assets/fenix/logo.png" },
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
