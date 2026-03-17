import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Malak AI — Your AI CMO for Ecommerce",
  description:
    "Open-source AI-powered marketing intelligence platform. Audit listings, track competitors, generate optimized copy — all on autopilot.",
  keywords: [
    "ecommerce",
    "AI",
    "marketing",
    "amazon",
    "shopify",
    "product listing optimization",
    "competitive intelligence",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans`}>{children}</body>
    </html>
  );
}
