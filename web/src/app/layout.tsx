import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "@/styles/globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Kansa — Amazon Listing Optimizer with Proof",
  description:
    "AI audits your Amazon listing across 6 dimensions, fixes every issue, and measures the impact in 30 days. Not vibes — proof.",
  keywords: [
    "amazon listing optimization",
    "amazon SEO",
    "product listing audit",
    "AI amazon optimizer",
    "ecommerce AI",
    "amazon seller tools",
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
