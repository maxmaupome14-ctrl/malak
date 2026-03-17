import Link from "next/link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: "260px",
          background: "#16162a",
          borderRight: "1px solid #1e293b",
          padding: "24px 16px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "40px",
            paddingLeft: "8px",
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
            M
          </div>
          <span style={{ fontSize: "18px", fontWeight: 700, color: "#f1f5f9" }}>
            Malak AI
          </span>
        </div>

        {/* Nav links */}
        <nav style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {[
            { href: "/dashboard", label: "Dashboard", icon: "📊" },
            { href: "/audit", label: "New Audit", icon: "🔍" },
            { href: "/dashboard", label: "Reports", icon: "📄" },
            { href: "/dashboard", label: "Competitors", icon: "🕵️" },
            { href: "/dashboard", label: "Stores", icon: "🏪" },
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 12px",
                borderRadius: "8px",
                color: "#94a3b8",
                fontSize: "14px",
                textDecoration: "none",
                transition: "background 0.15s",
              }}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Bottom section */}
        <div
          style={{
            borderTop: "1px solid #1e293b",
            paddingTop: "16px",
            marginTop: "16px",
          }}
        >
          <Link
            href="/dashboard"
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
            <span>⚙️</span>
            Settings
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, padding: "32px", overflowY: "auto" }}>
        {children}
      </main>
    </div>
  );
}
