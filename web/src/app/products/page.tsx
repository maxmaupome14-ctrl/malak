"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/auth-guard";
import { api } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Product {
  id: string;
  title: string;
  brand: string | null;
  price: number | null;
  image: string | null;
  platform: string;
  overall_score: number | null;
}

interface OptimizeResult {
  original: { title: string; description: string; tags: string };
  optimized: { title: string; description: string; tags: string };
  reasoning: string;
}

interface ConnectedStore {
  id: string;
  name: string;
  platform: string;
  store_url: string | null;
  is_connected: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Compress a base64 image to max 1200px and JPEG quality 85% for upload */
function compressImage(base64: string, maxSize = 1200, quality = 0.85): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL("image/jpeg", quality);
      // Strip data:image/jpeg;base64, prefix
      resolve(compressed.split(",")[1]);
    };
    img.src = `data:image/png;base64,${base64}`;
  });
}

function scoreColor(score: number | null): string {
  if (score === null) return "#64748b";
  if (score >= 75) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function scoreBg(score: number | null): string {
  if (score === null) return "#1e293b";
  if (score >= 75) return "rgba(34,197,94,0.15)";
  if (score >= 50) return "rgba(245,158,11,0.15)";
  return "rgba(239,68,68,0.15)";
}

function platformBadge(platform: string): { bg: string; label: string } {
  switch (platform.toLowerCase()) {
    case "shopify":
      return { bg: "linear-gradient(135deg, #96bf48, #5e8e3e)", label: "Shopify" };
    case "amazon":
      return { bg: "linear-gradient(135deg, #ff9900, #e47911)", label: "Amazon" };
    default:
      return { bg: "linear-gradient(135deg, #64748b, #475569)", label: platform };
  }
}

/* ------------------------------------------------------------------ */
/*  Products Content                                                   */
/* ------------------------------------------------------------------ */

function ProductsContent() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<ConnectedStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [auditing, setAuditing] = useState(false);
  const [auditMsg, setAuditMsg] = useState("");

  // Optimize panel state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [instructions, setInstructions] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [editedTags, setEditedTags] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pushStatus, setPushStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Media generation state
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [imageStyle, setImageStyle] = useState("product");
  const [imagePrompt, setImagePrompt] = useState("");
  const [uploadingImage, setUploadingImage] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [editingImage, setEditingImage] = useState(false);
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);

  /* Fetch products + stores on mount */
  useEffect(() => {
    Promise.all([
      api.get<Product[]>("/products").catch(() => [] as Product[]),
      api.get<ConnectedStore[]>("/stores").catch(() => [] as ConnectedStore[]),
    ]).then(([p, s]) => {
      setProducts(p);
      setStores(s);
      setLoading(false);
    });
  }, []);

  /* Sync products */
  const handleSync = async () => {
    const activeStore = stores.find((s) => s.is_connected);
    if (!activeStore) return;
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await api.post<{ imported: number; updated: number }>(
        `/products/sync/${activeStore.id}`,
        {}
      );
      setSyncMsg(`Synced: ${res.imported} imported, ${res.updated} updated`);
      // Refresh products
      const fresh = await api.get<Product[]>("/products").catch(() => [] as Product[]);
      setProducts(fresh);
    } catch {
      setSyncMsg("Sync failed. Check store connection.");
    } finally {
      setSyncing(false);
    }
  };

  /* Audit all products */
  const handleAuditAll = async () => {
    setAuditing(true);
    setAuditMsg("");
    try {
      const res = await api.post<{ product_id: string; overall_score: number }[]>(
        "/audit/all",
        {}
      );
      setAuditMsg(`Audited ${res.length} products`);
      // Refresh products to show updated scores
      const fresh = await api.get<Product[]>("/products").catch(() => [] as Product[]);
      setProducts(fresh);
    } catch {
      setAuditMsg("Audit failed.");
    } finally {
      setAuditing(false);
    }
  };

  /* Open optimize panel */
  const openOptimize = (product: Product) => {
    setSelectedProduct(product);
    setInstructions("");
    setResult(null);
    setEditMode(false);
    setPushStatus(null);
    setGenerating(false);
    setPushing(false);
    setGeneratedImages([]);
    setGeneratingImage(false);
    setImagePrompt("");
    setImageStyle("product");
    setUploadingImage(null);
    setUploadStatus(null);
    setEditingImage(false);
    setEditImageUrl("");
    setEditInstructions("");
    setEditedImage(null);
    setReplaceIndex(null);
  };

  /* Close panel */
  const closePanel = () => {
    setSelectedProduct(null);
    setResult(null);
    setEditMode(false);
    setPushStatus(null);
  };

  /* Generate optimization */
  const handleGenerate = async () => {
    if (!selectedProduct) return;
    setGenerating(true);
    setResult(null);
    setPushStatus(null);
    try {
      const res = await api.post<OptimizeResult>("/optimize/generate", {
        product_id: selectedProduct.id,
        instructions: instructions || undefined,
      });
      setResult(res);
      setEditedTitle(res.optimized.title);
      setEditedDescription(res.optimized.description);
      setEditedTags(res.optimized.tags);
      setEditMode(false);
    } catch {
      setResult(null);
      alert("Optimization failed. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  /* Push to Shopify */
  const handlePush = async () => {
    if (!selectedProduct || !result) return;
    setPushing(true);
    setPushStatus(null);
    try {
      await api.post("/optimize/push", {
        product_id: selectedProduct.id,
        title: editMode ? editedTitle : result.optimized.title,
        description: editMode ? editedDescription : result.optimized.description,
        tags: editMode ? editedTags : result.optimized.tags,
      });
      setPushStatus({ ok: true, msg: "Pushed to Shopify successfully!" });
    } catch {
      setPushStatus({ ok: false, msg: "Push failed. Check your store connection." });
    } finally {
      setPushing(false);
    }
  };

  /* Generate AI image */
  const handleGenerateImage = async () => {
    if (!selectedProduct) return;
    setGeneratingImage(true);
    setGeneratedImages([]);
    try {
      const res = await api.post<{ images: string[]; prompt_used: string }>("/media/generate-image", {
        product_id: selectedProduct.id,
        style: imageStyle,
        prompt: imagePrompt || undefined,
        aspect_ratio: "1:1",
      });
      setGeneratedImages(res.images);
    } catch (err: any) {
      const msg = err?.message || err?.detail || "Unknown error";
      alert(`Image generation failed: ${msg}`);
    } finally {
      setGeneratingImage(false);
    }
  };

  /* Upload generated image to Shopify */
  const handleUploadToShopify = async (imageBase64: string, index: number) => {
    if (!selectedProduct) return;
    setUploadingImage(index);
    setUploadStatus(null);
    try {
      // Compress image before uploading to avoid payload size issues
      const compressed = await compressImage(imageBase64);
      const res = await api.post<{ ok: boolean; message: string; shopify_image_id: number | null }>(
        "/media/upload-image",
        {
          product_id: selectedProduct.id,
          image_base64: compressed,
          filename: `${selectedProduct.title || "product"}-ai-${index + 1}.jpg`,
          replace_index: replaceIndex,
        }
      );
      setUploadStatus({ ok: res.ok, msg: res.message });
      setReplaceIndex(null);
    } catch (err: any) {
      const msg = err?.message || err?.detail || "Upload failed. Check store connection.";
      setUploadStatus({ ok: false, msg });
    } finally {
      setUploadingImage(null);
    }
  };

  /* Edit existing image with AI */
  const handleEditImage = async () => {
    if (!selectedProduct || !editImageUrl || !editInstructions) return;
    setEditingImage(true);
    setEditedImage(null);
    try {
      const res = await api.post<{ image: string; prompt_used: string }>("/media/edit-image", {
        product_id: selectedProduct.id,
        image_url: editImageUrl,
        instructions: editInstructions,
      });
      setEditedImage(res.image);
    } catch (err: any) {
      const msg = err?.message || err?.detail || "Unknown error";
      alert(`Image editing failed: ${msg}`);
    } finally {
      setEditingImage(false);
    }
  };

  const activeStore = stores.find((s) => s.is_connected);

  return (
    <div style={{ position: "relative" }}>
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
            Products
          </h1>
          <p style={{ color: "#94a3b8", marginTop: "8px", fontSize: "15px" }}>
            Manage, optimize, and push AI-enhanced listings.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {(syncMsg || auditMsg) && (
            <span
              style={{
                fontSize: "12px",
                color: (syncMsg + auditMsg).includes("failed") ? "#ef4444" : "#22c55e",
              }}
            >
              {syncMsg || auditMsg}
            </span>
          )}
          <button
            onClick={handleAuditAll}
            disabled={auditing || products.length === 0}
            style={{
              background: auditing ? "#334155" : "linear-gradient(135deg, #8b5cf6, #6d28d9)",
              border: "none",
              borderRadius: "8px",
              color: "#fff",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: auditing || products.length === 0 ? "not-allowed" : "pointer",
              opacity: products.length === 0 ? 0.5 : 1,
            }}
          >
            {auditing ? "Auditing..." : "Audit All"}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || !activeStore}
            style={{
              background: syncing ? "#334155" : "#e94560",
              border: "none",
              borderRadius: "8px",
              color: "#fff",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: syncing || !activeStore ? "not-allowed" : "pointer",
              opacity: !activeStore ? 0.5 : 1,
            }}
          >
            {syncing ? "Syncing..." : "Sync Products"}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#64748b" }}>
          <p style={{ fontSize: "15px" }}>Loading products...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && products.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "80px 20px",
            color: "#64748b",
            background: "#16162a",
            borderRadius: "12px",
            border: "1px solid #1e293b",
          }}
        >
          <p style={{ fontSize: "48px", marginBottom: "16px" }}>&#128230;</p>
          <p style={{ fontSize: "18px", color: "#94a3b8", marginBottom: "8px" }}>
            No products yet
          </p>
          <p style={{ fontSize: "14px", marginBottom: "20px" }}>
            Connect a store and sync your products to get started.
          </p>
          {activeStore && (
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                background: "#e94560",
                border: "none",
                borderRadius: "8px",
                color: "#fff",
                padding: "10px 24px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
          )}
        </div>
      )}

      {/* Products grid */}
      {!loading && products.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "20px",
          }}
        >
          {products.map((product) => {
            const badge = platformBadge(product.platform);
            return (
              <div
                key={product.id}
                className="card-hover"
                style={{
                  background: "#12122a",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.06)",
                  padding: "0",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  cursor: "pointer",
                }}
              >
                {/* Image — clickable to detail page */}
                <Link
                  href={`/products/${product.id}`}
                  style={{ textDecoration: "none", display: "block" }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "200px",
                      background: "#0f0f23",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      position: "relative",
                      cursor: "pointer",
                    }}
                  >
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.title}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: "48px", color: "#334155" }}>&#128247;</span>
                    )}
                    {/* Platform badge */}
                    <div
                      style={{
                        position: "absolute",
                        top: "10px",
                        right: "10px",
                        background: badge.bg,
                        borderRadius: "6px",
                        padding: "4px 10px",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#fff",
                        letterSpacing: "0.3px",
                      }}
                    >
                      {badge.label}
                    </div>
                  </div>
                </Link>

                {/* Info */}
                <div style={{ padding: "20px", flex: 1, display: "flex", flexDirection: "column" }}>
                  <Link
                    href={`/products/${product.id}`}
                    style={{ textDecoration: "none" }}
                  >
                    <h3
                      style={{
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "#f1f5f9",
                        marginBottom: "6px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        lineHeight: "1.4",
                        cursor: "pointer",
                      }}
                    >
                      {product.title}
                    </h3>
                  </Link>

                  {product.brand && (
                    <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>
                      {product.brand}
                    </p>
                  )}

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: "auto",
                      paddingTop: "12px",
                    }}
                  >
                    {/* Price */}
                    <span style={{ fontSize: "18px", fontWeight: 700, color: "#f1f5f9" }}>
                      {product.price !== null ? `$${product.price.toFixed(2)}` : "--"}
                    </span>

                    {/* Score */}
                    {product.overall_score !== null && (
                      <div
                        style={{
                          background: scoreBg(product.overall_score),
                          borderRadius: "8px",
                          padding: "4px 10px",
                          fontSize: "13px",
                          fontWeight: 700,
                          color: scoreColor(product.overall_score),
                        }}
                      >
                        {Math.round(product.overall_score)}
                      </div>
                    )}
                  </div>

                  {/* Optimize button */}
                  <button
                    onClick={() => openOptimize(product)}
                    style={{
                      marginTop: "16px",
                      width: "100%",
                      background: "rgba(233, 69, 96, 0.1)",
                      border: "1px solid rgba(233, 69, 96, 0.3)",
                      borderRadius: "8px",
                      color: "#e94560",
                      padding: "10px 0",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "rgba(233, 69, 96, 0.2)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "rgba(233, 69, 96, 0.1)";
                    }}
                  >
                    Optimize
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/*  Optimize Slide-Over Panel                                    */}
      {/* ============================================================ */}
      {selectedProduct && (
        <>
          {/* Overlay */}
          <div
            onClick={closePanel}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 998,
            }}
          />

          {/* Panel */}
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              width: "560px",
              maxWidth: "100vw",
              height: "100vh",
              background: "#0f0f23",
              borderLeft: "1px solid #1e293b",
              zIndex: 999,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Panel header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "20px 24px",
                borderBottom: "1px solid #1e293b",
                flexShrink: 0,
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#f1f5f9" }}>
                Optimize Listing
              </h2>
              <button
                onClick={closePanel}
                style={{
                  background: "none",
                  border: "none",
                  color: "#64748b",
                  fontSize: "24px",
                  cursor: "pointer",
                  padding: "0 4px",
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>

            {/* Panel body (scrollable) */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}
            >
              {/* Current product info */}
              <div
                style={{
                  background: "#16162a",
                  borderRadius: "12px",
                  border: "1px solid #1e293b",
                  padding: "20px",
                }}
              >
                <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                  {selectedProduct.image ? (
                    <img
                      src={selectedProduct.image}
                      alt={selectedProduct.title}
                      style={{
                        width: "80px",
                        height: "80px",
                        borderRadius: "8px",
                        objectFit: "cover",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "80px",
                        height: "80px",
                        borderRadius: "8px",
                        background: "#1a1a2e",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "32px",
                        color: "#334155",
                        flexShrink: 0,
                      }}
                    >
                      &#128247;
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <h3
                      style={{
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "#f1f5f9",
                        marginBottom: "4px",
                      }}
                    >
                      {selectedProduct.title}
                    </h3>
                    {selectedProduct.brand && (
                      <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "4px" }}>
                        {selectedProduct.brand}
                      </p>
                    )}
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      {selectedProduct.price !== null && (
                        <span style={{ fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>
                          ${selectedProduct.price.toFixed(2)}
                        </span>
                      )}
                      <span
                        style={{
                          background: platformBadge(selectedProduct.platform).bg,
                          borderRadius: "4px",
                          padding: "2px 8px",
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "#fff",
                        }}
                      >
                        {platformBadge(selectedProduct.platform).label}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Custom instructions input */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#94a3b8",
                    marginBottom: "8px",
                  }}
                >
                  Custom Instructions (optional)
                </label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Focus on SEO keywords, make it more premium, emphasize sustainability..."
                  rows={3}
                  style={{
                    width: "100%",
                    background: "#1a1a2e",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    color: "#f1f5f9",
                    padding: "12px",
                    fontSize: "14px",
                    resize: "vertical",
                    outline: "none",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#e94560";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#334155";
                  }}
                />
              </div>

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  background: generating ? "#334155" : "#e94560",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                  padding: "12px 0",
                  fontSize: "15px",
                  fontWeight: 600,
                  cursor: generating ? "not-allowed" : "pointer",
                  width: "100%",
                }}
              >
                {generating ? "Generating..." : "Generate Optimization"}
              </button>

              {/* Loading state */}
              {generating && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 0",
                    color: "#94a3b8",
                    fontSize: "14px",
                  }}
                >
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      border: "3px solid #334155",
                      borderTop: "3px solid #e94560",
                      borderRadius: "50%",
                      margin: "0 auto 16px",
                      animation: "spin 1s linear infinite",
                    }}
                  />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  AI is analyzing and optimizing your listing...
                </div>
              )}

              {/* Results */}
              {result && !generating && (
                <>
                  {/* Diff sections */}
                  {(["title", "description", "tags"] as const).map((field) => (
                    <div
                      key={field}
                      style={{
                        background: "#16162a",
                        borderRadius: "12px",
                        border: "1px solid #1e293b",
                        padding: "20px",
                      }}
                    >
                      <h4
                        style={{
                          fontSize: "13px",
                          fontWeight: 700,
                          color: "#94a3b8",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          marginBottom: "12px",
                        }}
                      >
                        {field}
                      </h4>

                      {/* Original */}
                      <div style={{ marginBottom: "12px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "#ef4444",
                            background: "rgba(239,68,68,0.1)",
                            borderRadius: "4px",
                            padding: "2px 8px",
                            marginBottom: "6px",
                          }}
                        >
                          ORIGINAL
                        </span>
                        <p
                          style={{
                            fontSize: "13px",
                            color: "#64748b",
                            lineHeight: "1.5",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {result.original[field] || "(empty)"}
                        </p>
                      </div>

                      {/* Optimized */}
                      <div>
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "#22c55e",
                            background: "rgba(34,197,94,0.1)",
                            borderRadius: "4px",
                            padding: "2px 8px",
                            marginBottom: "6px",
                          }}
                        >
                          OPTIMIZED
                        </span>
                        {editMode ? (
                          <textarea
                            value={
                              field === "title"
                                ? editedTitle
                                : field === "description"
                                  ? editedDescription
                                  : editedTags
                            }
                            onChange={(e) => {
                              if (field === "title") setEditedTitle(e.target.value);
                              else if (field === "description") setEditedDescription(e.target.value);
                              else setEditedTags(e.target.value);
                            }}
                            rows={field === "description" ? 6 : 2}
                            style={{
                              width: "100%",
                              background: "#1a1a2e",
                              border: "1px solid #334155",
                              borderRadius: "8px",
                              color: "#f1f5f9",
                              padding: "10px 12px",
                              fontSize: "13px",
                              resize: "vertical",
                              outline: "none",
                              fontFamily: "inherit",
                              lineHeight: "1.5",
                              boxSizing: "border-box",
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = "#e94560";
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = "#334155";
                            }}
                          />
                        ) : (
                          <p
                            style={{
                              fontSize: "13px",
                              color: "#f1f5f9",
                              lineHeight: "1.5",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {result.optimized[field] || "(empty)"}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Reasoning */}
                  <div
                    style={{
                      background: "#16162a",
                      borderRadius: "12px",
                      border: "1px solid #1e293b",
                      padding: "20px",
                    }}
                  >
                    <h4
                      style={{
                        fontSize: "13px",
                        fontWeight: 700,
                        color: "#94a3b8",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        marginBottom: "8px",
                      }}
                    >
                      AI Reasoning
                    </h4>
                    <p
                      style={{
                        fontSize: "13px",
                        color: "#94a3b8",
                        lineHeight: "1.6",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {result.reasoning}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: "flex", gap: "12px" }}>
                    <button
                      onClick={() => {
                        if (editMode) {
                          setEditMode(false);
                        } else {
                          setEditedTitle(result.optimized.title);
                          setEditedDescription(result.optimized.description);
                          setEditedTags(result.optimized.tags);
                          setEditMode(true);
                        }
                      }}
                      style={{
                        flex: 1,
                        background: "none",
                        border: "1px solid #334155",
                        borderRadius: "8px",
                        color: "#94a3b8",
                        padding: "12px 0",
                        fontSize: "14px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {editMode ? "Done Editing" : "Edit"}
                    </button>
                    <button
                      onClick={handlePush}
                      disabled={pushing}
                      style={{
                        flex: 2,
                        background: pushing ? "#334155" : "#e94560",
                        border: "none",
                        borderRadius: "8px",
                        color: "#fff",
                        padding: "12px 0",
                        fontSize: "14px",
                        fontWeight: 600,
                        cursor: pushing ? "not-allowed" : "pointer",
                      }}
                    >
                      {pushing ? "Pushing..." : "Push to Shopify"}
                    </button>
                  </div>

                  {/* Push status */}
                  {pushStatus && (
                    <div
                      style={{
                        background: pushStatus.ok
                          ? "rgba(34, 197, 94, 0.1)"
                          : "rgba(239, 68, 68, 0.1)",
                        border: `1px solid ${pushStatus.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                        borderRadius: "8px",
                        padding: "12px 16px",
                        color: pushStatus.ok ? "#86efac" : "#fca5a5",
                        fontSize: "14px",
                        textAlign: "center",
                      }}
                    >
                      {pushStatus.msg}
                    </div>
                  )}
                </>
              )}

              {/* ── AI Image Generation ─────────────────────── */}
              <div
                style={{
                  background: "#16162a",
                  borderRadius: "12px",
                  border: "1px solid #1e293b",
                  padding: "20px",
                }}
              >
                <h4
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: "16px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span style={{ fontSize: "16px" }}>&#127912;</span>
                  AI Image Generation
                </h4>

                {/* Style selector */}
                <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
                  Style
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
                  {[
                    { id: "product", label: "Product Shot" },
                    { id: "lifestyle", label: "Lifestyle" },
                    { id: "white-background", label: "White BG" },
                    { id: "studio", label: "Studio" },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setImageStyle(s.id)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        border: imageStyle === s.id ? "1px solid #e94560" : "1px solid #334155",
                        background: imageStyle === s.id ? "rgba(233,69,96,0.15)" : "#1a1a2e",
                        color: imageStyle === s.id ? "#e94560" : "#94a3b8",
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Custom prompt */}
                <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
                  Custom prompt (optional)
                </label>
                <input
                  type="text"
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="e.g. Product on marble countertop with plants..."
                  style={{
                    width: "100%",
                    background: "#1a1a2e",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    color: "#f1f5f9",
                    padding: "10px 12px",
                    fontSize: "13px",
                    outline: "none",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                    marginBottom: "12px",
                  }}
                />

                <button
                  onClick={handleGenerateImage}
                  disabled={generatingImage}
                  style={{
                    width: "100%",
                    background: generatingImage ? "#334155" : "linear-gradient(135deg, #4285f4, #34a853)",
                    border: "none",
                    borderRadius: "8px",
                    color: "#fff",
                    padding: "10px 0",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: generatingImage ? "not-allowed" : "pointer",
                  }}
                >
                  {generatingImage ? "Generating with Nano Banana..." : "Generate AI Image"}
                </button>

                {/* Generated images */}
                {generatedImages.length > 0 && (
                  <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                    {generatedImages.map((img, i) => (
                      <div key={i}>
                        <img
                          src={`data:image/png;base64,${img}`}
                          alt={`Generated ${i + 1}`}
                          style={{
                            width: "100%",
                            borderRadius: "8px",
                            border: "1px solid #334155",
                          }}
                        />
                        {/* Image action buttons */}
                        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                          <a
                            href={`data:image/png;base64,${img}`}
                            download={`${selectedProduct?.title || "product"}-ai-${i + 1}.png`}
                            style={{
                              flex: 1,
                              background: "#1a1a2e",
                              border: "1px solid #334155",
                              borderRadius: "6px",
                              color: "#94a3b8",
                              padding: "8px 0",
                              fontSize: "12px",
                              fontWeight: 600,
                              textDecoration: "none",
                              textAlign: "center",
                              cursor: "pointer",
                            }}
                          >
                            Download
                          </a>
                          <button
                            onClick={() => handleUploadToShopify(img, i)}
                            disabled={uploadingImage === i}
                            style={{
                              flex: 2,
                              background: uploadingImage === i
                                ? "#334155"
                                : "linear-gradient(135deg, #96bf48, #5e8e3e)",
                              border: "none",
                              borderRadius: "6px",
                              color: "#fff",
                              padding: "8px 0",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: uploadingImage === i ? "not-allowed" : "pointer",
                            }}
                          >
                            {uploadingImage === i ? "Uploading..." : "Upload to Shopify"}
                          </button>
                        </div>
                        {/* Replace existing image selector */}
                        <div style={{ marginTop: "6px" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#64748b" }}>
                            <input
                              type="checkbox"
                              checked={replaceIndex !== null}
                              onChange={(e) => setReplaceIndex(e.target.checked ? 0 : null)}
                              style={{ accentColor: "#e94560" }}
                            />
                            Replace existing image at position:
                            {replaceIndex !== null && (
                              <input
                                type="number"
                                min={0}
                                value={replaceIndex}
                                onChange={(e) => setReplaceIndex(parseInt(e.target.value) || 0)}
                                style={{
                                  width: "48px",
                                  background: "#1a1a2e",
                                  border: "1px solid #334155",
                                  borderRadius: "4px",
                                  color: "#f1f5f9",
                                  padding: "2px 6px",
                                  fontSize: "11px",
                                  textAlign: "center",
                                }}
                              />
                            )}
                          </label>
                        </div>
                      </div>
                    ))}

                    {/* Upload status */}
                    {uploadStatus && (
                      <div
                        style={{
                          background: uploadStatus.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                          border: `1px solid ${uploadStatus.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                          borderRadius: "8px",
                          padding: "10px 14px",
                          color: uploadStatus.ok ? "#86efac" : "#fca5a5",
                          fontSize: "13px",
                          textAlign: "center",
                        }}
                      >
                        {uploadStatus.msg}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── AI Image Editing ───────────────────────── */}
              <div
                style={{
                  background: "#16162a",
                  borderRadius: "12px",
                  border: "1px solid #1e293b",
                  padding: "20px",
                }}
              >
                <h4
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: "16px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span style={{ fontSize: "16px" }}>&#9999;&#65039;</span>
                  Edit Existing Image
                </h4>

                <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
                  Image URL (paste a product image URL)
                </label>
                <input
                  type="text"
                  value={editImageUrl}
                  onChange={(e) => setEditImageUrl(e.target.value)}
                  placeholder={selectedProduct?.image || "https://cdn.shopify.com/..."}
                  style={{
                    width: "100%",
                    background: "#1a1a2e",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    color: "#f1f5f9",
                    padding: "10px 12px",
                    fontSize: "13px",
                    outline: "none",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                    marginBottom: "10px",
                  }}
                />
                {selectedProduct?.image && !editImageUrl && (
                  <button
                    onClick={() => setEditImageUrl(selectedProduct.image || "")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#e94560",
                      fontSize: "12px",
                      cursor: "pointer",
                      padding: "0",
                      marginBottom: "10px",
                    }}
                  >
                    Use current product image
                  </button>
                )}

                <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
                  Edit instructions
                </label>
                <input
                  type="text"
                  value={editInstructions}
                  onChange={(e) => setEditInstructions(e.target.value)}
                  placeholder="e.g. Remove background, add shadow, change color to blue..."
                  style={{
                    width: "100%",
                    background: "#1a1a2e",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    color: "#f1f5f9",
                    padding: "10px 12px",
                    fontSize: "13px",
                    outline: "none",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                    marginBottom: "12px",
                  }}
                />

                <button
                  onClick={handleEditImage}
                  disabled={editingImage || !editImageUrl || !editInstructions}
                  style={{
                    width: "100%",
                    background:
                      editingImage || !editImageUrl || !editInstructions
                        ? "#334155"
                        : "linear-gradient(135deg, #f59e0b, #d97706)",
                    border: "none",
                    borderRadius: "8px",
                    color: "#fff",
                    padding: "10px 0",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor:
                      editingImage || !editImageUrl || !editInstructions
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {editingImage ? "Editing with AI..." : "Edit Image"}
                </button>

                {/* Edited image result */}
                {editedImage && (
                  <div style={{ marginTop: "16px" }}>
                    <img
                      src={`data:image/png;base64,${editedImage}`}
                      alt="Edited"
                      style={{
                        width: "100%",
                        borderRadius: "8px",
                        border: "1px solid #334155",
                      }}
                    />
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                      <a
                        href={`data:image/png;base64,${editedImage}`}
                        download={`${selectedProduct?.title || "product"}-edited.png`}
                        style={{
                          flex: 1,
                          background: "#1a1a2e",
                          border: "1px solid #334155",
                          borderRadius: "6px",
                          color: "#94a3b8",
                          padding: "8px 0",
                          fontSize: "12px",
                          fontWeight: 600,
                          textDecoration: "none",
                          textAlign: "center",
                        }}
                      >
                        Download
                      </a>
                      <button
                        onClick={() => handleUploadToShopify(editedImage, 99)}
                        disabled={uploadingImage === 99}
                        style={{
                          flex: 2,
                          background: uploadingImage === 99
                            ? "#334155"
                            : "linear-gradient(135deg, #96bf48, #5e8e3e)",
                          border: "none",
                          borderRadius: "6px",
                          color: "#fff",
                          padding: "8px 0",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: uploadingImage === 99 ? "not-allowed" : "pointer",
                        }}
                      >
                        {uploadingImage === 99 ? "Uploading..." : "Upload to Shopify"}
                      </button>
                    </div>
                  </div>
                )}
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

export default function ProductsPage() {
  return (
    <AuthGuard>
      <ProductsContent />
    </AuthGuard>
  );
}
