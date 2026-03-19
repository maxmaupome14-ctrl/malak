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
  [key: string]: number;
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

const HUD_STEPS = [
  { key: "scraping", text: "SCANNING PRODUCT DNA", sub: "Extracting listing data in real-time" },
  { key: "analyzing", text: "NEURAL ANALYSIS ACTIVE", sub: "AI scoring across 10 dimensions" },
  { key: "generating", text: "COMPILING INTELLIGENCE", sub: "Building optimization strategy" },
];

const IMPACT_COLORS: Record<string, string> = {
  high: "#ef4444", medium: "#f59e0b", low: "#22c55e",
};

const DIM_LABELS: Record<string, string> = {
  title: "Title", main_image: "Main Image", gallery: "Gallery & Video",
  bullets: "Bullet Points", description: "Description", pricing: "Pricing",
  reviews: "Reviews", seo: "SEO & Keywords", brand: "Brand", competitive: "Competitive",
  images: "Images", content: "Content",
};

const CATEGORY_LABELS: Record<string, string> = {
  title: "Title Optimization", main_image: "Main Image", gallery: "Gallery & Video",
  bullets: "Bullet Points", description: "Product Description", pricing: "Pricing Strategy",
  keywords: "Keywords & SEO", brand: "Brand Strategy", competitive: "Competitive Position",
  images: "Images", content: "Content", seo: "SEO Keywords",
};

/* ═══════════════════════════════════════════════════════
   FULL-SCREEN THREAT DETECTION OVERLAY
   ═══════════════════════════════════════════════════════ */

const SCAN_DIMENSIONS = [
  "Title Quality", "Main Image", "Gallery Depth", "Bullet Points", "Description",
  "Pricing Strategy", "Review Signals", "SEO Coverage", "Brand Presence", "Competitive Edge",
];

function HUDOverlay({ status }: { status: AuditStatus }) {
  const stepIndex = HUD_STEPS.findIndex(s => s.key === status);
  const [percent, setPercent] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<boolean[]>([false, false, false]);
  const [activeDim, setActiveDim] = useState(0);
  const [logLines, setLogLines] = useState<string[]>([]);

  // Percentage — faster, more aggressive increments
  useEffect(() => {
    const targets = [30, 65, 95];
    const target = stepIndex >= 0 ? targets[Math.min(stepIndex, 2)] : 0;
    const interval = setInterval(() => {
      setPercent(p => {
        if (p >= target) { clearInterval(interval); return target; }
        const jump = Math.random() > 0.7 ? 3 : 1;
        return Math.min(p + jump, target);
      });
    }, 40);
    return () => clearInterval(interval);
  }, [stepIndex]);

  // Mark completed steps
  useEffect(() => {
    setCompletedSteps(prev => prev.map((_, i) => i < stepIndex));
  }, [stepIndex]);

  // Cycle through dimensions being "scanned"
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveDim(d => (d + 1) % SCAN_DIMENSIONS.length);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  // Live log feed
  useEffect(() => {
    const logs = [
      "Connecting to product database...",
      "Extracting listing metadata...",
      "Parsing HTML structure...",
      "Downloading product images...",
      "Analyzing title keyword density...",
      "Scoring main image resolution...",
      "Evaluating gallery completeness...",
      "Parsing bullet point structure...",
      "Running NLP on description...",
      "Checking pricing vs. competitors...",
      "Aggregating review sentiment...",
      "Mapping keyword coverage...",
      "Analyzing brand consistency...",
      "Benchmarking vs. top 10 listings...",
      "Computing dimension weights...",
      "Generating threat assessment...",
      "Building optimization roadmap...",
      "Compiling final intelligence report...",
    ];
    let idx = 0;
    const interval = setInterval(() => {
      if (idx < logs.length) {
        setLogLines(prev => [...prev.slice(-6), logs[idx]]);
        idx++;
      }
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  const threatLevel = percent < 30 ? "SCANNING" : percent < 65 ? "ANALYZING" : "COMPILING";
  const threatColor = percent < 30 ? "#e94560" : percent < 65 ? "#f59e0b" : "#22c55e";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "#08081a", fontFamily: "'Courier New', monospace",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Subtle grid background */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.03,
        backgroundImage: "linear-gradient(rgba(233,69,96,1) 1px, transparent 1px), linear-gradient(90deg, rgba(233,69,96,1) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }} />

      {/* Scan line */}
      <div style={{
        position: "absolute", left: 0, right: 0, height: "2px", zIndex: 5,
        background: "linear-gradient(90deg, transparent, rgba(233, 69, 96, 0.4), transparent)",
        animation: "scan-v 2s linear infinite",
      }} />

      {/* ── TOP BAR: Alert header ── */}
      <div style={{
        padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid rgba(233, 69, 96, 0.08)", position: "relative", zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "8px", height: "8px", borderRadius: "50%",
            background: "#e94560", boxShadow: "0 0 12px #e94560",
            animation: "alert-flash 0.6s ease-in-out infinite",
          }} />
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#e94560", letterSpacing: "4px" }}>
            AUDIT IN PROGRESS
          </span>
        </div>
        <span style={{ fontSize: "10px", color: "#3e4554", letterSpacing: "2px" }}>
          SYS.KANSA.v2
        </span>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: "32px", position: "relative", zIndex: 10,
        padding: "0 28px",
      }}>

        {/* Threat level badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "6px 18px", borderRadius: "4px",
          background: `${threatColor}08`, border: `1px solid ${threatColor}20`,
          animation: "alert-flash 1.5s ease-in-out infinite",
        }}>
          <div style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: threatColor, boxShadow: `0 0 8px ${threatColor}`,
          }} />
          <span style={{ fontSize: "10px", fontWeight: 700, color: threatColor, letterSpacing: "3px" }}>
            STATUS: {threatLevel}
          </span>
        </div>

        {/* Big percentage */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: "96px", fontWeight: 900, color: "#e94560",
            textShadow: "0 0 40px rgba(233, 69, 96, 0.3)",
            letterSpacing: "-4px", lineHeight: 1,
          }}>
            {percent}
          </div>
          <div style={{
            fontSize: "10px", color: "#3e4554", letterSpacing: "6px", marginTop: "4px",
          }}>
            PERCENT COMPLETE
          </div>
        </div>

        {/* Progress bar — aggressive, full-width */}
        <div style={{ width: "100%", maxWidth: "480px" }}>
          <div style={{
            height: "3px", borderRadius: "2px", background: "rgba(255,255,255,0.03)",
            overflow: "hidden", position: "relative",
          }}>
            <div style={{
              height: "100%", width: `${percent}%`, borderRadius: "2px",
              background: `linear-gradient(90deg, #e94560, ${threatColor})`,
              boxShadow: `0 0 12px ${threatColor}40`,
              transition: "width 0.3s ease-out",
            }} />
            {/* Racing light on the bar */}
            <div style={{
              position: "absolute", top: 0, height: "100%", width: "60px",
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)",
              animation: "bar-race 1.2s linear infinite",
            }} />
          </div>
        </div>

        {/* ── STEP CARDS — the urgency driver ── */}
        <div style={{ width: "100%", maxWidth: "480px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {HUD_STEPS.map((step, i) => {
            const isDone = completedSteps[i];
            const isActive = i === stepIndex;
            const isPending = i > stepIndex;

            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: "14px",
                padding: "12px 16px", borderRadius: "6px",
                background: isActive ? "rgba(233, 69, 96, 0.04)" : isDone ? "rgba(34, 197, 94, 0.02)" : "rgba(255,255,255,0.01)",
                border: `1px solid ${isActive ? "rgba(233, 69, 96, 0.12)" : isDone ? "rgba(34, 197, 94, 0.06)" : "rgba(255,255,255,0.02)"}`,
                opacity: isPending ? 0.3 : 1,
                transition: "all 0.4s",
              }}>
                {/* Status indicator */}
                <div style={{
                  width: "28px", height: "28px", borderRadius: "6px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: isDone ? "rgba(34, 197, 94, 0.08)" : isActive ? "rgba(233, 69, 96, 0.06)" : "transparent",
                  border: `1px solid ${isDone ? "rgba(34,197,94,0.15)" : isActive ? "rgba(233,69,96,0.12)" : "rgba(255,255,255,0.04)"}`,
                  flexShrink: 0,
                }}>
                  {isDone && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {isActive && (
                    <div style={{
                      width: "12px", height: "12px", borderRadius: "3px",
                      border: "2px solid #e94560",
                      animation: "spin-square 1s linear infinite",
                    }} />
                  )}
                  {isPending && (
                    <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#1e2030" }} />
                  )}
                </div>

                {/* Text */}
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: "12px", fontWeight: 700, letterSpacing: "2px",
                    color: isDone ? "#22c55e" : isActive ? "#e94560" : "#1e2030",
                  }}>
                    {step.text}
                  </div>
                  <div style={{
                    fontSize: "10px", color: isDone ? "#1a4d2e" : isActive ? "rgba(233,69,96,0.45)" : "#1e2030",
                    marginTop: "1px",
                  }}>
                    {step.sub}
                  </div>
                </div>

                {/* Status text */}
                <span style={{
                  fontSize: "9px", fontWeight: 700, letterSpacing: "1px",
                  color: isDone ? "#22c55e" : isActive ? "#e94560" : "#1e2030",
                }}>
                  {isDone ? "DONE" : isActive ? "ACTIVE" : "QUEUED"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Currently scanning dimension */}
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          fontSize: "10px", color: "#3e4554",
        }}>
          <div style={{
            width: "4px", height: "4px", borderRadius: "50%",
            background: "#e94560", animation: "alert-flash 0.4s ease-in-out infinite",
          }} />
          <span style={{ letterSpacing: "1px" }}>
            Scanning: <span style={{ color: "#e94560", fontWeight: 700 }}>{SCAN_DIMENSIONS[activeDim]}</span>
          </span>
        </div>
      </div>

      {/* ── BOTTOM: Live log feed ── */}
      <div style={{
        padding: "12px 28px 20px", borderTop: "1px solid rgba(255,255,255,0.02)",
        position: "relative", zIndex: 10,
      }}>
        <div style={{ fontSize: "9px", color: "#1e2030", letterSpacing: "2px", marginBottom: "6px", fontWeight: 700 }}>
          SYSTEM LOG
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {logLines.map((line, i) => (
            <div key={i} style={{
              fontSize: "10px", color: i === logLines.length - 1 ? "#525c6c" : "#1e2030",
              opacity: i === logLines.length - 1 ? 1 : 0.5 + (i / logLines.length) * 0.5,
              transition: "all 0.3s",
            }}>
              <span style={{ color: "#1e2030", marginRight: "8px" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              {line}
              {i === logLines.length - 1 && (
                <span style={{ animation: "blink 0.5s step-end infinite", color: "#e94560" }}>_</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes alert-flash { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
        @keyframes scan-v { 0% { top: 0; } 100% { top: 100%; } }
        @keyframes spin-square { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes bar-race { from { left: -60px; } to { left: 100%; } }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   GLITCH SCORE COUNTER
   ═══════════════════════════════════════════════════════ */

function GlitchScore({ score, size = 72, delay = 0 }: { score: number; size?: number; delay?: number }) {
  const [phase, setPhase] = useState<"wait" | "glitch" | "count" | "done">("wait");
  const [display, setDisplay] = useState("00");
  const [glitchOffset, setGlitchOffset] = useState({ x: 0, y: 0 });
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("glitch"), delay);
    const t2 = setTimeout(() => setPhase("count"), delay + 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [delay, score]);

  // Glitch phase — random numbers
  useEffect(() => {
    if (phase !== "glitch") return;
    const interval = setInterval(() => {
      setDisplay(String(Math.floor(Math.random() * 100)).padStart(2, "0"));
      setGlitchOffset({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 4 });
    }, 50);
    return () => clearInterval(interval);
  }, [phase]);

  // Count phase — animate to real score
  useEffect(() => {
    if (phase !== "count") return;
    setGlitchOffset({ x: 0, y: 0 });
    const start = performance.now();
    const dur = 1800;
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      const v = Math.round(score * eased);
      setDisplay(String(v));
      if (p < 1) requestAnimationFrame(tick);
      else setPhase("done");
    };
    requestAnimationFrame(tick);
  }, [phase, score]);

  return (
    <div style={{
      position: "relative",
      fontSize: `${size}px`, fontWeight: 900, fontFamily: "'Courier New', monospace",
      color: phase === "wait" ? "#1a1a2e" : color,
      textShadow: phase === "glitch"
        ? `0 0 20px ${color}, 3px 0 0 rgba(233,69,96,0.5), -3px 0 0 rgba(34,197,94,0.3)`
        : phase === "done" ? `0 0 40px ${color}60, 0 0 80px ${color}20` : `0 0 20px ${color}60`,
      letterSpacing: "-0.02em",
      transform: `translate(${glitchOffset.x}px, ${glitchOffset.y}px)`,
      transition: phase === "done" ? "all 0.5s" : "none",
      lineHeight: 1,
    }}>
      {display}
      {phase === "glitch" && (
        <div style={{
          position: "absolute", inset: 0, overflow: "hidden", opacity: 0.3,
          clipPath: `inset(${Math.random() * 40}% 0 ${Math.random() * 40}% 0)`,
          color: "#e94560",
        }}>
          {display}
        </div>
      )}
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

  useEffect(() => {
    const t1 = setTimeout(() => setShow(true), delay);
    const t2 = setTimeout(() => {
      const start = performance.now();
      const dur = 2000;
      const tick = (now: number) => {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 4);
        setAnimated(Math.round(score * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay + 800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [score, delay]);

  return (
    <div style={{
      position: "relative", width: size, height: size,
      opacity: show ? 1 : 0, transform: show ? "scale(1)" : "scale(0.5)",
      transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1)",
    }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", filter: `drop-shadow(0 0 20px ${color}40)` }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="14" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth="14"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke 0.5s" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <GlitchScore score={score} size={size * 0.28} delay={delay + 400} />
        <span style={{ fontSize: size * 0.065, color: "#3e4554", fontWeight: 600, letterSpacing: "0.15em", marginTop: "6px", fontFamily: "'Courier New', monospace" }}>
          SCORE
        </span>
      </div>
    </div>
  );
}

/* ─── Dimension Bar ─── */
function DimensionBar({ label, score, delay = 0 }: { label: string; score: number; delay?: number }) {
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
      opacity: show ? 1 : 0, transform: show ? "translateX(0)" : "translateX(-10px)",
      transition: "opacity 0.4s, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
    }}>
      <div style={{ width: "100px", fontSize: "11px", color: "#64748b", fontWeight: 500, textAlign: "right", flexShrink: 0 }}>
        {label}
      </div>
      <div style={{ flex: 1, height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${width}%`, borderRadius: "3px",
          background: `linear-gradient(90deg, ${color}80, ${color})`,
          transition: "width 1.8s cubic-bezier(0.16, 1, 0.3, 1)",
          boxShadow: `0 0 10px ${color}30`,
        }} />
      </div>
      <span style={{ width: "28px", fontSize: "12px", fontWeight: 700, color, fontFamily: "'Courier New', monospace", textAlign: "right" }}>{score}</span>
    </div>
  );
}

/* ─── Severity Badge ─── */
function SeverityBadge({ score }: { score: number }) {
  const severity = score >= 75 ? "OPTIMAL" : score >= 50 ? "SUBOPTIMAL" : "CRITICAL";
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "6px",
      fontSize: "10px", fontWeight: 700, letterSpacing: "0.15em",
      color, padding: "4px 12px", borderRadius: "4px",
      background: `${color}08`, border: `1px solid ${color}18`,
      fontFamily: "'Courier New', monospace",
      animation: score < 50 ? "threat-pulse 2s ease-in-out infinite" : "none",
    }}>
      {score < 50 && <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` }} />}
      {severity}
    </span>
  );
}

/* ─── Star Rating ─── */
function Stars({ rating }: { rating: number }) {
  return (
    <div style={{ display: "flex", gap: "1px" }}>
      {[1, 2, 3, 4, 5].map(s => (
        <svg key={s} width="13" height="13" viewBox="0 0 24 24" fill={s <= Math.round(rating) ? "#f59e0b" : "none"} stroke="#f59e0b" strokeWidth="2">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

/* ─── Product Hero ─── */
function ProductHero({ product, score }: { product: ProductData; score: number }) {
  const [show, setShow] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const isCritical = score < 50;

  useEffect(() => { setTimeout(() => setShow(true), 200); }, []);

  return (
    <div style={{
      borderRadius: "12px", overflow: "hidden", position: "relative",
      background: "rgba(13, 13, 32, 0.95)",
      opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(20px)",
      transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
    }}>
      {/* Animated gradient border */}
      <div style={{
        position: "absolute", inset: "-1px", borderRadius: "13px", zIndex: 0,
        background: isCritical
          ? "conic-gradient(from var(--angle, 0deg), #ef444440, transparent, #ef444440, transparent, #ef444440)"
          : "conic-gradient(from var(--angle, 0deg), #e9456020, transparent, #e9456020, transparent)",
        animation: "rotate-border 4s linear infinite",
      }} />

      <div style={{ position: "relative", zIndex: 1, background: "rgba(13, 13, 32, 0.98)", borderRadius: "11px", margin: "1px" }}>
        <div style={{ display: "flex" }}>
          {/* Image */}
          <div style={{
            width: "240px", minHeight: "240px", flexShrink: 0,
            background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative",
          }}>
            {product.images?.length > 0 ? (
              <>
                <img src={product.images[imgIdx] || product.images[0]} alt="" style={{
                  maxWidth: "100%", maxHeight: "220px", objectFit: "contain", padding: "12px",
                }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                {product.images.length > 1 && (
                  <div style={{ position: "absolute", bottom: "6px", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "3px" }}>
                    {product.images.slice(0, 7).map((_, i) => (
                      <button key={i} onClick={() => setImgIdx(i)} style={{
                        width: "5px", height: "5px", borderRadius: "50%", border: "none", padding: 0,
                        background: i === imgIdx ? "#e94560" : "#ccc", cursor: "pointer",
                      }} />
                    ))}
                  </div>
                )}
                {/* Scan line effect on image */}
                <div style={{
                  position: "absolute", left: 0, right: 0, height: "2px",
                  background: "linear-gradient(90deg, transparent, rgba(233,69,96,0.3), transparent)",
                  animation: "img-scan 2.5s ease-in-out infinite",
                }} />
              </>
            ) : (
              <span style={{ color: "#94a3b8", fontSize: "12px" }}>No image</span>
            )}
          </div>

          {/* Info */}
          <div style={{ flex: 1, padding: "22px 24px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              {product.asin && (
                <span style={{ fontSize: "9px", fontWeight: 700, color: "#3e4554", padding: "2px 8px", borderRadius: "3px", border: "1px solid rgba(255,255,255,0.06)", fontFamily: "'Courier New', monospace", letterSpacing: "0.08em" }}>
                  {product.asin}
                </span>
              )}
              {product.fulfillment?.toLowerCase().includes("fba") && (
                <span style={{ fontSize: "9px", fontWeight: 700, color: "#22c55e", padding: "2px 8px", borderRadius: "3px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.12)" }}>
                  PRIME
                </span>
              )}
              {!product.in_stock && (
                <span style={{ fontSize: "9px", fontWeight: 700, color: "#ef4444", padding: "2px 8px", borderRadius: "3px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)" }}>
                  OUT OF STOCK
                </span>
              )}
            </div>

            <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#e2e8f0", lineHeight: 1.5, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {product.title}
            </h2>

            {product.brand && (
              <span style={{ fontSize: "11px", color: "#525c6c" }}>
                by <span style={{ color: "#8892a4" }}>{product.brand}</span>
              </span>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {product.rating != null && product.rating > 0 && (
                <>
                  <Stars rating={product.rating} />
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#f59e0b" }}>{product.rating}</span>
                </>
              )}
              {product.review_count > 0 && (
                <span style={{ fontSize: "11px", color: "#3e4554" }}>({product.review_count.toLocaleString()})</span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              {product.price != null && (
                <span style={{ fontSize: "22px", fontWeight: 800, color: "#f1f5f9" }}>
                  {product.currency || "$"}{typeof product.price === "number" ? product.price.toFixed(2) : product.price}
                </span>
              )}
              {product.original_price && product.original_price > (product.price || 0) && (
                <span style={{ fontSize: "13px", color: "#3e4554", textDecoration: "line-through" }}>
                  {product.currency || "$"}{product.original_price.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Category Card ─── */
function CategoryCard({ category, issues, delay = 0 }: { category: string; issues: CategoryIssue[]; delay?: number }) {
  const [expanded, setExpanded] = useState(false);
  const [show, setShow] = useState(false);
  const label = CATEGORY_LABELS[category] || category;
  const highCount = issues.filter(i => i.impact === "high").length;

  useEffect(() => { setTimeout(() => setShow(true), delay); }, [delay]);

  if (!issues?.length) return null;

  return (
    <div style={{
      borderRadius: "10px", overflow: "hidden",
      background: "rgba(13, 13, 32, 0.9)",
      border: `1px solid ${highCount > 0 ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)"}`,
      opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(10px)",
      transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
    }}>
      <button onClick={() => setExpanded(!expanded)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: "14px",
        padding: "14px 18px", border: "none", background: "none", cursor: "pointer", textAlign: "left",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0" }}>{label}</span>
            {highCount > 0 && (
              <span style={{ fontSize: "9px", fontWeight: 700, color: "#ef4444", padding: "2px 6px", borderRadius: "3px", background: "rgba(239,68,68,0.08)", letterSpacing: "0.06em" }}>
                {highCount} HIGH
              </span>
            )}
          </div>
          <span style={{ fontSize: "11px", color: "#3e4554", marginTop: "2px", display: "block" }}>
            {issues.length} issue{issues.length !== 1 ? "s" : ""} detected
          </span>
        </div>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", color: "#3e4554" }}>
          <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div style={{ padding: "0 18px 14px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {issues.map((issue, i) => (
            <div key={i} style={{ padding: "12px 14px", borderRadius: "8px", background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.03)" }}>
              <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <span style={{
                    fontSize: "9px", fontWeight: 700, textTransform: "uppercase",
                    color: IMPACT_COLORS[issue.impact] || "#8892a4",
                    padding: "1px 6px", borderRadius: "2px",
                    background: `${IMPACT_COLORS[issue.impact] || "#8892a4"}08`,
                    letterSpacing: "0.08em",
                  }}>
                    {issue.impact}
                  </span>
                  <p style={{ color: "#e2e8f0", fontSize: "12px", fontWeight: 500, margin: "6px 0 2px", lineHeight: 1.5 }}>{issue.issue}</p>
                  {issue.detail && issue.detail !== issue.issue && (
                    <p style={{ color: "#3e4554", fontSize: "11px", margin: 0, lineHeight: 1.5 }}>{issue.detail}</p>
                  )}
                </div>
                <button style={{
                  padding: "6px 12px", borderRadius: "6px", border: "none",
                  background: "linear-gradient(135deg, #e94560, #c13550)",
                  color: "#fff", fontSize: "10px", fontWeight: 700, cursor: "pointer",
                  whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(233, 69, 96, 0.2)",
                }}>{issue.fix_action} <span style={{ opacity: 0.7 }}>({issue.fix_cost})</span></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Copy Block ─── */
function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, color: "#3e4554", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
        <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{
          fontSize: "10px", color: copied ? "#22c55e" : "#3e4554", background: "none",
          border: "1px solid rgba(255,255,255,0.04)", borderRadius: "4px", padding: "2px 8px", cursor: "pointer",
        }}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <div style={{ padding: "10px 12px", borderRadius: "6px", background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.03)", color: "#c8d0dc", fontSize: "12px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
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
  const [showResults, setShowResults] = useState(false);

  const handleAudit = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setAudit(null);
    setShowResults(false);
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
        if (updated.status === "completed") {
          setTimeout(() => setShowResults(true), 500);
        }
      }
    } catch { /* retry */ }
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
    ? Object.values(audit.category_issues).reduce((sum, arr) => sum + (arr?.length || 0), 0) : 0;
  const totalFixCost = audit?.category_issues
    ? Object.values(audit.category_issues).reduce(
        (sum, arr) => sum + (arr || []).reduce((s: number, i: CategoryIssue) => s + (i.fix_cost || 0), 0), 0) : 0;

  const dimEntries = Object.entries(audit?.dimension_scores || {}).filter(([_, v]) => typeof v === "number");

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* Background */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "#08081a" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: "radial-gradient(rgba(255,255,255,0.015) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

      {/* ═══ FULL-SCREEN HUD PROCESSING ═══ */}
      {isProcessing && audit && <HUDOverlay status={audit.status} />}

      {/* Nav (hidden during processing) */}
      {!isProcessing && (
        <nav style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "0 32px", height: "52px",
          background: "rgba(8, 8, 26, 0.95)", backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.03)",
        }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
            <div style={{
              width: "26px", height: "26px", borderRadius: "6px",
              background: "linear-gradient(135deg, #e94560, #891527)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 12px rgba(233, 69, 96, 0.3)",
            }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M3 11V8.5C3 8.22 3.22 8 3.5 8H5.5C5.78 8 6 8.22 6 8.5V11C6 11.28 5.78 11.5 5.5 11.5H3.5C3.22 11.5 3 11.28 3 11Z" fill="rgba(255,255,255,0.4)"/>
                <path d="M6.5 11V6C6.5 5.72 6.72 5.5 7 5.5H9C9.28 5.5 9.5 5.72 9.5 6V11C9.5 11.28 9.28 11.5 9 11.5H7C6.72 11.5 6.5 11.28 6.5 11Z" fill="rgba(255,255,255,0.65)"/>
                <path d="M10 11V4C10 3.72 10.22 3.5 10.5 3.5H12.5C12.78 3.5 13 3.72 13 4V11C13 11.28 12.78 11.5 12.5 11.5H10.5C10.22 11.5 10 11.28 10 11Z" fill="white"/>
              </svg>
            </div>
            <span style={{ fontSize: "15px", fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.5px" }}>Kansa</span>
          </Link>
        </nav>
      )}

      {/* Main Content */}
      {!isProcessing && (
        <main style={{ position: "relative", zIndex: 1, paddingTop: "100px", paddingBottom: "60px", paddingLeft: "20px", paddingRight: "20px" }}>
          <div style={{ width: "100%", maxWidth: "880px", margin: "0 auto" }}>

            {/* Header (only before results) */}
            {!isComplete && !isFailed && (
              <>
                <div style={{ textAlign: "center", marginBottom: "32px" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 14px 3px 8px", borderRadius: "999px", background: "rgba(233, 69, 96, 0.04)", border: "1px solid rgba(233, 69, 96, 0.08)", marginBottom: "14px" }}>
                    <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#e94560", boxShadow: "0 0 6px rgba(233,69,96,0.6)" }} />
                    <span style={{ fontSize: "10px", fontWeight: 700, color: "#e94560", letterSpacing: "0.1em", fontFamily: "'Courier New', monospace" }}>LISTING INTELLIGENCE</span>
                  </div>
                  <h1 style={{ fontSize: "30px", fontWeight: 800, color: "#f1f5f9", marginBottom: "8px", letterSpacing: "-0.03em" }}>
                    AI-Powered Audit
                  </h1>
                  <p style={{ color: "#3e4554", fontSize: "13px", lineHeight: 1.6, maxWidth: "400px", margin: "0 auto" }}>
                    10-dimension deep scan. Every fixable issue found, scored, and priced.
                  </p>
                </div>

                {/* Input */}
                <div style={{
                  display: "flex", gap: 0, marginBottom: "8px", borderRadius: "10px", overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.05)", background: "rgba(13, 13, 32, 0.9)",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
                }}>
                  <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://amazon.com/dp/B0..."
                    disabled={loading}
                    onKeyDown={(e) => e.key === "Enter" && handleAudit()}
                    style={{ flex: 1, fontSize: "13px", padding: "13px 18px", background: "transparent", border: "none", outline: "none", color: "#f1f5f9", fontFamily: "inherit" }} />
                  <button onClick={handleAudit} disabled={loading || !url.trim()} style={{
                    padding: "13px 24px", border: "none",
                    cursor: loading || !url.trim() ? "default" : "pointer",
                    background: loading || !url.trim() ? "#1a1a2e" : "linear-gradient(135deg, #e94560, #c13550)",
                    color: loading || !url.trim() ? "#3e4554" : "#fff",
                    fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap",
                    borderLeft: "1px solid rgba(255,255,255,0.04)", letterSpacing: "0.06em",
                  }}>
                    {loading ? "SCANNING..." : "SCAN FREE"}
                  </button>
                </div>

                <div style={{ display: "flex", justifyContent: "center", gap: "3px", flexWrap: "wrap", marginBottom: "32px" }}>
                  {[".com", ".com.mx", ".co.uk", ".de", ".fr", ".es", ".it", ".co.jp", ".com.br", ".in", ".ca", ".com.au"].map(d => (
                    <span key={d} style={{ fontSize: "9px", color: "#1e2030", padding: "2px 5px", border: "1px solid rgba(255,255,255,0.02)", borderRadius: "3px", fontFamily: "'Courier New', monospace" }}>
                      amazon{d}
                    </span>
                  ))}
                </div>
              </>
            )}

            {/* Error */}
            {error && (
              <div style={{ padding: "14px 18px", borderRadius: "10px", background: "rgba(239, 68, 68, 0.04)", border: "1px solid rgba(239, 68, 68, 0.1)", color: "#fca5a5", marginBottom: "16px", fontSize: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                {error}
              </div>
            )}

            {/* Failed */}
            {isFailed && audit && (
              <div style={{ padding: "40px", borderRadius: "14px", textAlign: "center", background: "rgba(239, 68, 68, 0.03)", border: "1px solid rgba(239, 68, 68, 0.08)" }}>
                <div style={{ fontSize: "14px", color: "#ef4444", fontWeight: 700, letterSpacing: "0.15em", fontFamily: "'Courier New', monospace", marginBottom: "8px" }}>SCAN FAILED</div>
                <p style={{ color: "#3e4554", fontSize: "12px" }}>{audit.error_message || "Unknown error"}</p>
                <button onClick={() => { setAudit(null); setLoading(false); setError(null); setShowResults(false); }}
                  style={{ marginTop: "16px", padding: "8px 20px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.05)", background: "none", color: "#64748b", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                  Retry
                </button>
              </div>
            )}

            {/* ═══ RESULTS ═══ */}
            {isComplete && audit && audit.overall_score !== null && showResults && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", animation: "results-cascade 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}>

                {/* Product Hero */}
                {audit.product_data?.title && (
                  <ProductHero product={audit.product_data} score={audit.overall_score} />
                )}

                {/* Score Card */}
                <div style={{
                  padding: "28px", borderRadius: "12px", position: "relative", overflow: "hidden",
                  background: "rgba(13, 13, 32, 0.95)", border: "1px solid rgba(255,255,255,0.03)",
                }}>
                  {/* Radial glow */}
                  <div style={{
                    position: "absolute", top: "-20%", left: "10%", width: "200px", height: "200px", borderRadius: "50%",
                    background: `radial-gradient(circle, ${audit.overall_score < 50 ? "rgba(239,68,68,0.04)" : audit.overall_score < 75 ? "rgba(245,158,11,0.04)" : "rgba(34,197,94,0.04)"} 0%, transparent 70%)`,
                    pointerEvents: "none",
                  }} />

                  <div style={{ display: "flex", gap: "36px", position: "relative" }}>
                    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                      <ScoreRing score={audit.overall_score} delay={200} />
                      <SeverityBadge score={audit.overall_score} />
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "7px", justifyContent: "center" }}>
                      <div style={{ fontSize: "9px", fontWeight: 700, color: "#3e4554", letterSpacing: "0.15em", marginBottom: "2px", fontFamily: "'Courier New', monospace" }}>
                        DIMENSION ANALYSIS
                      </div>
                      {dimEntries.map(([key, value], i) => (
                        <DimensionBar key={key} label={DIM_LABELS[key] || key} score={value as number} delay={500 + i * 80} />
                      ))}
                    </div>
                  </div>

                  {/* Critical alert */}
                  {audit.overall_score < 50 && (
                    <div style={{
                      marginTop: "20px", padding: "12px 18px", borderRadius: "8px",
                      background: "rgba(239, 68, 68, 0.04)", border: "1px solid rgba(239, 68, 68, 0.1)",
                      display: "flex", alignItems: "center", gap: "10px",
                      animation: "fade-in-up 0.5s ease-out 2s both",
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#fca5a5", letterSpacing: "0.05em" }}>THREAT LEVEL: CRITICAL</div>
                        <div style={{ fontSize: "11px", color: "#525c6c", marginTop: "1px" }}>This listing is actively losing sales. Immediate action required.</div>
                      </div>
                    </div>
                  )}

                  {/* Fix all */}
                  {totalIssues > 0 && (
                    <div style={{
                      marginTop: audit.overall_score < 50 ? "8px" : "20px",
                      padding: "10px 18px", borderRadius: "8px",
                      background: "rgba(233, 69, 96, 0.03)", border: "1px solid rgba(233, 69, 96, 0.06)",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      animation: "fade-in-up 0.5s ease-out 2.2s both",
                    }}>
                      <span style={{ fontSize: "12px", color: "#8892a4" }}>
                        <span style={{ fontWeight: 700, color: "#f1f5f9" }}>{totalIssues}</span> fixable issues across{" "}
                        {Object.keys(audit.category_issues).filter(k => (audit.category_issues[k]?.length || 0) > 0).length} categories
                      </span>
                      <button style={{
                        padding: "8px 16px", borderRadius: "6px", border: "none",
                        background: "linear-gradient(135deg, #e94560, #c13550)", color: "#fff",
                        fontSize: "11px", fontWeight: 700, cursor: "pointer",
                        boxShadow: "0 2px 10px rgba(233, 69, 96, 0.25)",
                      }}>
                        FIX ALL <span style={{ opacity: 0.7 }}>({totalFixCost} tokens)</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Category Issues */}
                {totalIssues > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ fontSize: "9px", fontWeight: 700, color: "#3e4554", letterSpacing: "0.15em", padding: "6px 0", fontFamily: "'Courier New', monospace" }}>
                      DETECTED ISSUES
                    </div>
                    {Object.entries(audit.category_issues)
                      .filter(([_, issues]) => issues?.length > 0)
                      .sort(([, a], [, b]) => {
                        const ha = (a || []).filter((i: CategoryIssue) => i.impact === "high").length;
                        const hb = (b || []).filter((i: CategoryIssue) => i.impact === "high").length;
                        return hb - ha;
                      })
                      .map(([cat, issues], i) => (
                        <CategoryCard key={cat} category={cat} issues={issues || []} delay={100 + i * 60} />
                      ))}
                  </div>
                )}

                {/* Strengths / Weaknesses */}
                {(audit.strengths?.length > 0 || audit.weaknesses?.length > 0) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    {audit.strengths?.length > 0 && (
                      <div style={{ padding: "18px", borderRadius: "10px", background: "rgba(13, 13, 32, 0.9)", border: "1px solid rgba(255,255,255,0.03)" }}>
                        <div style={{ fontSize: "9px", fontWeight: 700, color: "#22c55e", letterSpacing: "0.12em", marginBottom: "12px", fontFamily: "'Courier New', monospace" }}>STRENGTHS</div>
                        {audit.strengths.map((s, i) => (
                          <div key={i} style={{ display: "flex", gap: "8px", padding: "4px 0", borderBottom: i < audit.strengths.length - 1 ? "1px solid rgba(255,255,255,0.02)" : "none" }}>
                            <span style={{ color: "#22c55e", fontSize: "10px", marginTop: "3px", fontWeight: 700 }}>+</span>
                            <span style={{ color: "#64748b", fontSize: "11px", lineHeight: 1.5 }}>{s}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {audit.weaknesses?.length > 0 && (
                      <div style={{ padding: "18px", borderRadius: "10px", background: "rgba(13, 13, 32, 0.9)", border: "1px solid rgba(255,255,255,0.03)" }}>
                        <div style={{ fontSize: "9px", fontWeight: 700, color: "#ef4444", letterSpacing: "0.12em", marginBottom: "12px", fontFamily: "'Courier New', monospace" }}>WEAKNESSES</div>
                        {audit.weaknesses.map((w, i) => (
                          <div key={i} style={{ display: "flex", gap: "8px", padding: "4px 0", borderBottom: i < audit.weaknesses.length - 1 ? "1px solid rgba(255,255,255,0.02)" : "none" }}>
                            <span style={{ color: "#ef4444", fontSize: "10px", marginTop: "3px", fontWeight: 700 }}>-</span>
                            <span style={{ color: "#64748b", fontSize: "11px", lineHeight: 1.5 }}>{w}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* AI Copy */}
                {audit.generated_copy && (audit.generated_copy.title || audit.generated_copy.bullets) && (
                  <div style={{ padding: "18px", borderRadius: "10px", background: "rgba(13, 13, 32, 0.9)", border: "1px solid rgba(255,255,255,0.03)" }}>
                    <div style={{ fontSize: "9px", fontWeight: 700, color: "#e94560", letterSpacing: "0.12em", marginBottom: "14px", fontFamily: "'Courier New', monospace" }}>AI-GENERATED COPY</div>
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
                  <div style={{ padding: "18px", borderRadius: "10px", background: "rgba(13, 13, 32, 0.9)", border: "1px solid rgba(255,255,255,0.03)" }}>
                    <div style={{ fontSize: "9px", fontWeight: 700, color: "#f59e0b", letterSpacing: "0.12em", marginBottom: "10px", fontFamily: "'Courier New', monospace" }}>COMPETITIVE INTELLIGENCE</div>
                    <p style={{ color: "#8892a4", fontSize: "12px", lineHeight: 1.7, margin: 0 }}>{audit.competitive_data.competitive_summary}</p>
                  </div>
                )}

                {/* Audit again */}
                <div style={{ textAlign: "center", paddingTop: "4px" }}>
                  <button onClick={() => { setAudit(null); setUrl(""); setLoading(false); setShowResults(false); }}
                    style={{ padding: "8px 20px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.04)", background: "none", color: "#3e4554", fontSize: "11px", fontWeight: 600, cursor: "pointer", letterSpacing: "0.06em" }}>
                    SCAN ANOTHER
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      )}

      <style>{`
        @keyframes threat-pulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
        @keyframes fade-in-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes results-cascade { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes rotate-border { from { --angle: 0deg; } to { --angle: 360deg; } }
        @keyframes img-scan { 0% { top: 0; } 50% { top: 100%; } 100% { top: 0; } }
        @property --angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
      `}</style>
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#08081a" }}>
        <p style={{ color: "#3e4554", fontFamily: "'Courier New', monospace", fontSize: "12px", letterSpacing: "3px" }}>INITIALIZING...</p>
      </div>
    }>
      <AuditPageInner />
    </Suspense>
  );
}
