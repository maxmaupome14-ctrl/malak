"use client";

import { useEffect, useState } from "react";
import AuthGuard from "@/components/auth-guard";
import { api } from "@/lib/api";

// ── Types ───────────────────────────────────────────────

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

interface Product {
  id: string;
  title: string;
  store_id: string;
  seo_score: number | null;
  optimized_at: string | null;
  original_score: number | null;
  synced_at: string | null;
}

interface ConnectedStore {
  id: string;
  name: string;
  platform: string;
  store_url: string | null;
  is_connected: boolean;
}

// ── Helpers ─────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 75) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function scoreBg(score: number): string {
  if (score >= 75) return "rgba(34,197,94,0.15)";
  if (score >= 50) return "rgba(245,158,11,0.15)";
  return "rgba(239,68,68,0.15)";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
}

// ── Score Distribution Calculator ───────────────────────

interface ScoreDistribution {
  excellent: number; // 75-100
  good: number; // 50-74
  poor: number; // 0-49
  unscored: number;
}

function calcDistribution(items: { overall_score: number | null }[]): ScoreDistribution {
  const dist: ScoreDistribution = { excellent: 0, good: 0, poor: 0, unscored: 0 };
  for (const item of items) {
    if (item.overall_score == null) dist.unscored++;
    else if (item.overall_score >= 75) dist.excellent++;
    else if (item.overall_score >= 50) dist.good++;
    else dist.poor++;
  }
  return dist;
}

// ── Components ──────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div
      style={{
        background: "#16162a",
        border: "1px solid #1e293b",
        borderRadius: "12px",
        padding: "20px 24px",
      }}
    >
      <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "8px" }}>{label}</p>
      <p style={{ fontSize: "32px", fontWeight: 700, color: "#f1f5f9", lineHeight: 1.1 }}>{value}</p>
      {sub && (
        <p style={{ fontSize: "12px", color: "#64748b", marginTop: "6px" }}>{sub}</p>
      )}
    </div>
  );
}

function BarSegment({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ marginBottom: "14px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "6px",
          fontSize: "13px",
        }}
      >
        <span style={{ color: "#f1f5f9" }}>{label}</span>
        <span style={{ color: "#94a3b8" }}>
          {count} ({pct}%)
        </span>
      </div>
      <div
        style={{
          height: "10px",
          background: "#1a1a2e",
          borderRadius: "5px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            borderRadius: "5px",
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────

function AnalyticsContent() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [history, setHistory] = useState<AuditHistoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<ConnectedStore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<ReportSummary>("/reports/summary").catch(() => null),
      api.get<AuditHistoryItem[]>("/reports/history?limit=100").catch(() => []),
      api.get<Product[]>("/products").catch(() => []),
      api.get<ConnectedStore[]>("/stores").catch(() => []),
    ]).then(([sum, hist, prods, strs]) => {
      setSummary(sum);
      setHistory(hist as AuditHistoryItem[]);
      setProducts(prods as Product[]);
      setStores(strs as ConnectedStore[]);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center", color: "#94a3b8" }}>
        Loading analytics...
      </div>
    );
  }

  // ── Derived data ──────────────────────────────────────
  const totalProducts = products.length;
  const scoredProducts = products.filter((p) => p.seo_score != null);
  const avgProductScore =
    scoredProducts.length > 0
      ? Math.round(scoredProducts.reduce((s, p) => s + (p.seo_score ?? 0), 0) / scoredProducts.length)
      : null;

  const productDist = calcDistribution(
    products.map((p) => ({ overall_score: p.seo_score }))
  );

  const auditDist = calcDistribution(history);

  const optimizedProducts = products
    .filter((p) => p.optimized_at != null)
    .sort((a, b) => new Date(b.optimized_at!).getTime() - new Date(a.optimized_at!).getTime());

  // Products grouped by store
  const productsByStore = stores.map((store) => {
    const storeProducts = products.filter((p) => p.store_id === store.id);
    const lastSynced = storeProducts.reduce((latest: string | null, p) => {
      if (!p.synced_at) return latest;
      if (!latest) return p.synced_at;
      return new Date(p.synced_at) > new Date(latest) ? p.synced_at : latest;
    }, null);
    return { store, count: storeProducts.length, lastSynced };
  });

  const totalAudits = history.length;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#f1f5f9" }}>Analytics</h1>
        <p style={{ color: "#94a3b8", marginTop: "8px", fontSize: "15px" }}>
          Performance insights across your products and audits.
        </p>
      </div>

      {/* ── Section 1: Product Performance Overview ────── */}
      <div
        style={{
          background: "#16162a",
          border: "1px solid #1e293b",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "24px",
        }}
      >
        <h2 style={{ fontSize: "18px", fontWeight: 600, color: "#f1f5f9", marginBottom: "20px" }}>
          Product Performance Overview
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "16px",
            marginBottom: "28px",
          }}
        >
          <StatCard label="Total Products" value={totalProducts} sub={`${scoredProducts.length} scored`} />
          <StatCard
            label="Average Score"
            value={avgProductScore ?? "--"}
            sub={avgProductScore != null ? (avgProductScore >= 75 ? "Excellent" : avgProductScore >= 50 ? "Good" : "Needs work") : "No scores yet"}
          />
          <StatCard
            label="Best Score"
            value={summary?.best_score != null ? Math.round(summary.best_score) : "--"}
          />
          <StatCard
            label="Worst Score"
            value={summary?.worst_score != null ? Math.round(summary.worst_score) : "--"}
          />
        </div>

        {/* Score distribution bars */}
        <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#94a3b8", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Product Score Distribution
        </h3>
        {totalProducts === 0 ? (
          <p style={{ color: "#64748b", fontSize: "14px" }}>No products to analyze yet.</p>
        ) : (
          <>
            <BarSegment label="Excellent (75-100)" count={productDist.excellent} total={totalProducts} color="#22c55e" />
            <BarSegment label="Good (50-74)" count={productDist.good} total={totalProducts} color="#f59e0b" />
            <BarSegment label="Needs Work (0-49)" count={productDist.poor} total={totalProducts} color="#ef4444" />
            <BarSegment label="Unscored" count={productDist.unscored} total={totalProducts} color="#64748b" />
          </>
        )}
      </div>

      {/* ── Section 2: Audit Score Distribution ──────── */}
      <div
        style={{
          background: "#16162a",
          border: "1px solid #1e293b",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "24px",
        }}
      >
        <h2 style={{ fontSize: "18px", fontWeight: 600, color: "#f1f5f9", marginBottom: "20px" }}>
          Audit Score Distribution
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "16px",
            marginBottom: "28px",
          }}
        >
          <StatCard label="Total Audits" value={summary?.total_audits ?? 0} sub={`${summary?.audits_this_week ?? 0} this week`} />
          <StatCard label="Completed" value={summary?.completed_audits ?? 0} />
          <StatCard
            label="Average Audit Score"
            value={summary?.average_score != null ? Math.round(summary.average_score) : "--"}
          />
        </div>

        {totalAudits === 0 ? (
          <p style={{ color: "#64748b", fontSize: "14px" }}>No audits to analyze yet.</p>
        ) : (
          <>
            <BarSegment label="Excellent (75-100)" count={auditDist.excellent} total={totalAudits} color="#22c55e" />
            <BarSegment label="Good (50-74)" count={auditDist.good} total={totalAudits} color="#f59e0b" />
            <BarSegment label="Needs Work (0-49)" count={auditDist.poor} total={totalAudits} color="#ef4444" />
            <BarSegment label="Pending / Unscored" count={auditDist.unscored} total={totalAudits} color="#64748b" />
          </>
        )}
      </div>

      {/* ── Section 3: Optimization History ──────────── */}
      <div
        style={{
          background: "#16162a",
          border: "1px solid #1e293b",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "24px",
        }}
      >
        <h2 style={{ fontSize: "18px", fontWeight: 600, color: "#f1f5f9", marginBottom: "20px" }}>
          Optimization History
        </h2>

        {optimizedProducts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#64748b" }}>
            <div style={{ marginBottom: "12px", display: "flex", justifyContent: "center" }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2a2a40" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg></div>
            <p style={{ fontSize: "14px" }}>No products have been optimized yet.</p>
            <p style={{ fontSize: "13px", marginTop: "4px" }}>
              Optimize a product listing to see before/after score comparisons here.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1fr",
                gap: "12px",
                padding: "8px 16px",
                fontSize: "12px",
                color: "#64748b",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              <span>Product</span>
              <span>Before</span>
              <span>After</span>
              <span>Optimized</span>
            </div>

            {optimizedProducts.map((p) => {
              const before = p.original_score;
              const after = p.seo_score;
              const improved = before != null && after != null && after > before;
              return (
                <div
                  key={p.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 1fr 1fr",
                    gap: "12px",
                    padding: "12px 16px",
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: "8px",
                    border: "1px solid #1e293b",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "14px",
                      color: "#f1f5f9",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.title}
                  </span>

                  <span style={{ fontSize: "14px" }}>
                    {before != null ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "40px",
                          height: "28px",
                          borderRadius: "6px",
                          background: scoreBg(before),
                          color: scoreColor(before),
                          fontWeight: 600,
                          fontSize: "13px",
                        }}
                      >
                        {Math.round(before)}
                      </span>
                    ) : (
                      <span style={{ color: "#64748b" }}>--</span>
                    )}
                  </span>

                  <span style={{ fontSize: "14px" }}>
                    {after != null ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "40px",
                            height: "28px",
                            borderRadius: "6px",
                            background: scoreBg(after),
                            color: scoreColor(after),
                            fontWeight: 600,
                            fontSize: "13px",
                          }}
                        >
                          {Math.round(after)}
                        </span>
                        {improved && (
                          <span style={{ color: "#22c55e", fontSize: "12px", fontWeight: 600 }}>
                            +{Math.round(after - (before ?? 0))}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span style={{ color: "#64748b" }}>--</span>
                    )}
                  </span>

                  <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                    {formatDateTime(p.optimized_at!)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section 4: Store Stats ───────────────────── */}
      <div
        style={{
          background: "#16162a",
          border: "1px solid #1e293b",
          borderRadius: "12px",
          padding: "24px",
        }}
      >
        <h2 style={{ fontSize: "18px", fontWeight: 600, color: "#f1f5f9", marginBottom: "20px" }}>
          Store Stats
        </h2>

        {stores.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#64748b" }}>
            <div style={{ marginBottom: "12px", display: "flex", justifyContent: "center" }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2a2a40" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg></div>
            <p style={{ fontSize: "14px" }}>No stores connected yet.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {productsByStore.map(({ store, count, lastSynced }) => (
              <div
                key={store.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  padding: "16px 20px",
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: "10px",
                  border: "1px solid #1e293b",
                }}
              >
                {/* Platform badge */}
                <div
                  style={{
                    width: "40px",
                    height: "40px",
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

                {/* Store info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "15px", fontWeight: 600, color: "#f1f5f9" }}>
                    {store.name}
                  </p>
                  <p style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                    {store.platform}
                    {store.store_url && (
                      <span style={{ marginLeft: "8px" }}>{store.store_url}</span>
                    )}
                  </p>
                </div>

                {/* Product count */}
                <div style={{ textAlign: "center", minWidth: "80px" }}>
                  <p style={{ fontSize: "22px", fontWeight: 700, color: "#f1f5f9" }}>{count}</p>
                  <p style={{ fontSize: "11px", color: "#64748b" }}>Products</p>
                </div>

                {/* Sync status */}
                <div style={{ textAlign: "right", minWidth: "120px" }}>
                  <p style={{ fontSize: "13px", fontWeight: 500, color: store.is_connected ? "#22c55e" : "#ef4444" }}>
                    {store.is_connected ? "Connected" : "Disconnected"}
                  </p>
                  <p style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                    {lastSynced ? `Last sync: ${formatDate(lastSynced)}` : "Never synced"}
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

export default function AnalyticsPage() {
  return (
    <AuthGuard>
      <AnalyticsContent />
    </AuthGuard>
  );
}
