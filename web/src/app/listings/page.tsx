"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGuard, { useAuth } from "@/components/auth-guard";
import { api } from "@/lib/api";

interface ProductItem {
  id: string;
  title: string;
  brand: string | null;
  price: number | null;
  image: string | null;
  platform: string;
  overall_score: number | null;
}

interface Store {
  id: string;
  name: string;
  platform: string;
  store_url: string | null;
  is_connected: boolean;
}

interface Optimization {
  id: string;
  product_id: string;
  store_id: string;
  field: string;
  current_value: string;
  proposed_value: string;
  reasoning: string;
  status: "pending" | "approved" | "pushed" | "rejected" | "failed";
  impact_score: number | null;
  created_at: string;
  pushed_at: string | null;
}

function ListingsContent() {
  const { user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [optimizations, setOptimizations] = useState<Optimization[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Load stores on mount
  useEffect(() => {
    api.get<Store[]>("/stores").then((s) => {
      setStores(s);
      if (s.length > 0) setSelectedStore(s[0].id);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Load products + optimizations when store changes
  useEffect(() => {
    if (!selectedStore) return;
    setLoading(true);
    Promise.all([
      api.get<ProductItem[]>(`/products?store_id=${selectedStore}`),
      api.get<Optimization[]>(`/optimizations?store_id=${selectedStore}`),
    ]).then(([p, o]) => {
      setProducts(p);
      setOptimizations(o);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [selectedStore]);

  const syncProducts = async () => {
    if (!selectedStore) return;
    setSyncing(true);
    try {
      const result = await api.post<{ imported: number; updated: number }>(`/products/sync/${selectedStore}`);
      // Reload products
      const p = await api.get<ProductItem[]>(`/products?store_id=${selectedStore}`);
      setProducts(p);
      alert(`Synced! ${result.imported} imported, ${result.updated} updated`);
    } catch (e: any) {
      alert(`Sync failed: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const generateAll = async () => {
    if (!selectedStore) return;
    setGenerating(true);
    try {
      const result = await api.post<{ products_processed: number; optimizations_created: number }>(`/optimizations/generate-bulk/${selectedStore}`);
      const o = await api.get<Optimization[]>(`/optimizations?store_id=${selectedStore}`);
      setOptimizations(o);
      alert(`Generated ${result.optimizations_created} optimizations for ${result.products_processed} products`);
    } catch (e: any) {
      alert(`Generation failed: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const approveAll = async () => {
    if (!selectedStore) return;
    try {
      await api.post(`/optimizations/approve-all/${selectedStore}`);
      const o = await api.get<Optimization[]>(`/optimizations?store_id=${selectedStore}`);
      setOptimizations(o);
    } catch (e: any) {
      alert(`Approve failed: ${e.message}`);
    }
  };

  const pushAll = async () => {
    if (!selectedStore) return;
    setPushing(true);
    try {
      const result = await api.post<{ pushed: number; failed: number; products_updated: number }>(`/optimizations/push/${selectedStore}`);
      const o = await api.get<Optimization[]>(`/optimizations?store_id=${selectedStore}`);
      setOptimizations(o);
      alert(`Pushed! ${result.pushed} changes to ${result.products_updated} products. ${result.failed} failed.`);
    } catch (e: any) {
      alert(`Push failed: ${e.message}`);
    } finally {
      setPushing(false);
    }
  };

  const approveOne = async (id: string) => {
    try {
      await api.post(`/optimizations/${id}/approve`);
      setOptimizations((prev) => prev.map((o) => o.id === id ? { ...o, status: "approved" } : o));
    } catch {}
  };

  const rejectOne = async (id: string) => {
    try {
      await api.post(`/optimizations/${id}/reject`);
      setOptimizations((prev) => prev.map((o) => o.id === id ? { ...o, status: "rejected" } : o));
    } catch {}
  };

  const pendingCount = optimizations.filter((o) => o.status === "pending").length;
  const approvedCount = optimizations.filter((o) => o.status === "approved").length;
  const pushedCount = optimizations.filter((o) => o.status === "pushed").length;

  const filteredOpts = statusFilter === "all"
    ? optimizations
    : optimizations.filter((o) => o.status === statusFilter);

  // Group optimizations by product
  const byProduct = new Map<string, Optimization[]>();
  for (const o of filteredOpts) {
    const list = byProduct.get(o.product_id) || [];
    list.push(o);
    byProduct.set(o.product_id, list);
  }

  const productMap = new Map(products.map((p) => [p.id, p]));

  if (loading && stores.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "80px 20px", color: "#94a3b8" }}>
        Loading...
      </div>
    );
  }

  if (stores.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "80px 20px" }}>
        <p style={{ fontSize: "48px", marginBottom: "16px" }}>&#128717;</p>
        <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#f1f5f9", marginBottom: "12px" }}>
          No stores connected
        </h2>
        <p style={{ color: "#94a3b8", marginBottom: "24px" }}>
          Connect your Shopify store to start optimizing your listings.
        </p>
        <Link href="/connect" className="btn-primary" style={{ padding: "12px 24px" }}>
          Connect Store
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#f1f5f9" }}>Listing Manager</h1>
          <p style={{ color: "#94a3b8", marginTop: "4px", fontSize: "14px" }}>
            Generate AI optimizations, review diffs, approve & push to your store.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {stores.length > 1 && (
            <select
              value={selectedStore || ""}
              onChange={(e) => setSelectedStore(e.target.value)}
              style={{
                background: "#16162a",
                border: "1px solid #334155",
                borderRadius: "8px",
                color: "#f1f5f9",
                padding: "8px 12px",
                fontSize: "14px",
              }}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="card" style={{ padding: "16px", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <button
            onClick={syncProducts}
            disabled={syncing}
            className="btn-secondary"
            style={{ padding: "8px 16px", fontSize: "13px" }}
          >
            {syncing ? "Syncing..." : `Sync Products (${products.length})`}
          </button>
          <button
            onClick={generateAll}
            disabled={generating || products.length === 0}
            className="btn-primary"
            style={{ padding: "8px 16px", fontSize: "13px" }}
          >
            {generating ? "Generating..." : "Generate Optimizations"}
          </button>
          {pendingCount > 0 && (
            <button
              onClick={approveAll}
              style={{
                padding: "8px 16px",
                fontSize: "13px",
                background: "rgba(34, 197, 94, 0.15)",
                border: "1px solid rgba(34, 197, 94, 0.4)",
                borderRadius: "8px",
                color: "#86efac",
                cursor: "pointer",
              }}
            >
              Approve All ({pendingCount})
            </button>
          )}
          {approvedCount > 0 && (
            <button
              onClick={pushAll}
              disabled={pushing}
              style={{
                padding: "8px 16px",
                fontSize: "13px",
                background: "linear-gradient(135deg, #e94560, #b91c1c)",
                border: "none",
                borderRadius: "8px",
                color: "white",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {pushing ? "Pushing..." : `Push to Store (${approvedCount})`}
            </button>
          )}

          {/* Stats */}
          <div style={{ marginLeft: "auto", display: "flex", gap: "16px", fontSize: "13px" }}>
            <span style={{ color: "#f59e0b" }}>{pendingCount} pending</span>
            <span style={{ color: "#22c55e" }}>{approvedCount} approved</span>
            <span style={{ color: "#3b82f6" }}>{pushedCount} pushed</span>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "20px" }}>
        {[
          { id: "all", label: "All", count: optimizations.length },
          { id: "pending", label: "Pending", count: pendingCount },
          { id: "approved", label: "Approved", count: approvedCount },
          { id: "pushed", label: "Pushed", count: pushedCount },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id)}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              border: "1px solid",
              borderColor: statusFilter === tab.id ? "#e94560" : "#1e293b",
              background: statusFilter === tab.id ? "rgba(233, 69, 96, 0.1)" : "transparent",
              color: statusFilter === tab.id ? "#e94560" : "#64748b",
              fontSize: "13px",
              cursor: "pointer",
              fontWeight: statusFilter === tab.id ? 600 : 400,
            }}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Optimizations by product */}
      {optimizations.length === 0 && !loading && (
        <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
          <p style={{ fontSize: "40px", marginBottom: "16px" }}>&#9889;</p>
          <p style={{ color: "#94a3b8", fontSize: "15px", marginBottom: "8px" }}>
            No optimizations yet.
          </p>
          <p style={{ color: "#64748b", fontSize: "13px" }}>
            {products.length > 0
              ? 'Click "Generate Optimizations" to let AI analyze your listings.'
              : 'Sync your products first, then generate optimizations.'}
          </p>
        </div>
      )}

      {Array.from(byProduct.entries()).map(([productId, opts]) => {
        const product = productMap.get(productId);
        return (
          <div key={productId} className="card" style={{ padding: "0", marginBottom: "16px", overflow: "hidden" }}>
            {/* Product header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              padding: "16px 20px",
              borderBottom: "1px solid #1e293b",
              background: "rgba(255,255,255,0.02)",
            }}>
              {product?.image && (
                <img
                  src={product.image}
                  alt=""
                  style={{ width: "48px", height: "48px", borderRadius: "8px", objectFit: "cover" }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "15px", fontWeight: 600, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {product?.title || "Unknown Product"}
                </p>
                <p style={{ fontSize: "12px", color: "#64748b" }}>
                  {product?.brand} {product?.price ? `$${product.price}` : ""}
                </p>
              </div>
              <span style={{
                fontSize: "12px",
                color: "#64748b",
                background: "#0f0f1e",
                padding: "4px 10px",
                borderRadius: "6px",
              }}>
                {opts.length} change{opts.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Optimization diffs */}
            {opts.map((opt) => (
              <div
                key={opt.id}
                style={{
                  padding: "16px 20px",
                  borderBottom: "1px solid #1e293b",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: "#94a3b8",
                    padding: "2px 8px",
                    background: "#1e293b",
                    borderRadius: "4px",
                  }}>
                    {opt.field}
                  </span>
                  <StatusBadge status={opt.status} />
                  {opt.impact_score && (
                    <span style={{ fontSize: "12px", color: "#f59e0b" }}>
                      Impact: {opt.impact_score}/10
                    </span>
                  )}
                  <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
                    {opt.status === "pending" && (
                      <>
                        <button
                          onClick={() => approveOne(opt.id)}
                          style={{
                            padding: "4px 12px",
                            fontSize: "12px",
                            background: "rgba(34, 197, 94, 0.15)",
                            border: "1px solid rgba(34, 197, 94, 0.4)",
                            borderRadius: "6px",
                            color: "#86efac",
                            cursor: "pointer",
                          }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => rejectOne(opt.id)}
                          style={{
                            padding: "4px 12px",
                            fontSize: "12px",
                            background: "rgba(239, 68, 68, 0.1)",
                            border: "1px solid rgba(239, 68, 68, 0.3)",
                            borderRadius: "6px",
                            color: "#fca5a5",
                            cursor: "pointer",
                          }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Diff view */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div style={{
                    padding: "12px",
                    borderRadius: "8px",
                    background: "rgba(239, 68, 68, 0.05)",
                    border: "1px solid rgba(239, 68, 68, 0.15)",
                  }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#ef4444", display: "block", marginBottom: "6px" }}>
                      CURRENT
                    </span>
                    <p style={{ fontSize: "13px", color: "#94a3b8", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>
                      {opt.current_value || "(empty)"}
                    </p>
                  </div>
                  <div style={{
                    padding: "12px",
                    borderRadius: "8px",
                    background: "rgba(34, 197, 94, 0.05)",
                    border: "1px solid rgba(34, 197, 94, 0.15)",
                  }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#22c55e", display: "block", marginBottom: "6px" }}>
                      PROPOSED
                    </span>
                    <p style={{ fontSize: "13px", color: "#e2e8f0", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>
                      {opt.proposed_value}
                    </p>
                  </div>
                </div>

                {/* Reasoning */}
                {opt.reasoning && (
                  <p style={{ fontSize: "12px", color: "#64748b", marginTop: "8px", fontStyle: "italic" }}>
                    {opt.reasoning}
                  </p>
                )}
              </div>
            ))}
          </div>
        );
      })}

      {/* Products without optimizations */}
      {products.length > 0 && optimizations.length === 0 && (
        <div style={{ marginTop: "32px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#f1f5f9", marginBottom: "12px" }}>
            Your Products ({products.length})
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
            {products.map((p) => (
              <div key={p.id} className="card" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                {p.image && (
                  <img src={p.image} alt="" style={{ width: "56px", height: "56px", borderRadius: "8px", objectFit: "cover" }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "14px", fontWeight: 600, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.title}
                  </p>
                  <p style={{ fontSize: "12px", color: "#64748b" }}>
                    {p.brand} {p.price ? `$${p.price}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; border: string; color: string }> = {
    pending: { bg: "rgba(245, 158, 11, 0.1)", border: "rgba(245, 158, 11, 0.3)", color: "#fbbf24" },
    approved: { bg: "rgba(34, 197, 94, 0.1)", border: "rgba(34, 197, 94, 0.3)", color: "#86efac" },
    pushed: { bg: "rgba(59, 130, 246, 0.1)", border: "rgba(59, 130, 246, 0.3)", color: "#93c5fd" },
    rejected: { bg: "rgba(239, 68, 68, 0.1)", border: "rgba(239, 68, 68, 0.3)", color: "#fca5a5" },
    failed: { bg: "rgba(239, 68, 68, 0.1)", border: "rgba(239, 68, 68, 0.3)", color: "#fca5a5" },
  };
  const s = styles[status] || styles.pending;
  return (
    <span style={{
      fontSize: "11px",
      fontWeight: 600,
      textTransform: "uppercase",
      color: s.color,
      padding: "2px 8px",
      borderRadius: "4px",
      background: s.bg,
      border: `1px solid ${s.border}`,
    }}>
      {status}
    </span>
  );
}

export default function ListingsPage() {
  return (
    <AuthGuard>
      <ListingsContent />
    </AuthGuard>
  );
}
