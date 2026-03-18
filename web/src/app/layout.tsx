import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "@/styles/globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Kansa — AI Employee for Your Ecommerce Store",
  description:
    "Connect your Shopify store. Kansa's AI agents analyze, optimize, and push changes to your listings — so you sell more without lifting a finger.",
  keywords: [
    "ecommerce",
    "AI",
    "shopify optimization",
    "product listing optimization",
    "AI employee",
    "ecommerce automation",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${dmSans.variable} font-sans`}>{children}</body>
    </html>
  );
}
