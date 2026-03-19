"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

type AuditStatus = "pending" | "scraping" | "analyzing" | "generating" | "completed" | "failed";

interface CategoryIssue {
  issue: string;
  impact: "high" | "medium" | "low";
  detail: string;
  fix_cost: number;
  fix_action: string;
}

interface DimensionScores {
  title: number;
  main_image: number;
  gallery: number;
  bullets: number;
  description: number;
  pricing: number;
  reviews: number;
  seo: number;
  brand: number;
  competitive: number;
  // Legacy fallback
  images?: number;
  content?: number;
}

interface Recommendation {
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  category: string;
}

interface ProductData {
  title: string;
  brand: string;
  price: number | null;
  currency: string;
  original_price: number | null;
  discount_percent: number | null;
  images: string[];
  video_urls: string[];
  rating: number | null;
  review_count: number;
  asin: string;
  category: string;
  bullet_points: string[];
  in_stock: boolean;
  seller_name: string;
  fulfillment: string;
}

interface AuditResult {
  id: string;
  url: string;
  status: AuditStatus;
  overall_score: number | null;
  dimension_scores: DimensionScores;
  strengths: string[];
  weaknesses: string[];
  recommendations: Recommendation[];
  category_issues: Record<string, CategoryIssue[]>;
  fix_costs: Record<string, number>;
  product_data: ProductData;
  generated_copy: Record<string, any>;
  competitive_data: Record<string, any>;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

/* ─── Constants ─── */

const STEPS: { key: AuditStatus; label: string; sub: string }[] = [
  { key: "scraping", label: "Extracting Data", sub: "Scanning product listing in real-time" },
  { key: "analyzing", label: "AI Analysis", sub: "Scoring across 10 performance dimensions" },
  { key: "generating", label: "Building Report", sub: "Generating fixes & competitive intel" },
];

const IMPACT_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

const DIM_META: Record<string, { label: string; icon: string }> = {
  title: { label: "Title", icon: "M4 7V4h16v3M9 20h6M12 4v16" },
  main_image: { label: "Main Image", icon: "M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM12 8l4 4-4 4M8 12h8" },
  gallery: { label: "Gallery & Video", icon: "M4 6h16M4 10h16M4 14h16M4 18h16" },
  bullets: { label: "Bullet Points", icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
  description: { label: "Description", icon: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8" },
  pricing: { label: "Pricing", icon: "M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" },
  reviews: { label: "Reviews", icon: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" },
  seo: { label: "Search & SEO", icon: "M11 11m-8 0a8 8 0 1016 0 8 8 0 10-16 0M21 21l-4.35-4.35" },
  brand: { label: "Brand Presence", icon: "M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" },
  competitive: { label: "Competitive Edge", icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
};

const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  title: { label: "Title Optimization", icon: "M4 7V4h16v3M9 20h6M12 4v16" },
  main_image: { label: "Main Image", icon: "M3 3h18v18H3zM8.5 8.5m-1.5 0a1.5 1.5 0 103 0 1.5 1.5 0 10-3 0M21 15l-5-5L5 21" },
  gallery: { label: "Gallery & Video", icon: "M4 6h16M4 10h16M4 14h16M4 18h16" },
  bullets: { label: "Bullet Points", icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
  description: { label: "Product Description", icon: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8" },
  pricing: { label: "Pricing Strategy", icon: "M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" },
  keywords: { label: "Keywords & SEO", icon: "M11 11m-8 0a8 8 0 1016 0 8 8 0 10-16 0M21 21l-4.35-4.35" },
  brand: { label: "Brand Strategy", icon: "M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" },
  competitive: { label: "Competitive Position", icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
  // Legacy
  images: { label: "Images", icon: "M3 3h18v18H3zM8.5 8.5m-1.5 0a1.5 1.5 0 103 0 1.5 1.5 0 10-3 0M21 15l-5-5L5 21" },
  content: { label: "Content", icon: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8" },
  seo: { label: "SEO Keywords", icon: "M11 11m-8 0a8 8 0 1016 0 8 8 0 10-16 0M21 21l-4.35-4.35" },
};

/* ─── SVG Icon Component ─── */
function SvgIcon({ d, size = 18, color = "currentColor" }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {d.split("M").filter(Boolean).length > 3
        ? <path d={d.startsWith("M") ? d : `M${d}`} />
        : d.split(/(?=M)/).map((seg, i) => <path key={i} d={seg} />)
      }
    </svg>
  );
}

/* ─── Star Rating ─── */
function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div style={{ display: "flex", gap: "2px" }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg key={star} width={size} height={size} viewBox="0 0 24 24"
          fill={star <= Math.round(rating) ? "#f59e0b" : "none"}
          stroke="#f59e0b" strokeWidth="2">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

/* ─── Animated Score Ring ─── */
function ScoreRing({ score, size = 180, delay = 0 }: { score: number; size?: number; delay?: number }) {
  const [animated, setAnimated] = useState(0);
  const [show, setShow] = useState(false);
  const radius = (size - 18) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animated / 100) * circumference;
  const color = animated >= 75 ? "#22c55e" : animated >= 50 ? "#f59e0b" : "#ef4444";
  const glowColor = animated >= 75 ? "rgba(34,197,94,0.35)" : animated >= 50 ? "rgba(245,158,11,0.35)" : "rgba(239,68,68,0.35)";

  useEffect(() => {
    const t1 = setTimeout(() => setShow(true), delay);
    const t2 = setTimeout(() => {
      const start = performance.now();
      const duration = 2200;
      const animate = (now: number) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 4);
        setAnimated(Math.round(score * eased));
        if (p < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }, delay + 400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [score, delay]);

  return (
    <div style={{
      position: "relative", width: size, height: size,
      opacity: show ? 1 : 0, transform: show ? "scale(1)" : "scale(0.6)",
      transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
      filter: show ? `drop-shadow(0 0 30px ${glowColor})` : "none",
    }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="14" />
        <circle cx={size / 2} cy={size / 2} r={radius + 7} fill="none" stroke="rgba(255,255,255,0.015)" strokeWidth="1" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth="14"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke 0.5s", filter: `drop-shadow(0 0 8px ${color})` }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: size * 0.28, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.04em", lineHeight: 1 }}>
          {animated}
        </span>
        <span style={{ fontSize: size * 0.08, color: "#3e4554", fontWeight: 600, letterSpacing: "0.1em", marginTop: "4px" }}>
          OUT OF 100
        </span>
      </div>
    </div>
  );
}

/* ─── Dimension Bar (compact) ─── */
function DimensionBar({ dimKey, label, score, delay = 0 }: { dimKey: string; label: string; score: number; delay?: number }) {
  const [width, setWidth] = useState(0);
  const [show, setShow] = useState(false);
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

  useEffect(() => {
    const t = setTimeout(() => { setWidth(score); setShow(true); }, delay);
    return () => clearTimeout(t);
  }, [score, delay]);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "12px",
      opacity: show ? 1 : 0, transform: show ? "translateX(0)" : "translateX(-8px)",
      transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
    }}>
      <div style={{ width: "110px", fontSize: "12px", color: "#8892a4", fontWeight: 500, textAlign: "right", flexShrink: 0 }}>
        {label}
      </div>
      <div style={{ flex: 1, height: "8px", borderRadius: "4px", background: "rgba(255,255,255,0.04)", overflow: "hidden", position: "relative" }}>
        <div style={{
          height: "100%", width: `${width}%`, borderRadius: "4px", background: `linear-gradient(90deg, ${color}90, ${color})`,
          transition: "width 1.6s cubic-bezier(0.16, 1, 0.3, 1)",
          boxShadow: `0 0 12px ${color}30`,
        }} />
      </div>
      <span style={{ width: "32px", fontSize: "13px", fontWeight: 700, color, fontFamily: "monospace", textAlign: "right" }}>{score}</span>
    </div>
  );
}

/* ─── Severity Badge ─── */
function SeverityBadge({ score }: { score: number }) {
  const severity = score >= 75 ? "GOOD" : score >= 50 ? "NEEDS WORK" : "CRITICAL";
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  const isCritical = score < 50;

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "6px",
      fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em",
      color, padding: "3px 10px", borderRadius: "6px",
      background: `${color}10`, border: `1px solid ${color}20`,
      animation: isCritical ? "pulse-badge 2s ease-in-out infinite" : "none",
    }}>
      {isCritical && <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />}
      {severity}
    </span>
  );
}

/* ─── Fix Button ─── */
function FixButton({ cost, action }: { cost: number; action: string }) {
  return (
    <button
      style={{
        display: "inline-flex", alignItems: "center", gap: "8px",
        padding: "7px 14px", borderRadius: "8px", border: "none",
        background: "linear-gradient(135deg, #e94560, #c13550)",
        color: "#fff", fontSize: "11px", fontWeight: 600,
        cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.2s",
        boxShadow: "0 2px 8px rgba(233, 69, 96, 0.25)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(233, 69, 96, 0.35)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(233, 69, 96, 0.25)"; }}
    >
      {action}
      <span style={{
        background: "rgba(255,255,255,0.2)", borderRadius: "4px",
        padding: "2px 6px", fontSize: "9px", fontWeight: 700,
      }}>
        {cost} tokens
      </span>
    </button>
  );
}

/* ─── Product Hero Card ─── */
function ProductHero({ product, score, delay = 0 }: { product: ProductData; score: number; delay?: number }) {
  const [show, setShow] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const isCritical = score < 50;
  const borderColor = isCritical ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.06)";

  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div style={{
      borderRadius: "16px", overflow: "hidden",
      background: "rgba(13, 13, 32, 0.9)",
      border: `1px solid ${borderColor}`,
      opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(20px)",
      transition: "all 0.7s cubic-bezier(0.16, 1, 0.3, 1)",
      position: "relative",
    }}>
      {/* Critical overlay glow */}
      {isCritical && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse at top, rgba(239,68,68,0.04) 0%, transparent 60%)",
          zIndex: 1,
        }} />
      )}

      <div style={{ display: "flex", gap: "0", position: "relative", zIndex: 2 }}>
        {/* Product Image */}
        <div style={{
          width: "280px", minHeight: "280px", flexShrink: 0,
          background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", overflow: "hidden",
        }}>
          {product.images && product.images.length > 0 ? (
            <>
              <img
                src={product.images[imgIdx] || product.images[0]}
                alt={product.title}
                style={{ maxWidth: "100%", maxHeight: "260px", objectFit: "contain", padding: "16px" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              {/* Image nav dots */}
              {product.images.length > 1 && (
                <div style={{
                  position: "absolute", bottom: "8px", left: "50%", transform: "translateX(-50%)",
                  display: "flex", gap: "4px",
                }}>
                  {product.images.slice(0, 7).map((_, i) => (
                    <button key={i} onClick={() => setImgIdx(i)} style={{
                      width: "6px", height: "6px", borderRadius: "50%", border: "none",
                      background: i === imgIdx ? "#e94560" : "#ccc", cursor: "pointer",
                      transition: "all 0.2s", padding: 0,
                    }} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ color: "#94a3b8", fontSize: "13px" }}>No image</div>
          )}
        </div>

        {/* Product Info */}
        <div style={{ flex: 1, padding: "24px 28px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "12px" }}>
          {/* ASIN badge */}
          {product.asin && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{
                fontSize: "10px", fontWeight: 700, color: "#525c6c",
                padding: "2px 8px", borderRadius: "4px",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
                fontFamily: "monospace", letterSpacing: "0.05em",
              }}>
                ASIN: {product.asin}
              </span>
              {product.fulfillment && (
                <span style={{
                  fontSize: "10px", fontWeight: 600,
                  color: product.fulfillment.toLowerCase().includes("fba") ? "#22c55e" : "#525c6c",
                  padding: "2px 8px", borderRadius: "4px",
                  background: product.fulfillment.toLowerCase().includes("fba") ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${product.fulfillment.toLowerCase().includes("fba") ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)"}`,
                }}>
                  {product.fulfillment.toLowerCase().includes("fba") ? "FBA" : product.fulfillment}
                </span>
              )}
              {!product.in_stock && (
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#ef4444", padding: "2px 8px", borderRadius: "4px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
                  OUT OF STOCK
                </span>
              )}
            </div>
          )}

          {/* Title */}
          <h2 style={{
            fontSize: "16px", fontWeight: 600, color: "#e2e8f0",
            lineHeight: 1.5, margin: 0,
            display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {product.title}
          </h2>

          {/* Brand */}
          {product.brand && (
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>
              by <span style={{ color: "#8892a4" }}>{product.brand}</span>
            </span>
          )}

          {/* Rating + Reviews */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {product.rating !== null && product.rating > 0 && (
              <>
                <StarRating rating={product.rating} />
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#f59e0b" }}>{product.rating}</span>
              </>
            )}
            {product.review_count > 0 && (
              <span style={{ fontSize: "12px", color: "#525c6c" }}>
                ({product.review_count.toLocaleString()} reviews)
              </span>
            )}
          </div>

          {/* Price */}
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
            {product.price !== null && (
              <span style={{ fontSize: "24px", fontWeight: 800, color: "#f1f5f9" }}>
                {product.currency || "$"}{typeof product.price === "number" ? product.price.toFixed(2) : product.price}
              </span>
            )}
            {product.original_price && product.original_price > (product.price || 0) && (
              <>
                <span style={{ fontSize: "14px", color: "#525c6c", textDecoration: "line-through" }}>
                  {product.currency || "$"}{product.original_price.toFixed(2)}
                </span>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#22c55e", padding: "2px 6px", borderRadius: "4px", background: "rgba(34,197,94,0.08)" }}>
                  -{Math.round((1 - (product.price || 0) / product.original_price) * 100)}%
                </span>
              </>
            )}
          </div>

          {/* Category */}
          {product.category && (
            <span style={{ fontSize: "11px", color: "#3e4554", maxWidth: "400px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
              {product.category}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Category Card ─── */
function CategoryCard({ category, issues, delay = 0 }: {
  category: string; issues: CategoryIssue[]; delay?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [show, setShow] = useState(false);
  const meta = CATEGORY_META[category] || { label: category, icon: "" };
  const highCount = issues.filter(i => i.impact === "high").length;

  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  if (!issues || issues.length === 0) return null;

  return (
    <div style={{
      borderRadius: "12px",
      background: "rgba(13, 13, 32, 0.8)",
      border: `1px solid ${highCount > 0 ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.04)"}`,
      overflow: "hidden",
      opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(12px)",
      transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "12px",
          padding: "16px 20px", border: "none", background: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{
          width: "32px", height: "32px", borderRadius: "8px", flexShrink: 0,
          background: highCount > 0 ? "rgba(239,68,68,0.08)" : "rgba(233,69,96,0.06)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke={highCount > 0 ? "#ef4444" : "#e94560"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {meta.icon.split(/(?=M)/).map((seg, i) => <path key={i} d={seg} />)}
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#f1f5f9" }}>{meta.label}</div>
          <div style={{ fontSize: "11px", color: "#525c6c", marginTop: "2px" }}>
            {issues.length} issue{issues.length !== 1 ? "s" : ""}
            {highCount > 0 && <span style={{ color: "#ef4444", fontWeight: 600 }}> ({highCount} high impact)</span>}
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", color: "#3e4554", flexShrink: 0 }}>
          <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {issues.map((issue, i) => (
            <div key={i} style={{
              padding: "14px 16px", borderRadius: "10px",
              background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)",
            }}>
              <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: "14px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: "6px" }}>
                    <span style={{
                      fontSize: "9px", fontWeight: 700, textTransform: "uppercase",
                      color: IMPACT_COLORS[issue.impact] || "#8892a4",
                      padding: "2px 6px", borderRadius: "3px",
                      background: `${IMPACT_COLORS[issue.impact] || "#8892a4"}10`,
                      letterSpacing: "0.08em",
                    }}>
                      {issue.impact} impact
                    </span>
                  </div>
                  <p style={{ color: "#e2e8f0", fontSize: "13px", fontWeight: 500, margin: "0 0 4px", lineHeight: 1.5 }}>
                    {issue.issue}
                  </p>
                  {issue.detail && issue.detail !== issue.issue && (
                    <p style={{ color: "#525c6c", fontSize: "12px", margin: 0, lineHeight: 1.5 }}>
                      {issue.detail}
                    </p>
                  )}
                </div>
                <FixButton cost={issue.fix_cost} action={issue.fix_action} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Processing Animation (Jarvis Mode) ─── */
function ProcessingView({ status }: { status: AuditStatus }) {
  const stepIndex = STEPS.findIndex(s => s.key === status);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [particles, setParticles] = useState<{ x: number; y: number; vx: number; vy: number; life: number }[]>([]);

  // Particle animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const cx = w / 2;
    const cy = h * 0.38;

    let pts: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number }[] = [];
    let frame: number;

    const addParticle = () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.3 + Math.random() * 0.8;
      const maxLife = 60 + Math.random() * 80;
      pts.push({
        x: cx + (Math.random() - 0.5) * 20,
        y: cy + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: maxLife,
        maxLife,
        size: 1 + Math.random() * 2,
      });
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Add particles
      if (Math.random() < 0.3) addParticle();

      // Draw & update particles
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;

        const alpha = (p.life / p.maxLife) * 0.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(233, 69, 96, ${alpha})`;
        ctx.fill();

        // Glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(233, 69, 96, ${alpha * 0.15})`;
        ctx.fill();

        if (p.life <= 0) pts.splice(i, 1);
      }

      // Center hexagon
      const time = Date.now() / 1000;
      const hexR = 35 + Math.sin(time * 2) * 3;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2 + time * 0.3;
        const x = cx + Math.cos(a) * hexR;
        const y = cy + Math.sin(a) * hexR;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(233, 69, 96, ${0.3 + Math.sin(time * 3) * 0.1})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Outer rotating ring
      const ringR = 55;
      const dashLen = 8;
      for (let i = 0; i < 24; i++) {
        const a = (Math.PI * 2 / 24) * i + time * 0.5;
        const x1 = cx + Math.cos(a) * (ringR - dashLen / 2);
        const y1 = cy + Math.sin(a) * (ringR - dashLen / 2);
        const x2 = cx + Math.cos(a) * (ringR + dashLen / 2);
        const y2 = cy + Math.sin(a) * (ringR + dashLen / 2);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(233, 69, 96, ${0.15 + Math.sin(time * 4 + i) * 0.1})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Second outer ring
      const ring2R = 70;
      ctx.beginPath();
      ctx.arc(cx, cy, ring2R, time * -0.2, time * -0.2 + Math.PI * 1.5);
      ctx.strokeStyle = "rgba(233, 69, 96, 0.08)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Third ring
      ctx.beginPath();
      ctx.arc(cx, cy, ring2R + 12, time * 0.4, time * 0.4 + Math.PI);
      ctx.strokeStyle = "rgba(233, 69, 96, 0.05)";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Scanning lines from center
      for (let i = 0; i < 3; i++) {
        const a = time * 0.8 + (Math.PI * 2 / 3) * i;
        const len = 80 + Math.sin(time * 2 + i) * 20;
        const grad = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        grad.addColorStop(0, "rgba(233, 69, 96, 0.2)");
        grad.addColorStop(1, "rgba(233, 69, 96, 0)");
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Center dot
      ctx.beginPath();
      ctx.arc(cx, cy, 4 + Math.sin(time * 3) * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "#e94560";
      ctx.shadowColor = "#e94560";
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.shadowBlur = 0;

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div style={{
      borderRadius: "16px",
      background: "rgba(13, 13, 32, 0.9)",
      border: "1px solid rgba(255,255,255,0.04)",
      position: "relative", overflow: "hidden",
    }}>
      {/* Canvas animation */}
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "240px", display: "block" }}
      />

      {/* Steps */}
      <div style={{ padding: "0 32px 32px", display: "flex", flexDirection: "column", gap: "14px", maxWidth: "380px", margin: "0 auto" }}>
        {STEPS.map((step, i) => {
          const isActive = step.key === status;
          const isDone = i < stepIndex;
          const isPending = i > stepIndex;

          return (
            <div key={step.key} style={{
              display: "flex", alignItems: "center", gap: "14px",
              padding: "12px 16px", borderRadius: "10px",
              background: isActive ? "rgba(233, 69, 96, 0.04)" : "transparent",
              border: isActive ? "1px solid rgba(233, 69, 96, 0.08)" : "1px solid transparent",
              opacity: isPending ? 0.3 : 1,
              transition: "all 0.5s",
            }}>
              {/* Step indicator */}
              <div style={{
                width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isDone ? "rgba(34, 197, 94, 0.1)" : isActive ? "rgba(233, 69, 96, 0.1)" : "rgba(255,255,255,0.02)",
                border: isDone ? "1px solid rgba(34, 197, 94, 0.2)" : isActive ? "1px solid rgba(233, 69, 96, 0.15)" : "1px solid rgba(255,255,255,0.04)",
                transition: "all 0.5s",
              }}>
                {isDone ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : isActive ? (
                  <div style={{
                    width: "8px", height: "8px", borderRadius: "50%",
                    background: "#e94560", boxShadow: "0 0 10px rgba(233, 69, 96, 0.6)",
                    animation: "pulse-dot 1.2s ease-in-out infinite",
                  }} />
                ) : (
                  <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#3e4554" }} />
                )}
              </div>

              <div>
                <div style={{
                  fontSize: "13px", fontWeight: isActive ? 600 : 500,
                  color: isDone ? "#22c55e" : isActive ? "#f1f5f9" : "#3e4554",
                  transition: "color 0.3s",
                }}>
                  {step.label}
                  {isDone && <span style={{ opacity: 0.6 }}> — complete</span>}
                </div>
                {isActive && (
                  <div style={{ fontSize: "11px", color: "#525c6c", marginTop: "3px" }}>
                    {step.sub}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom scanning bar */}
      <div style={{
        height: "2px", background: "linear-gradient(90deg, transparent, rgba(233, 69, 96, 0.5), transparent)",
        animation: "scan-line 2s ease-in-out infinite",
      }} />
    </div>
  );
}

/* ─── Copy Block ─── */
function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ marginBottom: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, color: "#525c6c", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
        <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{
          fontSize: "11px", color: copied ? "#22c55e" : "#525c6c",
          background: "none", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "4px",
          padding: "3px 8px", cursor: "pointer", transition: "all 0.15s",
        }}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div style={{
        padding: "12px 14px", borderRadius: "8px",
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
        color: "#e2e8f0", fontSize: "13px", lineHeight: 1.6, whiteSpace: "pre-wrap",
      }}>
        {text}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════ */

function AuditPageInner() {
  const searchParams = useSearchParams();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoStarted = useRef(false);

  const handleAudit = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setAudit(null);
    try {
      const result = await api.post<AuditResult>("/audit/free", { url });
      setAudit(result);
    } catch (e: any) {
      setError(e.message || "Failed to start audit");
      setLoading(false);
    }
  };

  const pollAudit = useCallback(async () => {
    if (!audit || audit.status === "completed" || audit.status === "failed") return;
    try {
      const updated = await api.get<AuditResult>(`/audit/status/${audit.id}`);
      setAudit(updated);
      if (updated.status === "completed" || updated.status === "failed") {
        setLoading(false);
      }
    } catch { /* retry silently */ }
  }, [audit]);

  useEffect(() => {
    if (!audit || audit.status === "completed" || audit.status === "failed") return;
    const interval = setInterval(pollAudit, 2000);
    return () => clearInterval(interval);
  }, [audit, pollAudit]);

  useEffect(() => {
    const urlParam = searchParams.get("url");
    if (urlParam && !autoStarted.current) {
      autoStarted.current = true;
      setUrl(urlParam);
      setTimeout(() => {
        setLoading(true);
        api.post<AuditResult>("/audit/free", { url: urlParam })
          .then(setAudit)
          .catch((e: any) => { setError(e.message || "Failed to start audit"); setLoading(false); });
      }, 0);
    }
  }, [searchParams]);

  const isProcessing = audit && !["completed", "failed"].includes(audit.status);
  const isComplete = audit?.status === "completed";
  const isFailed = audit?.status === "failed";

  const totalIssues = audit?.category_issues
    ? Object.values(audit.category_issues).reduce((sum, issues) => sum + (issues?.length || 0), 0) : 0;
  const totalFixCost = audit?.category_issues
    ? Object.values(audit.category_issues).reduce(
        (sum, issues) => sum + (issues || []).reduce((s: number, i: CategoryIssue) => s + (i.fix_cost || 0), 0), 0) : 0;

  // Normalize dimension scores (handle both old 6-dim and new 10-dim)
  const dims = audit?.dimension_scores || {};
  const dimEntries = Object.entries(dims).filter(([_, v]) => typeof v === "number");

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      {/* Background effects */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: "radial-gradient(rgba(255,255,255,0.02) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(233, 69, 96, 0.05), transparent 70%)" }} />

      {/* Nav */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 40px", height: "56px",
        background: "rgba(8, 8, 26, 0.9)", backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,0.03)",
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "7px",
            background: "linear-gradient(135deg, #e94560, #891527)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 12px rgba(233, 69, 96, 0.25)" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3 11V8.5C3 8.22 3.22 8 3.5 8H5.5C5.78 8 6 8.22 6 8.5V11C6 11.28 5.78 11.5 5.5 11.5H3.5C3.22 11.5 3 11.28 3 11Z" fill="rgba(255,255,255,0.4)"/>
              <path d="M6.5 11V6C6.5 5.72 6.72 5.5 7 5.5H9C9.28 5.5 9.5 5.72 9.5 6V11C9.5 11.28 9.28 11.5 9 11.5H7C6.72 11.5 6.5 11.28 6.5 11Z" fill="rgba(255,255,255,0.65)"/>
              <path d="M10 11V4C10 3.72 10.22 3.5 10.5 3.5H12.5C12.78 3.5 13 3.72 13 4V11C13 11.28 12.78 11.5 12.5 11.5H10.5C10.22 11.5 10 11.28 10 11Z" fill="white"/>
            </svg>
          </div>
          <span style={{ fontSize: "16px", fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.5px" }}>Kansa</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px rgba(34,197,94,0.5)" }} />
          <span style={{ fontSize: "11px", color: "#525c6c", fontWeight: 500 }}>Systems Online</span>
        </div>
      </nav>

      {/* Content */}
      <main style={{ position: "relative", zIndex: 1, paddingTop: "100px", paddingBottom: "60px", paddingLeft: "20px", paddingRight: "20px" }}>
        <div style={{ width: "100%", maxWidth: "920px", margin: "0 auto" }}>

          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "36px" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "4px 14px 4px 8px", borderRadius: "999px",
              background: "rgba(233, 69, 96, 0.05)", border: "1px solid rgba(233, 69, 96, 0.1)",
              marginBottom: "16px",
            }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#e94560", boxShadow: "0 0 6px rgba(233,69,96,0.6)" }} />
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#e94560", letterSpacing: "0.06em" }}>AMAZON LISTING AUDIT</span>
            </div>
            <h1 style={{ fontSize: "32px", fontWeight: 800, color: "#f1f5f9", marginBottom: "10px", letterSpacing: "-0.03em" }}>
              AI-Powered Listing Analysis
            </h1>
            <p style={{ color: "#525c6c", fontSize: "14px", lineHeight: 1.6, maxWidth: "440px", margin: "0 auto" }}>
              10-dimension deep scan. Every fixable issue found, scored, and priced.
            </p>
          </div>

          {/* Input */}
          <div style={{
            display: "flex", gap: 0, marginBottom: "10px", borderRadius: "12px", overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.06)", background: "rgba(13, 13, 32, 0.8)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.02)",
          }}>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://amazon.com/dp/B0..."
              disabled={loading}
              onKeyDown={(e) => e.key === "Enter" && handleAudit()}
              style={{ flex: 1, fontSize: "14px", padding: "14px 20px", background: "transparent",
                border: "none", outline: "none", color: "#f1f5f9", fontFamily: "inherit" }} />
            <button onClick={handleAudit} disabled={loading || !url.trim()}
              style={{
                padding: "14px 28px", border: "none", cursor: loading || !url.trim() ? "default" : "pointer",
                background: loading || !url.trim() ? "#1a1a2e" : "linear-gradient(135deg, #e94560, #c13550)",
                color: loading || !url.trim() ? "#3e4554" : "#fff",
                fontSize: "13px", fontWeight: 700, transition: "all 0.2s", whiteSpace: "nowrap",
                borderLeft: "1px solid rgba(255,255,255,0.04)",
              }}>
              {loading ? "Analyzing..." : "Audit Free"}
            </button>
          </div>

          {/* Marketplace badges */}
          <div style={{ display: "flex", justifyContent: "center", gap: "4px", flexWrap: "wrap", marginBottom: "36px" }}>
            {[".com", ".com.mx", ".co.uk", ".de", ".fr", ".es", ".it", ".co.jp", ".com.br", ".in", ".ca", ".com.au"].map((d) => (
              <span key={d} style={{
                fontSize: "10px", color: "#2a2d3a", padding: "2px 6px",
                border: "1px solid rgba(255,255,255,0.03)", borderRadius: "4px",
                fontFamily: "monospace",
              }}>
                amazon{d}
              </span>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: "14px 20px", borderRadius: "12px",
              background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.12)",
              color: "#fca5a5", marginBottom: "20px", fontSize: "13px",
              display: "flex", alignItems: "center", gap: "10px",
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              {error}
            </div>
          )}

          {/* ═══ PROCESSING ═══ */}
          {isProcessing && audit && <ProcessingView status={audit.status} />}

          {/* ═══ FAILED ═══ */}
          {isFailed && audit && (
            <div style={{
              padding: "40px", borderRadius: "16px", textAlign: "center",
              background: "rgba(239, 68, 68, 0.03)", border: "1px solid rgba(239, 68, 68, 0.1)",
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 16px", display: "block" }}>
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              <h2 style={{ color: "#fca5a5", fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>Analysis Failed</h2>
              <p style={{ color: "#525c6c", fontSize: "13px", maxWidth: "400px", margin: "0 auto" }}>{audit.error_message || "Unknown error"}</p>
              <button onClick={() => { setAudit(null); setLoading(false); setError(null); }}
                style={{ marginTop: "20px", padding: "10px 24px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)",
                  background: "none", color: "#8892a4", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                Try Again
              </button>
            </div>
          )}

          {/* ═══ RESULTS ═══ */}
          {isComplete && audit && audit.overall_score !== null && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", animation: "results-in 0.6s ease-out" }}>

              {/* Product Hero */}
              {audit.product_data && audit.product_data.title && (
                <ProductHero product={audit.product_data} score={audit.overall_score} delay={100} />
              )}

              {/* Score + Dimensions */}
              <div style={{
                padding: "32px", borderRadius: "16px",
                background: "rgba(13, 13, 32, 0.9)", border: "1px solid rgba(255,255,255,0.04)",
                position: "relative", overflow: "hidden",
              }}>
                {/* Background glow */}
                <div style={{
                  position: "absolute", top: "-30%", left: "50%", transform: "translateX(-50%)",
                  width: "350px", height: "250px", borderRadius: "50%",
                  background: audit.overall_score < 50
                    ? "radial-gradient(circle, rgba(239, 68, 68, 0.05) 0%, transparent 70%)"
                    : audit.overall_score < 75
                    ? "radial-gradient(circle, rgba(245, 158, 11, 0.05) 0%, transparent 70%)"
                    : "radial-gradient(circle, rgba(34, 197, 94, 0.05) 0%, transparent 70%)",
                  pointerEvents: "none",
                }} />

                <div style={{ display: "flex", gap: "40px", position: "relative" }}>
                  {/* Score Ring */}
                  <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                    <ScoreRing score={audit.overall_score} delay={300} />
                    <SeverityBadge score={audit.overall_score} />
                  </div>

                  {/* Dimension Bars */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px", justifyContent: "center" }}>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "#3e4554", letterSpacing: "0.08em", marginBottom: "4px" }}>
                      PERFORMANCE BY DIMENSION
                    </div>
                    {dimEntries.map(([key, value], i) => {
                      const meta = DIM_META[key] || { label: key, icon: "" };
                      return (
                        <DimensionBar
                          key={key}
                          dimKey={key}
                          label={meta.label}
                          score={value as number}
                          delay={600 + i * 80}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Critical underperformance banner */}
                {audit.overall_score < 50 && (
                  <div style={{
                    marginTop: "24px", padding: "14px 20px", borderRadius: "10px",
                    background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.12)",
                    display: "flex", alignItems: "center", gap: "12px",
                    animation: "fade-in-up 0.5s ease-out 2s both",
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#fca5a5" }}>
                        Critical underperformance detected
                      </div>
                      <div style={{ fontSize: "12px", color: "#525c6c", marginTop: "2px" }}>
                        This listing is actively losing sales. Immediate optimization recommended.
                      </div>
                    </div>
                  </div>
                )}

                {/* Fix All banner */}
                {totalIssues > 0 && (
                  <div style={{
                    marginTop: audit.overall_score < 50 ? "10px" : "24px",
                    padding: "12px 20px", borderRadius: "10px",
                    background: "rgba(233, 69, 96, 0.04)", border: "1px solid rgba(233, 69, 96, 0.08)",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    animation: "fade-in-up 0.5s ease-out 2.2s both",
                  }}>
                    <div>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#f1f5f9" }}>
                        {totalIssues} fixable issue{totalIssues !== 1 ? "s" : ""}
                      </span>
                      <span style={{ fontSize: "12px", color: "#3e4554", marginLeft: "8px" }}>
                        across {Object.keys(audit.category_issues).filter(k => (audit.category_issues[k]?.length || 0) > 0).length} categories
                      </span>
                    </div>
                    <button style={{
                      display: "inline-flex", alignItems: "center", gap: "8px",
                      padding: "10px 20px", borderRadius: "8px", border: "none",
                      background: "linear-gradient(135deg, #e94560, #c13550)",
                      color: "#fff", fontSize: "12px", fontWeight: 700,
                      cursor: "pointer", boxShadow: "0 2px 12px rgba(233, 69, 96, 0.25)",
                      transition: "all 0.2s",
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(233, 69, 96, 0.35)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(233, 69, 96, 0.25)"; }}
                    >
                      Fix All Issues
                      <span style={{ background: "rgba(255,255,255,0.2)", borderRadius: "4px", padding: "2px 8px", fontSize: "10px" }}>
                        {totalFixCost} tokens
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* Category Issues */}
              {totalIssues > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{
                    fontSize: "11px", fontWeight: 600, color: "#3e4554",
                    letterSpacing: "0.08em", padding: "8px 0 4px",
                  }}>
                    ISSUES BY CATEGORY
                  </div>
                  {Object.entries(audit.category_issues)
                    .filter(([_, issues]) => issues && issues.length > 0)
                    .sort(([, a], [, b]) => {
                      const highA = (a || []).filter((i: CategoryIssue) => i.impact === "high").length;
                      const highB = (b || []).filter((i: CategoryIssue) => i.impact === "high").length;
                      return highB - highA;
                    })
                    .map(([cat, issues], i) => (
                      <CategoryCard key={cat} category={cat} issues={issues || []} delay={200 + i * 80} />
                    ))}
                </div>
              )}

              {/* Strengths + Weaknesses side by side */}
              {(audit.strengths?.length > 0 || audit.weaknesses?.length > 0) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  {audit.strengths?.length > 0 && (
                    <div style={{
                      padding: "20px", borderRadius: "14px",
                      background: "rgba(13, 13, 32, 0.8)", border: "1px solid rgba(255,255,255,0.04)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "#22c55e", letterSpacing: "0.06em" }}>STRENGTHS</span>
                      </div>
                      {audit.strengths.map((s, i) => (
                        <div key={i} style={{ display: "flex", gap: "8px", padding: "5px 0",
                          borderBottom: i < audit.strengths.length - 1 ? "1px solid rgba(255,255,255,0.02)" : "none" }}>
                          <span style={{ color: "#22c55e", fontSize: "10px", marginTop: "4px" }}>+</span>
                          <span style={{ color: "#8892a4", fontSize: "12px", lineHeight: 1.5 }}>{s}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {audit.weaknesses?.length > 0 && (
                    <div style={{
                      padding: "20px", borderRadius: "14px",
                      background: "rgba(13, 13, 32, 0.8)", border: "1px solid rgba(255,255,255,0.04)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "#ef4444", letterSpacing: "0.06em" }}>WEAKNESSES</span>
                      </div>
                      {audit.weaknesses.map((w, i) => (
                        <div key={i} style={{ display: "flex", gap: "8px", padding: "5px 0",
                          borderBottom: i < audit.weaknesses.length - 1 ? "1px solid rgba(255,255,255,0.02)" : "none" }}>
                          <span style={{ color: "#ef4444", fontSize: "10px", marginTop: "4px" }}>-</span>
                          <span style={{ color: "#8892a4", fontSize: "12px", lineHeight: 1.5 }}>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* AI-Optimized Copy */}
              {audit.generated_copy && (audit.generated_copy.title || audit.generated_copy.bullets) && (
                <div style={{ padding: "20px", borderRadius: "14px",
                  background: "rgba(13, 13, 32, 0.8)", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e94560" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                    </svg>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#f1f5f9" }}>AI-Optimized Copy</span>
                  </div>
                  <p style={{ color: "#3e4554", fontSize: "11px", marginBottom: "16px" }}>Generated by Claude Opus. Copy to update your listing.</p>
                  {audit.generated_copy.title?.optimized && <CopyBlock label="Title" text={audit.generated_copy.title.optimized} />}
                  {audit.generated_copy.bullets?.optimized && (
                    <CopyBlock label="Bullets" text={
                      Array.isArray(audit.generated_copy.bullets.optimized)
                        ? audit.generated_copy.bullets.optimized.map((b: string, i: number) => `${i + 1}. ${b}`).join("\n")
                        : audit.generated_copy.bullets.optimized
                    } />
                  )}
                  {audit.generated_copy.description?.optimized && <CopyBlock label="Description" text={audit.generated_copy.description.optimized} />}
                </div>
              )}

              {/* Competitive Intel */}
              {audit.competitive_data?.competitive_summary && (
                <div style={{ padding: "20px", borderRadius: "14px",
                  background: "rgba(13, 13, 32, 0.8)", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                    </svg>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#f1f5f9" }}>Competitive Intelligence</span>
                  </div>
                  <p style={{ color: "#8892a4", fontSize: "13px", lineHeight: 1.7, margin: 0 }}>
                    {audit.competitive_data.competitive_summary}
                  </p>
                </div>
              )}

              {/* Audit again */}
              <div style={{ textAlign: "center", paddingTop: "4px" }}>
                <button onClick={() => { setAudit(null); setUrl(""); setLoading(false); }}
                  style={{ padding: "10px 24px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)",
                    background: "none", color: "#525c6c", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                    transition: "all 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#f1f5f9"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "#525c6c"; }}
                >
                  Audit Another Product
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Keyframes */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.5); }
        }
        @keyframes pulse-badge {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
        @keyframes scan-line {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes results-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 768px) {
          nav { padding: 0 16px !important; }
        }
        @media (max-width: 640px) {
          .product-hero-flex { flex-direction: column !important; }
        }
      `}</style>
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#525c6c" }}>Loading...</p>
      </div>
    }>
      <AuditPageInner />
    </Suspense>
  );
}
