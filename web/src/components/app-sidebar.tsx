"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* ── Kansa Logo SVG ────────────────────────────────────────────────── */
function KansaLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="kansa-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e94560" />
          <stop offset="100%" stopColor="#c2185b" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#kansa-grad)" />
      {/* Geometric K mark */}
      <path
        d="M11 8v16M11 16l7-8M11 16l7 8"
        stroke="white"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22" cy="12" r="2" fill="rgba(255,255,255,0.6)" />
    </svg>
  );
}

/* ── Navigation ────────────────────────────────────────────────────── */

const SECTIONS = [
  {
    label: "MAIN",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
      { href: "/chat", label: "Kansa AI", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
      { href: "/products", label: "Products", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
    ],
  },
  {
    label: "TOOLS",
    items: [
      { href: "/analytics", label: "Analytics", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
      { href: "/listings", label: "Listings", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
      { href: "/vault", label: "Media Vault", icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" },
      { href: "/audit", label: "Free Audit", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
    ],
  },
  {
    label: "MANAGE",
    items: [
      { href: "/connect", label: "Connect Store", icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" },
      { href: "/settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
    ],
  },
];

function NavIcon({ path, active }: { path: string; active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "#e94560" : "#5a6478"}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, transition: "stroke 0.2s ease" }}
    >
      <path d={path} />
    </svg>
  );
}

export default function AppSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: "240px",
          background: "#08081a",
          borderRight: "1px solid rgba(255,255,255,0.04)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "24px 20px 28px",
            textDecoration: "none",
          }}
        >
          <KansaLogo />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{
              fontSize: "17px",
              fontWeight: 700,
              color: "#f1f5f9",
              letterSpacing: "-0.4px",
              lineHeight: 1,
            }}>
              Kansa
            </span>
            <span style={{
              fontSize: "10px",
              fontWeight: 500,
              color: "#475569",
              letterSpacing: "0.5px",
              marginTop: "2px",
            }}>
              AI Commerce
            </span>
          </div>
        </Link>

        {/* Nav sections */}
        <nav style={{ padding: "0 12px", flex: 1 }}>
          {SECTIONS.map((section, si) => (
            <div key={section.label} style={{ marginBottom: si < SECTIONS.length - 1 ? "24px" : "0" }}>
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "#3a4250",
                  textTransform: "uppercase",
                  letterSpacing: "1.2px",
                  paddingLeft: "12px",
                  marginBottom: "6px",
                }}
              >
                {section.label}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                {section.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        color: active ? "#f1f5f9" : "#7a8494",
                        background: active ? "rgba(233, 69, 96, 0.08)" : "transparent",
                        fontSize: "13px",
                        textDecoration: "none",
                        fontWeight: active ? 600 : 450,
                        transition: "all 0.15s ease",
                        cursor: "pointer",
                        position: "relative",
                      }}
                    >
                      {active && (
                        <div
                          style={{
                            position: "absolute",
                            left: "0",
                            top: "50%",
                            transform: "translateY(-50%)",
                            width: "3px",
                            height: "16px",
                            borderRadius: "0 3px 3px 0",
                            background: "#e94560",
                          }}
                        />
                      )}
                      <NavIcon path={item.icon} active={active} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom section */}
        <div style={{ padding: "16px 12px" }}>
          <div
            style={{
              padding: "16px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, rgba(233,69,96,0.06), rgba(139,92,246,0.04))",
              border: "1px solid rgba(233,69,96,0.08)",
            }}
          >
            <p style={{ fontSize: "12px", fontWeight: 600, color: "#e2e8f0", marginBottom: "4px" }}>
              Upgrade to Pro
            </p>
            <p style={{ fontSize: "11px", color: "#525c6c", marginBottom: "12px", lineHeight: 1.4 }}>
              Unlimited optimizations, image gen, and more.
            </p>
            <Link
              href="/pricing"
              style={{
                display: "block",
                textAlign: "center",
                background: "#e94560",
                borderRadius: "8px",
                color: "#fff",
                padding: "8px 0",
                fontSize: "12px",
                fontWeight: 600,
                textDecoration: "none",
                cursor: "pointer",
                transition: "opacity 0.15s",
              }}
            >
              View Plans
            </Link>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          height: "100vh",
          background: "#0a0a18",
        }}
      >
        <div style={{ padding: "32px 40px", maxWidth: "1400px" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
