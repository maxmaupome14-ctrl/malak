"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "\u{1f4ca}" },
  { href: "/chat", label: "Kansa AI", icon: "\u{1f916}" },
  { href: "/products", label: "Products", icon: "\u{1f6cd}\ufe0f" },
  { href: "/analytics", label: "Analytics", icon: "\u{1f4c8}" },
  { href: "/listings", label: "Listings", icon: "\u{1f4e6}" },
  { href: "/audit", label: "Free Audit", icon: "\u{1f50d}" },
  { href: "/connect", label: "Connect Store", icon: "\u{1f3ea}" },
  { href: "/settings", label: "Settings", icon: "\u2699\ufe0f" },
];

export default function AppSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <aside
        style={{
          width: "260px",
          background: "#16162a",
          borderRight: "1px solid #1e293b",
          padding: "24px 16px",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          overflowY: "auto",
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "40px",
            paddingLeft: "8px",
            textDecoration: "none",
          }}
        >
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #e94560, #b91c1c)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "16px",
              color: "white",
            }}
          >
            K
          </div>
          <span style={{ fontSize: "18px", fontWeight: 700, color: "#f1f5f9" }}>
            Kansa
          </span>
        </Link>

        {/* Nav */}
        <nav style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  color: active ? "#f1f5f9" : "#94a3b8",
                  background: active ? "rgba(233, 69, 96, 0.1)" : "transparent",
                  fontSize: "14px",
                  textDecoration: "none",
                  fontWeight: active ? 600 : 400,
                  transition: "background 0.15s",
                }}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Pricing link */}
        <div
          style={{
            borderTop: "1px solid #1e293b",
            paddingTop: "16px",
            marginTop: "16px",
          }}
        >
          <Link
            href="/pricing"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "10px 12px",
              borderRadius: "8px",
              color: "#64748b",
              fontSize: "14px",
              textDecoration: "none",
            }}
          >
            <span>{"\u2728"}</span>
            Upgrade
          </Link>
        </div>
      </aside>

      <main style={{ flex: 1, padding: "32px", overflowY: "auto", height: "100vh" }}>
        {children}
      </main>
    </div>
  );
}
