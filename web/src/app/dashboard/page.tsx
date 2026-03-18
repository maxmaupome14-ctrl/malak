"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthGuard, { useAuth } from "@/components/auth-guard";
import { logout } from "@/lib/auth";
import { api } from "@/lib/api";

interface ConnectedStore {
  id: string;
  name: string;
  platform: string;
  store_url: string | null;
  is_connected: boolean;
}

interface ReportSummary {
  total_audits: number;
  completed_audits: number;
  average_score: number | null;
  best_score: number | null;
  worst_score: number | null;
  audits_this_week: number;
}

interface AuditHistoryItem {
  id: string;
  url: string;
  status: string;
  overall_score: number | null;
  created_at: string;
}

function DashboardContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const justConnected = searchParams.get("connected") === "true";
  const [stores, setStores] = useState<ConnectedStore[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [history, setHistory] = useState<AuditHistoryItem[]>([]);
  const [showConnectedBanner, setShowConnectedBanner] = useState(justConnected);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [syncResult, setSyncResult] = useState<Record<string, string>>({});

  const syncProducts = async (storeId: string) => {
    setSyncing((prev) => ({ ...prev, [storeId]: true }));
    setSyncResult((prev) => ({ ...prev, [storeId]: "" }));
    try {
      const res = await api.post<{ imported: number; updated: number }>(
        `/products/sync/${storeId}`,
        {}
      );
      setSyncResult((prev) => ({
        ...prev,
        [storeId]: `${res.imported} imported, ${res.updated} updated`,
      }));
      // Refresh summary
      api.get<ReportSummary>("/reports/summary").then(setSummary).catch(() => {});
    } catch {
      setSyncResult((prev) => ({ ...prev, [storeId]: "Sync failed" }));
    } finally {
      setSyncing((prev) => ({ ...prev, [storeId]: false }));
    }
  };

  useEffect(() => {
    // Load all dashboard data in parallel
    api.get<ConnectedStore[]>("/stores").then(setStores).catch(() => {});
    api.get<ReportSummary>("/reports/summary").then(setSummary).catch(() => {});
    api.get<AuditHistoryItem[]>("/reports/history?limit=10").then(setHistory).catch(() => {});
  }, []);

  useEffect(() => {
    if (showConnectedBanner) {
      const timer = setTimeout(() => setShowConnectedBanner(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [showConnectedBanner]);

  return (
    <div>
      {/* Connected success banner */}
      {showConnectedBanner && (
        <div
          style={{
            background: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            borderRadius: "8px",
            padding: "12px 16px",
            marginBottom: "20px",
            color: "#86efac",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>Store connected successfully! You can now sync your products.</span>
          <button
            onClick={() => setShowConnectedBanner(false)}
            style={{
              background: "none",
              border: "none",
              color: "#86efac",
              cursor: "pointer",
              fontSize: "18px",
              padding: "0 4px",
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "32px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#f1f5f9" }}>
            Dashboard
          </h1>
          <p style={{ color: "#94a3b8", marginTop: "8px", fontSize: "15px" }}>
            Your AI-powered ecommerce command center.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ color: "#94a3b8", fontSize: "13px" }}>{user.email}</span>
          <button
            onClick={logout}
            style={{
              background: "none",
              border: "1px solid #334155",
              borderRadius: "6px",
              color: "#94a3b8",
              padding: "6px 14px",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
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
          { label: "Audits Run", value: summary?.total_audits ?? 0, sub: `${summary?.audits_this_week ?? 0} this week` },
          { label: "Avg Score", value: summary?.average_score ? Math.round(summary.average_score) : "--", sub: summary?.best_score ? `Best: ${Math.round(summary.best_score)}` : "--" },
          { label: "Stores Connected", value: stores.length, sub: stores.filter(s => s.is_connected).length + " active" },
          { label: "Products", value: "--", sub: "Sync to see count" },
        ].map((stat) => (
          <div key={stat.label} className="card">
            <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "8px" }}>
              {stat.label}
            </p>
            <p style={{ fontSize: "32px", fontWeight: 700, color: "#f1f5f9" }}>
              {stat.value}
            </p>
            <p style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
              {stat.sub}
            </p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="card" style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, color: "#f1f5f9", marginBottom: "16px" }}>
          Quick Actions
        </h2>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <Link href="/audit" className="btn-primary">
            Run Free Audit
          </Link>
          <Link href="/listings" className="btn-secondary">
            Manage Listings
          </Link>
          <Link href="/connect" className="btn-secondary">
            Connect Store
          </Link>
        </div>
      </div>

      {/* Connected stores */}
      {stores.length > 0 && (
        <div className="card" style={{ marginBottom: "32px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 600, color: "#f1f5f9", marginBottom: "16px" }}>
            Connected Stores
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px" }}>
            {stores.map((store) => (
              <div
                key={store.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "14px 16px",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: "10px",
                  border: "1px solid #334155",
                }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    background:
                      store.platform === "shopify"
                        ? "linear-gradient(135deg, #96bf48, #5e8e3e)"
                        : "linear-gradient(135deg, #ff9900, #e47911)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: "16px",
                    color: "white",
                    flexShrink: 0,
                  }}
                >
                  {store.platform === "shopify" ? "S" : "A"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "14px", fontWeight: 600, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {store.name}
                  </p>
                  <p style={{ fontSize: "12px", color: "#64748b" }}>
                    {store.platform}
                    {store.is_connected && (
                      <span style={{ color: "#22c55e", marginLeft: "8px" }}>
                        &#9679; Connected
                      </span>
                    )}
                  </p>
                  {syncResult[store.id] && (
                    <p style={{ fontSize: "11px", color: syncResult[store.id].includes("failed") ? "#ef4444" : "#22c55e", marginTop: "2px" }}>
                      {syncResult[store.id]}
                    </p>
                  )}
                </div>
                {store.is_connected && (
                  <button
                    onClick={() => syncProducts(store.id)}
                    disabled={syncing[store.id]}
                    style={{
                      background: syncing[store.id] ? "#334155" : "#e94560",
                      border: "none",
                      borderRadius: "6px",
                      color: "#fff",
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: syncing[store.id] ? "not-allowed" : "pointer",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {syncing[store.id] ? "Syncing..." : "Sync Products"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent audits */}
      <div className="card">
        <h2 style={{ fontSize: "18px", fontWeight: 600, color: "#f1f5f9", marginBottom: "16px" }}>
          Recent Audits
        </h2>
        {history.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#64748b" }}>
            <p style={{ fontSize: "40px", marginBottom: "16px" }}>&#128270;</p>
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
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {history.map((audit) => (
              <div
                key={audit.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  padding: "12px 16px",
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: "8px",
                  border: "1px solid #1e293b",
                }}
              >
                <div style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "8px",
                  background: audit.overall_score
                    ? audit.overall_score >= 75 ? "rgba(34,197,94,0.15)" : audit.overall_score >= 50 ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)"
                    : "#1e293b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "14px",
                  color: audit.overall_score
                    ? audit.overall_score >= 75 ? "#22c55e" : audit.overall_score >= 50 ? "#f59e0b" : "#ef4444"
                    : "#64748b",
                }}>
                  {audit.overall_score ?? "--"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "14px", color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {audit.url}
                  </p>
                  <p style={{ fontSize: "12px", color: "#64748b" }}>
                    {new Date(audit.created_at).toLocaleDateString()} &middot; {audit.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <Suspense fallback={<div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Loading...</div>}>
        <DashboardContent />
      </Suspense>
    </AuthGuard>
  );
}
