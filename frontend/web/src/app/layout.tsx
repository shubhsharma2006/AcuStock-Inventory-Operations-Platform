import type { Metadata } from "next";
import { ReactQueryProvider } from "@/lib/query-client";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "AcuStock — Inventory Management",
  description: "Enterprise-grade inventory management platform. Real-time stock tracking, serial number management, and advanced reporting.",
  keywords: ["inventory", "stock management", "warehouse", "ERP", "serial tracking"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)] font-sans">
        <ReactQueryProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}

