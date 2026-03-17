import Link from "next/link";

export default function DashboardPage() {
  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#f1f5f9" }}>
          Dashboard
        </h1>
        <p style={{ color: "#94a3b8", marginTop: "8px", fontSize: "15px" }}>
          Your ecommerce marketing command center.
        </p>
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "32px",
        }}
      >
        {[
          { label: "Audits Run", value: "0", change: "--" },
          { label: "Products Tracked", value: "0", change: "--" },
          { label: "Competitors Watched", value: "0", change: "--" },
          { label: "Alerts", value: "0", change: "--" },
        ].map((stat) => (
          <div key={stat.label} className="card">
            <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "8px" }}>
              {stat.label}
            </p>
            <p style={{ fontSize: "32px", fontWeight: 700, color: "#f1f5f9" }}>
              {stat.value}
            </p>
            <p style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
              {stat.change}
            </p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="card" style={{ marginBottom: "32px" }}>
        <h2
          style={{
            fontSize: "18px",
            fontWeight: 600,
            color: "#f1f5f9",
            marginBottom: "16px",
          }}
        >
          Quick Actions
        </h2>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <Link href="/audit" className="btn-primary">
            Run New Audit
          </Link>
          <button className="btn-secondary">Connect Store</button>
          <button className="btn-secondary">Add Competitor</button>
        </div>
      </div>

      {/* Recent audits — empty state */}
      <div className="card">
        <h2
          style={{
            fontSize: "18px",
            fontWeight: 600,
            color: "#f1f5f9",
            marginBottom: "16px",
          }}
        >
          Recent Audits
        </h2>
        <div
          style={{
            textAlign: "center",
            padding: "48px 20px",
            color: "#64748b",
          }}
        >
          <p style={{ fontSize: "40px", marginBottom: "16px" }}>🔍</p>
          <p style={{ fontSize: "15px", marginBottom: "8px" }}>
            No audits yet. Run your first one to get started.
          </p>
          <Link
            href="/audit"
            style={{ color: "#e94560", fontSize: "14px", textDecoration: "none" }}
          >
            Run your first audit &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
