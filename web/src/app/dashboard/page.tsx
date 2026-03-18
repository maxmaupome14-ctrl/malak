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

/* ── SVG Icons ────────────────────────────────────────────────────── */

function ShopifyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M15.5 2.5L14.3 3.1C14.2 2.7 14 2.4 13.7 2.1C13.1 1.5 12.3 1.2 11.4 1.2C11.2 1.2 11 1.2 10.8 1.3C10.7 1.1 10.6 1 10.4 0.9C9.9 0.4 9.2 0.2 8.4 0.2C6.7 0.3 5 1.6 3.7 3.7C2.8 5.3 2.1 7.2 1.9 8.7L1.9 8.7C1.9 8.7 1.9 8.7 1.9 8.7L0.4 9.2C0.4 9.2 0 9.3 0 9.7L0 9.7L1.8 22L15.2 24L22 22.5L15.5 2.5Z" fill="#96bf48" />
      <path d="M15.5 2.5L14.3 3.1C14.2 2.7 14 2.4 13.7 2.1L12.5 2L15.2 24L22 22.5L15.5 2.5Z" fill="#5e8e3e" />
      <path d="M11.4 7.8L10.4 11C10.4 11 9.4 10.5 8.2 10.6C6.4 10.7 6.4 11.8 6.4 12.1C6.5 13.4 10.5 13.8 10.7 17.3C10.9 20 9.2 21.8 6.8 22C3.9 22.2 2.4 20.5 2.4 20.5L3 18C3 18 4.5 19.2 5.7 19.1C6.5 19.1 6.8 18.4 6.8 17.9C6.7 16.2 3.4 16.3 3.2 13.2C3.1 10.5 4.8 7.8 8.6 7.6C10 7.5 10.7 7.8 10.7 7.8" fill="white" />
    </svg>
  );
}

function AmazonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M14.5 13.5C14.5 14.6 14.4 15.5 13.8 16.3C13.3 17 12.5 17.4 11.6 17.4C10.5 17.4 9.8 16.8 9.8 15.8C9.8 14 11.4 13.6 14.5 13.3V13.5Z" fill="#ff9900" />
      <path d="M17.5 19.5C17.3 19.7 17 19.7 16.8 19.6C15.8 18.7 15.6 18.3 15.1 17.6C13.6 19.2 12.5 19.7 10.6 19.7C8.3 19.7 6.5 18.3 6.5 15.5C6.5 13.2 7.8 11.7 9.6 10.9C11.2 10.2 13.4 10.1 14.5 9.9V9.5C14.5 8.7 14.6 7.8 14.1 7.1C13.7 6.5 13 6.2 12.3 6.2C11.1 6.2 10 6.8 9.7 8.1C9.6 8.4 9.4 8.6 9.1 8.6L6.7 8.4C6.4 8.3 6.1 8.1 6.2 7.6C6.7 5 9 4 11.1 4C12.2 4 13.6 4.3 14.5 5.1C15.6 6.1 15.5 7.4 15.5 8.9V13.5C15.5 14.6 15.9 15 16.3 15.6C16.5 15.9 16.5 16.2 16.3 16.4L17.5 19.5Z" fill="#ff9900" />
      <path d="M20.5 21C18 23 14.3 24 11.1 24C6.7 24 2.7 22.3 0 19.6C-0.2 19.4 0 19.1 0.3 19.3C3.2 21.6 6.8 23 10.7 23C13.4 23 16.3 22.4 19 21.1C19.4 20.9 19.8 21.4 20.5 21Z" fill="#ff9900" />
    </svg>
  );
}

function SyncIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={spinning ? { animation: "spin 1s linear infinite" } : undefined}
    >
      <path d="M21.5 2v6h-6" />
      <path d="M2.5 22v-6h6" />
      <path d="M2.5 11.5a10 10 0 0118.4-4.5" />
      <path d="M21.5 12.5a10 10 0 01-18.4 4.5" />
    </svg>
  );
}

function ScoreRing({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div style={{
        width: "42px",
        height: "42px",
        borderRadius: "50%",
        background: "#13132a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "13px",
        fontWeight: 600,
        color: "#4a4f5e",
        flexShrink: 0,
      }}>
        --
      </div>
    );
  }

  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";
  const bg = score >= 75 ? "rgba(34,197,94,0.1)" : score >= 50 ? "rgba(234,179,8,0.1)" : "rgba(239,68,68,0.1)";

  return (
    <div style={{
      width: "42px",
      height: "42px",
      borderRadius: "50%",
      background: bg,
      border: `2px solid ${color}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "14px",
      fontWeight: 700,
      color: color,
      flexShrink: 0,
    }}>
      {Math.round(score)}
    </div>
  );
}

/* ── Dashboard ────────────────────────────────────────────────────── */

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
      api.get<ReportSummary>("/reports/summary").then(setSummary).catch(() => {});
    } catch {
      setSyncResult((prev) => ({ ...prev, [storeId]: "Sync failed" }));
    } finally {
      setSyncing((prev) => ({ ...prev, [storeId]: false }));
    }
  };

  useEffect(() => {
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
            background: "rgba(34, 197, 94, 0.06)",
            borderRadius: "10px",
            padding: "14px 20px",
            marginBottom: "24px",
            color: "#4ade80",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Store connected successfully! You can now sync your products.
          </div>
          <button
            onClick={() => setShowConnectedBanner(false)}
            style={{
              background: "none",
              border: "none",
              color: "#4ade80",
              cursor: "pointer",
              fontSize: "18px",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "36px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.5px" }}>
            Dashboard
          </h1>
          <p style={{ color: "#4a4f5e", marginTop: "4px", fontSize: "14px" }}>
            Your ecommerce command center
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ color: "#4a4f5e", fontSize: "13px" }}>{user.email}</span>
          <button
            onClick={logout}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "8px",
              color: "#6b7280",
              padding: "6px 14px",
              fontSize: "12px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px",
          marginBottom: "32px",
        }}
      >
        {[
          {
            label: "Total Audits",
            value: summary?.total_audits ?? 0,
            sub: `${summary?.audits_this_week ?? 0} this week`,
            icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
          },
          {
            label: "Avg Score",
            value: summary?.average_score ? Math.round(summary.average_score) : "--",
            sub: summary?.best_score ? `Best: ${Math.round(summary.best_score)}` : "No data yet",
            icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
          },
          {
            label: "Connected Stores",
            value: stores.length,
            sub: `${stores.filter(s => s.is_connected).length} active`,
            icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
          },
          {
            label: "Products",
            value: "--",
            sub: "Sync to see count",
            icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: "#0c0c1e",
              borderRadius: "12px",
              padding: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <span style={{ fontSize: "12px", fontWeight: 500, color: "#4a4f5e", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {stat.label}
              </span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2a2f3e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={stat.icon} />
              </svg>
            </div>
            <p style={{ fontSize: "28px", fontWeight: 700, color: "#e2e8f0", lineHeight: 1, marginBottom: "4px" }}>
              {stat.value}
            </p>
            <p style={{ fontSize: "12px", color: "#3d4250" }}>
              {stat.sub}
            </p>
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "32px" }}>
        {/* Connected Stores */}
        <div
          style={{
            background: "#0c0c1e",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#e2e8f0" }}>
              Connected Stores
            </h2>
            <Link
              href="/connect"
              style={{
                fontSize: "12px",
                color: "#c41e3a",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              + Add store
            </Link>
          </div>

          {stores.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 16px" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2a2f3e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 12px" }}>
                <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <p style={{ fontSize: "13px", color: "#4a4f5e", marginBottom: "12px" }}>No stores connected yet</p>
              <Link
                href="/connect"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "13px",
                  color: "#c41e3a",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                Connect your first store
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {stores.map((store) => (
                <div
                  key={store.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 14px",
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: "10px",
                  }}
                >
                  <div style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    background: store.platform === "shopify" ? "rgba(150,191,72,0.1)" : "rgba(255,153,0,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {store.platform === "shopify" ? <ShopifyIcon /> : <AmazonIcon />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "14px", fontWeight: 500, color: "#e2e8f0" }}>
                      {store.name}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                      <span style={{ fontSize: "12px", color: "#4a4f5e", textTransform: "capitalize" }}>
                        {store.platform}
                      </span>
                      {store.is_connected && (
                        <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#22c55e" }}>
                          <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                          Live
                        </span>
                      )}
                    </div>
                    {syncResult[store.id] && (
                      <p style={{
                        fontSize: "11px",
                        color: syncResult[store.id].includes("failed") ? "#ef4444" : "#22c55e",
                        marginTop: "4px",
                      }}>
                        {syncResult[store.id]}
                      </p>
                    )}
                  </div>
                  {store.is_connected && (
                    <button
                      onClick={() => syncProducts(store.id)}
                      disabled={syncing[store.id]}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        background: "transparent",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: "6px",
                        color: syncing[store.id] ? "#4a4f5e" : "#9ca3af",
                        padding: "5px 10px",
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: syncing[store.id] ? "not-allowed" : "pointer",
                        flexShrink: 0,
                        transition: "all 0.15s ease",
                      }}
                    >
                      <SyncIcon spinning={syncing[store.id]} />
                      {syncing[store.id] ? "Syncing" : "Sync"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div
          style={{
            background: "#0c0c1e",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#e2e8f0", marginBottom: "20px" }}>
            Quick Actions
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[
              { href: "/audit", label: "Run Free Audit", desc: "Analyze any product URL", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", accent: true },
              { href: "/products", label: "View Products", desc: "Browse synced inventory", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
              { href: "/listings", label: "Manage Listings", desc: "Optimize and push changes", icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" },
              { href: "/connect", label: "Connect Store", desc: "Link Shopify or Amazon", icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 14px",
                  background: action.accent ? "rgba(196,30,58,0.06)" : "rgba(255,255,255,0.02)",
                  borderRadius: "10px",
                  textDecoration: "none",
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "8px",
                  background: action.accent ? "rgba(196,30,58,0.12)" : "rgba(255,255,255,0.03)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={action.accent ? "#c41e3a" : "#4a4f5e"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={action.icon} />
                  </svg>
                </div>
                <div>
                  <p style={{ fontSize: "13px", fontWeight: 500, color: "#e2e8f0" }}>{action.label}</p>
                  <p style={{ fontSize: "11px", color: "#3d4250", marginTop: "1px" }}>{action.desc}</p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2a2f3e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto" }}>
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Audits — full width */}
      <div
        style={{
          background: "#0c0c1e",
          borderRadius: "12px",
          padding: "24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#e2e8f0" }}>
            Recent Audits
          </h2>
          <Link
            href="/audit"
            style={{
              fontSize: "12px",
              color: "#c41e3a",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Run audit
          </Link>
        </div>

        {history.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2a2f3e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 12px" }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <p style={{ fontSize: "14px", color: "#4a4f5e", marginBottom: "8px" }}>
              No audits yet
            </p>
            <Link
              href="/audit"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                color: "#c41e3a",
                fontSize: "13px",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              Run your first audit
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {history.map((audit) => (
              <div
                key={audit.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  padding: "10px 14px",
                  background: "rgba(255,255,255,0.015)",
                  borderRadius: "10px",
                  transition: "background 0.15s ease",
                  cursor: "default",
                }}
              >
                <ScoreRing score={audit.overall_score} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "#e2e8f0",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {audit.url}
                  </p>
                  <p style={{ fontSize: "12px", color: "#3d4250", marginTop: "2px" }}>
                    {new Date(audit.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    <span style={{ margin: "0 6px", color: "#2a2f3e" }}>/</span>
                    <span style={{
                      color: audit.status === "completed" ? "#22c55e" : audit.status === "failed" ? "#ef4444" : "#eab308",
                      textTransform: "capitalize",
                    }}>
                      {audit.status}
                    </span>
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
      <Suspense fallback={
        <div style={{ padding: "40px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "32px" }}>
            {[1,2,3,4].map(i => (
              <div key={i} className="skeleton" style={{ height: "100px", borderRadius: "12px" }} />
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="skeleton" style={{ height: "240px", borderRadius: "12px" }} />
            <div className="skeleton" style={{ height: "240px", borderRadius: "12px" }} />
          </div>
        </div>
      }>
        <DashboardContent />
      </Suspense>
    </AuthGuard>
  );
}
