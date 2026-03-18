"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AuthGuard from "@/components/auth-guard";
import { api } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProductDetail {
  id: string;
  store_id: string | null;
  url: string;
  platform: string;
  platform_id: string;
  title: string;
  brand: string | null;
  description: string | null;
  category: string | null;
  price: number | null;
  currency: string;
  original_price: number | null;
  rating: number | null;
  review_count: number;
  images: string[];
  bullet_points: string[];
  metadata_: Record<string, any>;
  scraped_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  overall_score?: number | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "#64748b";
  if (score >= 75) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function scoreBg(score: number | null | undefined): string {
  if (score == null) return "#1e293b";
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
    case "walmart":
      return { bg: "linear-gradient(135deg, #0071dc, #004c91)", label: "Walmart" };
    case "mercadolibre":
      return { bg: "linear-gradient(135deg, #ffe600, #d4b800)", label: "MercadoLibre" };
    default:
      return { bg: "linear-gradient(135deg, #64748b, #475569)", label: platform };
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
      {Array.from({ length: full }).map((_, i) => (
        <span key={`f-${i}`} style={{ color: "#f59e0b", fontSize: "18px" }}>
          &#9733;
        </span>
      ))}
      {half && (
        <span style={{ color: "#f59e0b", fontSize: "18px", opacity: 0.6 }}>
          &#9733;
        </span>
      )}
      {Array.from({ length: empty }).map((_, i) => (
        <span key={`e-${i}`} style={{ color: "#334155", fontSize: "18px" }}>
          &#9733;
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Score Ring (reused from audit pattern)                             */
/* ------------------------------------------------------------------ */

function ScoreRing({ score, size = 100 }: { score: number; size?: number }) {
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth="6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: size * 0.28, fontWeight: 800, color: "#f1f5f9" }}>
          {Math.round(score)}
        </span>
        <span style={{ fontSize: size * 0.1, color: "#94a3b8" }}>/ 100</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Image Gallery                                                      */
/* ------------------------------------------------------------------ */

function ImageGallery({ images, title }: { images: string[]; title: string }) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div
        style={{
          width: "100%",
          height: "400px",
          background: "#0f0f23",
          borderRadius: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #1e293b",
        }}
      >
        <span style={{ fontSize: "72px", color: "#334155" }}>&#128247;</span>
      </div>
    );
  }

  return (
    <div>
      {/* Main image */}
      <div
        style={{
          width: "100%",
          height: "400px",
          background: "#0f0f23",
          borderRadius: "12px",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #1e293b",
          position: "relative",
        }}
      >
        <img
          src={images[activeIndex]}
          alt={`${title} - image ${activeIndex + 1}`}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
          }}
        />
        {/* Image counter */}
        {images.length > 1 && (
          <div
            style={{
              position: "absolute",
              bottom: "12px",
              right: "12px",
              background: "rgba(0,0,0,0.7)",
              borderRadius: "6px",
              padding: "4px 10px",
              fontSize: "12px",
              fontWeight: 600,
              color: "#f1f5f9",
            }}
          >
            {activeIndex + 1} / {images.length}
          </div>
        )}
        {/* Prev / Next arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={() => setActiveIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "rgba(0,0,0,0.6)",
                border: "1px solid #334155",
                color: "#f1f5f9",
                fontSize: "18px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              &#8249;
            </button>
            <button
              onClick={() => setActiveIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))}
              style={{
                position: "absolute",
                right: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "rgba(0,0,0,0.6)",
                border: "1px solid #334155",
                color: "#f1f5f9",
                fontSize: "18px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              &#8250;
            </button>
          </>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginTop: "12px",
            overflowX: "auto",
            paddingBottom: "4px",
          }}
        >
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "8px",
                overflow: "hidden",
                border: i === activeIndex ? "2px solid #e94560" : "2px solid #1e293b",
                background: "#0f0f23",
                cursor: "pointer",
                flexShrink: 0,
                padding: 0,
                opacity: i === activeIndex ? 1 : 0.6,
                transition: "opacity 0.15s, border-color 0.15s",
              }}
            >
              <img
                src={img}
                alt={`Thumbnail ${i + 1}`}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Product Detail Content                                             */
/* ------------------------------------------------------------------ */

function ProductDetailContent() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    setError(null);

    api
      .get<ProductDetail>(`/products/${productId}`)
      .then((data) => {
        setProduct(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load product");
        setLoading(false);
      });
  }, [productId]);

  /* Loading */
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 20px",
          color: "#64748b",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            border: "3px solid #1e293b",
            borderTopColor: "#e94560",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            marginBottom: "16px",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ fontSize: "15px" }}>Loading product...</p>
      </div>
    );
  }

  /* Error */
  if (error || !product) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "80px 20px",
        }}
      >
        <div
          style={{
            background: "#16162a",
            borderRadius: "12px",
            border: "1px solid #7f1d1d",
            padding: "40px",
            maxWidth: "480px",
            margin: "0 auto",
          }}
        >
          <p style={{ fontSize: "48px", marginBottom: "16px" }}>&#9888;&#65039;</p>
          <p style={{ fontSize: "18px", color: "#fca5a5", marginBottom: "8px", fontWeight: 600 }}>
            Product not found
          </p>
          <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "24px" }}>
            {error || "The product you're looking for doesn't exist or was removed."}
          </p>
          <button
            onClick={() => router.push("/products")}
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
            Back to Products
          </button>
        </div>
      </div>
    );
  }

  const badge = platformBadge(product.platform);
  const hasDiscount = product.original_price != null && product.price != null && product.original_price > product.price;
  const metadataEntries = Object.entries(product.metadata_ || {}).filter(
    ([, v]) => v != null && v !== ""
  );

  return (
    <div>
      {/* Back button + title row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "32px",
        }}
      >
        <button
          onClick={() => router.push("/products")}
          style={{
            background: "#16162a",
            border: "1px solid #1e293b",
            borderRadius: "8px",
            color: "#94a3b8",
            padding: "8px 14px",
            fontSize: "14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#334155";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#1e293b";
          }}
        >
          &#8592; Back
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#f1f5f9",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {product.title}
          </h1>
        </div>
      </div>

      {/* Main layout: two columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "32px",
          alignItems: "start",
        }}
      >
        {/* LEFT: Image gallery */}
        <div>
          <ImageGallery images={product.images} title={product.title} />
        </div>

        {/* RIGHT: Product info */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Title + brand + platform */}
          <div
            style={{
              background: "#16162a",
              borderRadius: "12px",
              border: "1px solid #1e293b",
              padding: "24px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "12px",
                flexWrap: "wrap",
              }}
            >
              {/* Platform badge */}
              <span
                style={{
                  background: badge.bg,
                  borderRadius: "6px",
                  padding: "4px 12px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#fff",
                  letterSpacing: "0.3px",
                }}
              >
                {badge.label}
              </span>
              {/* Category */}
              {product.category && (
                <span
                  style={{
                    background: "#1a1a2e",
                    borderRadius: "6px",
                    padding: "4px 12px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#94a3b8",
                    border: "1px solid #1e293b",
                  }}
                >
                  {product.category}
                </span>
              )}
            </div>

            <h2
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "#f1f5f9",
                lineHeight: 1.4,
                marginBottom: "8px",
              }}
            >
              {product.title}
            </h2>

            {product.brand && (
              <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "16px" }}>
                by{" "}
                <span style={{ color: "#94a3b8", fontWeight: 600 }}>{product.brand}</span>
              </p>
            )}

            {/* Rating */}
            {product.rating != null && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "16px",
                }}
              >
                <StarRating rating={product.rating} />
                <span style={{ fontSize: "16px", fontWeight: 700, color: "#f1f5f9" }}>
                  {product.rating.toFixed(1)}
                </span>
                <span style={{ fontSize: "13px", color: "#64748b" }}>
                  ({product.review_count.toLocaleString()} review{product.review_count !== 1 ? "s" : ""})
                </span>
              </div>
            )}

            {/* Price */}
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "12px",
                marginBottom: "4px",
              }}
            >
              {product.price != null ? (
                <span style={{ fontSize: "32px", fontWeight: 800, color: "#f1f5f9" }}>
                  {product.currency === "USD" ? "$" : product.currency + " "}
                  {product.price.toFixed(2)}
                </span>
              ) : (
                <span style={{ fontSize: "24px", fontWeight: 600, color: "#64748b" }}>
                  Price not available
                </span>
              )}
              {hasDiscount && (
                <span
                  style={{
                    fontSize: "16px",
                    color: "#64748b",
                    textDecoration: "line-through",
                  }}
                >
                  {product.currency === "USD" ? "$" : product.currency + " "}
                  {product.original_price!.toFixed(2)}
                </span>
              )}
              {hasDiscount && (
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#22c55e",
                    background: "rgba(34,197,94,0.15)",
                    borderRadius: "6px",
                    padding: "3px 10px",
                  }}
                >
                  {Math.round(((product.original_price! - product.price!) / product.original_price!) * 100)}% OFF
                </span>
              )}
            </div>
          </div>

          {/* Audit Score */}
          {product.overall_score != null && (
            <div
              style={{
                background: "#16162a",
                borderRadius: "12px",
                border: "1px solid #1e293b",
                padding: "24px",
                display: "flex",
                alignItems: "center",
                gap: "24px",
              }}
            >
              <ScoreRing score={product.overall_score} size={90} />
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#f1f5f9", marginBottom: "4px" }}>
                  Audit Score
                </h3>
                <p style={{ fontSize: "13px", color: "#94a3b8", lineHeight: 1.5 }}>
                  {product.overall_score >= 75
                    ? "This listing is well-optimized. Keep it up!"
                    : product.overall_score >= 50
                      ? "This listing has room for improvement."
                      : "This listing needs significant optimization."}
                </p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => router.push(`/products?optimize=${product.id}`)}
              style={{
                flex: 1,
                background: "#e94560",
                border: "none",
                borderRadius: "8px",
                color: "#fff",
                padding: "14px 0",
                fontSize: "15px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "#d13354";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "#e94560";
              }}
            >
              Optimize
            </button>
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                background: "none",
                border: "1px solid #334155",
                borderRadius: "8px",
                color: "#94a3b8",
                padding: "14px 0",
                fontSize: "15px",
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "none",
                textAlign: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "border-color 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "#94a3b8";
                (e.currentTarget as HTMLAnchorElement).style.color = "#f1f5f9";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "#334155";
                (e.currentTarget as HTMLAnchorElement).style.color = "#94a3b8";
              }}
            >
              View on {badge.label} &#8599;
            </a>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  Below-the-fold content                                       */}
      {/* ============================================================ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
          marginTop: "32px",
        }}
      >
        {/* Description */}
        {product.description && (
          <div
            style={{
              background: "#16162a",
              borderRadius: "12px",
              border: "1px solid #1e293b",
              padding: "24px",
              gridColumn: product.bullet_points.length > 0 ? "1 / 2" : "1 / -1",
            }}
          >
            <h3
              style={{
                fontSize: "14px",
                fontWeight: 700,
                color: "#94a3b8",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: "16px",
              }}
            >
              Description
            </h3>
            <p
              style={{
                fontSize: "14px",
                color: "#e2e8f0",
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {product.description}
            </p>
          </div>
        )}

        {/* Bullet Points */}
        {product.bullet_points.length > 0 && (
          <div
            style={{
              background: "#16162a",
              borderRadius: "12px",
              border: "1px solid #1e293b",
              padding: "24px",
              gridColumn: product.description ? "2 / 3" : "1 / -1",
            }}
          >
            <h3
              style={{
                fontSize: "14px",
                fontWeight: 700,
                color: "#94a3b8",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: "16px",
              }}
            >
              Key Features
            </h3>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {product.bullet_points.map((bp, i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    padding: "10px 0",
                    borderBottom:
                      i < product.bullet_points.length - 1 ? "1px solid #1e293b" : "none",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "#e94560",
                      flexShrink: 0,
                      marginTop: "7px",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "14px",
                      color: "#e2e8f0",
                      lineHeight: 1.6,
                    }}
                  >
                    {bp}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Metadata / Tags */}
        {metadataEntries.length > 0 && (
          <div
            style={{
              background: "#16162a",
              borderRadius: "12px",
              border: "1px solid #1e293b",
              padding: "24px",
              gridColumn: "1 / -1",
            }}
          >
            <h3
              style={{
                fontSize: "14px",
                fontWeight: 700,
                color: "#94a3b8",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: "16px",
              }}
            >
              Metadata &amp; Tags
            </h3>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              {metadataEntries.map(([key, value]) => (
                <div
                  key={key}
                  style={{
                    background: "#1a1a2e",
                    borderRadius: "8px",
                    border: "1px solid #1e293b",
                    padding: "8px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.3px",
                    }}
                  >
                    {key}
                  </span>
                  <span style={{ fontSize: "13px", color: "#e2e8f0" }}>
                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Product Details / Meta info */}
        <div
          style={{
            background: "#16162a",
            borderRadius: "12px",
            border: "1px solid #1e293b",
            padding: "24px",
            gridColumn: "1 / -1",
          }}
        >
          <h3
            style={{
              fontSize: "14px",
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: "16px",
            }}
          >
            Product Details
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "16px",
            }}
          >
            {[
              { label: "Platform", value: badge.label },
              { label: "Platform ID", value: product.platform_id },
              { label: "Currency", value: product.currency },
              { label: "Images", value: `${product.images.length} image${product.images.length !== 1 ? "s" : ""}` },
              { label: "Review Count", value: product.review_count.toLocaleString() },
              { label: "Scraped At", value: formatDate(product.scraped_at) },
              { label: "Created At", value: formatDate(product.created_at) },
              { label: "Updated At", value: formatDate(product.updated_at) },
            ].map((item) => (
              <div key={item.label}>
                <p
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: "4px",
                  }}
                >
                  {item.label}
                </p>
                <p
                  style={{
                    fontSize: "14px",
                    color: "#e2e8f0",
                    fontWeight: 500,
                    wordBreak: "break-all",
                  }}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page Export                                                         */
/* ------------------------------------------------------------------ */

export default function ProductDetailPage() {
  return (
    <AuthGuard>
      <ProductDetailContent />
    </AuthGuard>
  );
}
