"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/auth-guard";
import { api } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface VaultMediaItem {
  id: string;
  product_id: string | null;
  media_type: string;
  prompt_used: string;
  style: string | null;
  image_data: string;
  thumbnail_data: string | null;
  source: string;
  shopify_image_id: number | null;
  created_at: string;
}

interface VaultListResponse {
  items: VaultMediaItem[];
  total: number;
  page: number;
  page_size: number;
}

/* ------------------------------------------------------------------ */
/*  SVG Icons                                                          */
/* ------------------------------------------------------------------ */

function ImageIcon({ size = 48, color = "#2a2a40" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ShopifyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Vault Content                                                      */
/* ------------------------------------------------------------------ */

function VaultContent() {
  const [items, setItems] = useState<VaultMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "generated" | "edited">("all");
  const [selectedItem, setSelectedItem] = useState<VaultMediaItem | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const pageSize = 24;

  const fetchVault = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (filter !== "all") {
        // "generated" or "edited" maps to source field
      }
      const res = await api.get<VaultListResponse>(`/media/vault?${params}`);
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    fetchVault();
  }, [fetchVault]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this media from vault?")) return;
    setDeleting(id);
    try {
      await api.delete(`/media/vault/${id}`);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setTotal((prev) => prev - 1);
      if (selectedItem?.id === id) setSelectedItem(null);
    } catch {
      alert("Failed to delete");
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = (item: VaultMediaItem) => {
    const link = document.createElement("a");
    link.href = `data:image/png;base64,${item.image_data}`;
    link.download = `kansa-${item.source}-${item.id.slice(0, 8)}.png`;
    link.click();
  };

  const totalPages = Math.ceil(total / pageSize);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: "32px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.5px" }}>
            Media Vault
          </h1>
          <p style={{ color: "#5a6478", marginTop: "6px", fontSize: "14px" }}>
            All your AI-generated and edited images in one place.
          </p>
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          {(["all", "generated", "edited"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              style={{
                padding: "7px 14px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                background: filter === f ? "rgba(233, 69, 96, 0.1)" : "transparent",
                color: filter === f ? "#e94560" : "#5a6478",
                transition: "all 0.15s",
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            background: "#0d0d20",
            border: "1px solid rgba(255,255,255,0.04)",
            borderRadius: "12px",
            padding: "16px 20px",
            flex: 1,
          }}
        >
          <p style={{ fontSize: "11px", fontWeight: 600, color: "#525c6c", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
            Total Media
          </p>
          <p style={{ fontSize: "24px", fontWeight: 700, color: "#f1f5f9" }}>
            {total}
          </p>
        </div>
        <div
          style={{
            background: "#0d0d20",
            border: "1px solid rgba(255,255,255,0.04)",
            borderRadius: "12px",
            padding: "16px 20px",
            flex: 1,
          }}
        >
          <p style={{ fontSize: "11px", fontWeight: 600, color: "#525c6c", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
            On This Page
          </p>
          <p style={{ fontSize: "24px", fontWeight: 700, color: "#f1f5f9" }}>
            {items.length}
          </p>
        </div>
        <div
          style={{
            background: "#0d0d20",
            border: "1px solid rgba(255,255,255,0.04)",
            borderRadius: "12px",
            padding: "16px 20px",
            flex: 1,
          }}
        >
          <p style={{ fontSize: "11px", fontWeight: 600, color: "#525c6c", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
            Page
          </p>
          <p style={{ fontSize: "24px", fontWeight: 700, color: "#f1f5f9" }}>
            {page} <span style={{ fontSize: "14px", color: "#525c6c", fontWeight: 500 }}>/ {totalPages || 1}</span>
          </p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#5a6478" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              border: "2px solid rgba(255,255,255,0.06)",
              borderTopColor: "#e94560",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <p style={{ fontSize: "14px" }}>Loading vault...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "80px 20px",
            background: "#0d0d20",
            borderRadius: "16px",
            border: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          <div style={{ marginBottom: "16px", display: "flex", justifyContent: "center" }}>
            <ImageIcon size={56} color="#1e1e36" />
          </div>
          <p style={{ fontSize: "17px", color: "#8892a4", marginBottom: "8px", fontWeight: 600 }}>
            No media yet
          </p>
          <p style={{ fontSize: "13px", color: "#525c6c" }}>
            Generate images from the Products page — they&apos;ll appear here automatically.
          </p>
        </div>
      )}

      {/* Media grid */}
      {!loading && items.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "12px",
          }}
        >
          {items.map((item) => (
            <div
              key={item.id}
              className="card-hover"
              style={{
                background: "#0d0d20",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.04)",
                overflow: "hidden",
                cursor: "pointer",
                position: "relative",
              }}
              onClick={() => setSelectedItem(item)}
            >
              {/* Image */}
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  background: "#08081a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                <img
                  src={`data:image/png;base64,${item.thumbnail_data || item.image_data}`}
                  alt={item.prompt_used.slice(0, 60)}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                  loading="lazy"
                />
              </div>

              {/* Info */}
              <div style={{ padding: "10px 12px" }}>
                <p
                  style={{
                    fontSize: "11px",
                    color: "#8892a4",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    marginBottom: "4px",
                  }}
                >
                  {item.prompt_used.slice(0, 50)}{item.prompt_used.length > 50 ? "..." : ""}
                </p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      color: item.source === "generated" ? "#8b5cf6" : item.source === "edited" ? "#3b82f6" : "#525c6c",
                      background: item.source === "generated" ? "rgba(139,92,246,0.1)" : item.source === "edited" ? "rgba(59,130,246,0.1)" : "rgba(82,92,108,0.1)",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      textTransform: "uppercase",
                      letterSpacing: "0.3px",
                    }}
                  >
                    {item.source}
                  </span>
                  {item.shopify_image_id && (
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        color: "#22c55e",
                        background: "rgba(34,197,94,0.1)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      Live
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "8px",
            marginTop: "32px",
          }}
        >
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.06)",
              background: "#0d0d20",
              color: page === 1 ? "#2a2a40" : "#8892a4",
              fontSize: "13px",
              fontWeight: 600,
              cursor: page === 1 ? "not-allowed" : "pointer",
            }}
          >
            Previous
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.06)",
              background: "#0d0d20",
              color: page === totalPages ? "#2a2a40" : "#8892a4",
              fontSize: "13px",
              fontWeight: 600,
              cursor: page === totalPages ? "not-allowed" : "pointer",
            }}
          >
            Next
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/*  Detail Modal                                                  */}
      {/* ============================================================ */}
      {selectedItem && (
        <>
          {/* Overlay */}
          <div
            onClick={() => setSelectedItem(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              zIndex: 998,
              backdropFilter: "blur(4px)",
            }}
          />

          {/* Modal */}
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "680px",
              maxWidth: "90vw",
              maxHeight: "90vh",
              background: "#0d0d20",
              borderRadius: "16px",
              border: "1px solid rgba(255,255,255,0.06)",
              zIndex: 999,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Image */}
            <div
              style={{
                width: "100%",
                maxHeight: "400px",
                background: "#08081a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <img
                src={`data:image/png;base64,${selectedItem.image_data}`}
                alt={selectedItem.prompt_used}
                style={{
                  maxWidth: "100%",
                  maxHeight: "400px",
                  objectFit: "contain",
                }}
              />
            </div>

            {/* Info */}
            <div style={{ padding: "24px", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: selectedItem.source === "generated" ? "#8b5cf6" : "#3b82f6",
                        background: selectedItem.source === "generated" ? "rgba(139,92,246,0.1)" : "rgba(59,130,246,0.1)",
                        padding: "3px 8px",
                        borderRadius: "4px",
                        textTransform: "uppercase",
                        letterSpacing: "0.3px",
                      }}
                    >
                      {selectedItem.source}
                    </span>
                    {selectedItem.style && (
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#8892a4",
                          background: "rgba(136,146,164,0.1)",
                          padding: "3px 8px",
                          borderRadius: "4px",
                        }}
                      >
                        {selectedItem.style}
                      </span>
                    )}
                    {selectedItem.shopify_image_id && (
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#22c55e",
                          background: "rgba(34,197,94,0.1)",
                          padding: "3px 8px",
                          borderRadius: "4px",
                        }}
                      >
                        On Shopify
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: "12px", color: "#525c6c" }}>
                    {formatDate(selectedItem.created_at)}
                  </p>
                </div>

                {/* Close */}
                <button
                  onClick={() => setSelectedItem(null)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#525c6c",
                    fontSize: "20px",
                    cursor: "pointer",
                    padding: "0 4px",
                    lineHeight: 1,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Prompt */}
              <div
                style={{
                  background: "#0a0a1a",
                  borderRadius: "10px",
                  padding: "14px 16px",
                  marginBottom: "16px",
                }}
              >
                <p style={{ fontSize: "10px", fontWeight: 600, color: "#525c6c", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
                  Prompt Used
                </p>
                <p style={{ fontSize: "13px", color: "#8892a4", lineHeight: 1.6 }}>
                  {selectedItem.prompt_used}
                </p>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => handleDownload(selectedItem)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "10px 0",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.06)",
                    background: "transparent",
                    color: "#8892a4",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <DownloadIcon /> Download
                </button>
                <button
                  onClick={() => handleDelete(selectedItem.id)}
                  disabled={deleting === selectedItem.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "10px 16px",
                    borderRadius: "8px",
                    border: "1px solid rgba(239,68,68,0.15)",
                    background: "rgba(239,68,68,0.06)",
                    color: "#ef4444",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: deleting === selectedItem.id ? "not-allowed" : "pointer",
                    opacity: deleting === selectedItem.id ? 0.5 : 1,
                  }}
                >
                  <TrashIcon /> {deleting === selectedItem.id ? "..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page Export                                                         */
/* ------------------------------------------------------------------ */

export default function VaultPage() {
  return (
    <AuthGuard>
      <VaultContent />
    </AuthGuard>
  );
}
