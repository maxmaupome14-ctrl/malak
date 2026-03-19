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
  images: number;
  pricing: number;
  reviews: number;
  seo: number;
  content: number;
}

interface Recommendation {
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  category: string;
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
  generated_copy: Record<string, any>;
  competitive_data: Record<string, any>;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

const STEPS: { key: AuditStatus; label: string; sub: string }[] = [
  { key: "scraping", label: "Scraping", sub: "Extracting product data from Amazon" },
  { key: "analyzing", label: "Analyzing", sub: "AI scoring across 6 dimensions" },
  { key: "generating", label: "Generating", sub: "Building fixes & competitive intel" },
];

const IMPACT_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

const CATEGORY_META: Record<string, { label: string; icon: JSX.Element }> = {
  title: {
    label: "Title",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>,
  },
  bullets: {
    label: "Bullet Points",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>,
  },
  description: {
    label: "Description",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  },
  images: {
    label: "Images",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  },
  keywords: {
    label: "Keywords & SEO",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  },
  competitive: {
    label: "Competitive Position",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  },
};

const DIM_MAP: Record<string, string> = {
  title: "title", bullets: "content", description: "content",
  images: "images", keywords: "seo", competitive: "pricing",
};

/* ─── Animated Score Ring ─── */
function ScoreRing({ score, size = 160, delay = 0 }: { score: number; size?: number; delay?: number }) {
  const [animated, setAnimated] = useState(0);
  const [show, setShow] = useState(false);
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animated / 100) * circumference;
  const color = animated >= 75 ? "#22c55e" : animated >= 50 ? "#f59e0b" : "#ef4444";
  const glowColor = animated >= 75 ? "rgba(34,197,94,0.3)" : animated >= 50 ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)";

  useEffect(() => {
    const t1 = setTimeout(() => setShow(true), delay);
    const t2 = setTimeout(() => {
      const start = performance.now();
      const duration = 1800;
      const animate = (now: number) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 4);
        setAnimated(Math.round(score * eased));
        if (p < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }, delay + 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [score, delay]);

  return (
    <div style={{
      position: "relative", width: size, height: size,
      opacity: show ? 1 : 0, transform: show ? "scale(1)" : "scale(0.8)",
      transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
      filter: show ? `drop-shadow(0 0 20px ${glowColor})` : "none",
    }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="12" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth="12"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke 0.3s" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: size * 0.3, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.03em" }}>
          {animated}
        </span>
        <span style={{ fontSize: size * 0.09, color: "#525c6c", fontWeight: 600, letterSpacing: "0.05em" }}>
          OUT OF 100
        </span>
      </div>
    </div>
  );
}

/* ─── Dimension Bar ─── */
function DimensionBar({ label, score, delay = 0 }: { label: string; score: number; delay?: number }) {
  const [width, setWidth] = useState(0);
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

  useEffect(() => {
    const t = setTimeout(() => setWidth(score), delay);
    return () => clearTimeout(t);
  }, [score, delay]);

  return (
    <div style={{ marginBottom: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        <span style={{ fontSize: "13px", color: "#8892a4", textTransform: "capitalize", fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: "13px", fontWeight: 700, color, fontFamily: "monospace" }}>{score}</span>
      </div>
      <div style={{ height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${width}%`, borderRadius: "3px", background: color,
          transition: "width 1.4s cubic-bezier(0.16, 1, 0.3, 1)",
          boxShadow: `0 0 8px ${color}40`,
        }} />
      </div>
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
      fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em",
      color, padding: "4px 10px", borderRadius: "6px",
      background: `${color}12`, border: `1px solid ${color}25`,
      animation: isCritical ? "pulse-badge 2s ease-in-out infinite" : "none",
    }}>
      {isCritical && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />}
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
        padding: "8px 14px", borderRadius: "8px", border: "none",
        background: "#e94560", color: "#fff", fontSize: "12px", fontWeight: 600,
        cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s",
        boxShadow: "0 1px 2px rgba(0,0,0,0.3), 0 0 12px rgba(233, 69, 96, 0.15)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3), 0 0 20px rgba(233, 69, 96, 0.25)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.3), 0 0 12px rgba(233, 69, 96, 0.15)"; }}
    >
      {action}
      <span style={{
        background: "rgba(255,255,255,0.2)", borderRadius: "4px",
        padding: "2px 6px", fontSize: "10px", fontWeight: 700,
      }}>
        {cost}
      </span>
    </button>
  );
}

/* ─── Category Card ─── */
function CategoryCard({ category, issues, score, delay = 0 }: {
  category: string; issues: CategoryIssue[]; score: number; delay?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const [show, setShow] = useState(false);
  const meta = CATEGORY_META[category] || { label: category, icon: null };
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  if (!issues || issues.length === 0) return null;

  return (
    <div style={{
      borderRadius: "12px",
      background: "rgba(13, 13, 32, 0.8)",
      border: `1px solid ${score < 50 ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)'}`,
      overflow: "hidden",
      opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(16px)",
      transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "14px",
          padding: "18px 20px", border: "none", background: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ color, opacity: 0.8, flexShrink: 0 }}>{meta.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "15px", fontWeight: 600, color: "#f1f5f9" }}>{meta.label}</span>
            <SeverityBadge score={score} />
          </div>
          <span style={{ fontSize: "12px", color: "#525c6c", marginTop: "2px", display: "block" }}>
            {issues.length} issue{issues.length !== 1 ? "s" : ""} found
          </span>
        </div>
        <span style={{ fontSize: "13px", fontWeight: 700, color, fontFamily: "monospace" }}>{score}</span>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", color: "#525c6c", flexShrink: 0 }}>
          <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {issues.map((issue, i) => (
            <div key={i} style={{
              padding: "14px 16px", borderRadius: "10px",
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
            }}>
              <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: "14px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: "6px" }}>
                    <span style={{
                      fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
                      color: IMPACT_COLORS[issue.impact] || "#8892a4",
                      padding: "2px 6px", borderRadius: "3px",
                      background: `${IMPACT_COLORS[issue.impact] || "#8892a4"}12`,
                      letterSpacing: "0.06em",
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

/* ─── Processing Animation ─── */
function ProcessingView({ status }: { status: AuditStatus }) {
  const stepIndex = STEPS.findIndex(s => s.key === status);
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? "" : d + ".");
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      padding: "60px 32px", borderRadius: "16px",
      background: "rgba(13, 13, 32, 0.8)", border: "1px solid rgba(255,255,255,0.04)",
      position: "relative", overflow: "hidden",
    }}>
      {/* Animated background glow */}
      <div style={{
        position: "absolute", top: "-50%", left: "50%", transform: "translateX(-50%)",
        width: "300px", height: "300px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(233, 69, 96, 0.08) 0%, transparent 70%)",
        animation: "breathe 3s ease-in-out infinite",
      }} />

      {/* Spinning rings */}
      <div style={{ position: "relative", width: "120px", height: "120px", margin: "0 auto 40px" }}>
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          border: "2px solid rgba(233, 69, 96, 0.1)",
        }} />
        <div style={{
          position: "absolute", inset: "8px", borderRadius: "50%",
          border: "2px solid rgba(233, 69, 96, 0.06)",
        }} />
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          border: "2px solid transparent", borderTopColor: "#e94560",
          animation: "spin 1.5s linear infinite",
        }} />
        <div style={{
          position: "absolute", inset: "8px", borderRadius: "50%",
          border: "2px solid transparent", borderTopColor: "rgba(233, 69, 96, 0.5)",
          borderRightColor: "rgba(233, 69, 96, 0.3)",
          animation: "spin-reverse 2s linear infinite",
        }} />
        <div style={{
          position: "absolute", inset: "20px", borderRadius: "50%",
          border: "2px solid transparent", borderBottomColor: "rgba(233, 69, 96, 0.3)",
          animation: "spin 3s linear infinite",
        }} />
        {/* Center dot */}
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: "12px", height: "12px", borderRadius: "50%",
          background: "#e94560", boxShadow: "0 0 20px rgba(233, 69, 96, 0.5)",
          animation: "pulse-dot 1.5s ease-in-out infinite",
        }} />
      </div>

      {/* Steps */}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "320px", margin: "0 auto" }}>
        {STEPS.map((step, i) => {
          const isActive = step.key === status;
          const isDone = i < stepIndex;
          const isPending = i > stepIndex;

          return (
            <div key={step.key} style={{
              display: "flex", alignItems: "center", gap: "14px",
              opacity: isPending ? 0.3 : 1,
              transition: "opacity 0.4s",
            }}>
              {/* Step indicator */}
              <div style={{
                width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isDone ? "rgba(34, 197, 94, 0.15)" : isActive ? "rgba(233, 69, 96, 0.15)" : "rgba(255,255,255,0.03)",
                border: isDone ? "1px solid rgba(34, 197, 94, 0.3)" : isActive ? "1px solid rgba(233, 69, 96, 0.3)" : "1px solid rgba(255,255,255,0.06)",
                transition: "all 0.4s",
              }}>
                {isDone ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : isActive ? (
                  <div style={{
                    width: "8px", height: "8px", borderRadius: "50%",
                    background: "#e94560", boxShadow: "0 0 8px rgba(233, 69, 96, 0.6)",
                    animation: "pulse-dot 1s ease-in-out infinite",
                  }} />
                ) : (
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#525c6c" }} />
                )}
              </div>

              <div>
                <div style={{
                  fontSize: "14px", fontWeight: isActive ? 600 : 500,
                  color: isDone ? "#22c55e" : isActive ? "#f1f5f9" : "#525c6c",
                  transition: "color 0.3s",
                }}>
                  {step.label}{isActive ? dots : isDone ? " — done" : ""}
                </div>
                {isActive && (
                  <div style={{ fontSize: "12px", color: "#525c6c", marginTop: "2px" }}>
                    {step.sub}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scanning line effect */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "1px",
        background: "linear-gradient(90deg, transparent, rgba(233, 69, 96, 0.4), transparent)",
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
  const [resultsRevealed, setResultsRevealed] = useState(false);

  const handleAudit = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setAudit(null);
    setResultsRevealed(false);
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
          setTimeout(() => setResultsRevealed(true), 200);
        }
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

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      {/* Background */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(233, 69, 96, 0.06), transparent 70%)" }} />

      {/* Nav */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 40px", height: "64px",
        background: "rgba(8, 8, 26, 0.85)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "8px",
            background: "linear-gradient(135deg, #e94560, #891527)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 16px rgba(233, 69, 96, 0.25)" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 11V8.5C3 8.22 3.22 8 3.5 8H5.5C5.78 8 6 8.22 6 8.5V11C6 11.28 5.78 11.5 5.5 11.5H3.5C3.22 11.5 3 11.28 3 11Z" fill="rgba(255,255,255,0.4)"/>
              <path d="M6.5 11V6C6.5 5.72 6.72 5.5 7 5.5H9C9.28 5.5 9.5 5.72 9.5 6V11C9.5 11.28 9.28 11.5 9 11.5H7C6.72 11.5 6.5 11.28 6.5 11Z" fill="rgba(255,255,255,0.65)"/>
              <path d="M10 11V4C10 3.72 10.22 3.5 10.5 3.5H12.5C12.78 3.5 13 3.72 13 4V11C13 11.28 12.78 11.5 12.5 11.5H10.5C10.22 11.5 10 11.28 10 11Z" fill="white"/>
            </svg>
          </div>
          <span style={{ fontSize: "18px", fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.5px" }}>Kansa</span>
        </Link>
      </nav>

      {/* Content */}
      <main style={{ position: "relative", zIndex: 1, paddingTop: "120px", paddingBottom: "60px", paddingLeft: "20px", paddingRight: "20px" }}>
        <div style={{ width: "100%", maxWidth: "880px", margin: "0 auto" }}>

          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "5px 14px 5px 8px", borderRadius: "999px",
              background: "rgba(233, 69, 96, 0.06)", border: "1px solid rgba(233, 69, 96, 0.12)",
              marginBottom: "20px",
            }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#e94560", boxShadow: "0 0 6px rgba(233,69,96,0.6)" }} />
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#e94560", letterSpacing: "0.04em" }}>AMAZON OPTIMIZER</span>
            </div>
            <h1 style={{ fontSize: "36px", fontWeight: 800, color: "#f1f5f9", marginBottom: "12px", letterSpacing: "-0.03em" }}>
              Audit Your Listing
            </h1>
            <p style={{ color: "#64748b", fontSize: "15px", lineHeight: 1.6, maxWidth: "460px", margin: "0 auto" }}>
              Paste any Amazon product URL. AI analyzes 6 dimensions and finds every fixable issue.
            </p>
          </div>

          {/* Input */}
          <div style={{
            display: "flex", gap: 0, marginBottom: "12px", borderRadius: "12px", overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.06)", background: "rgba(13, 13, 32, 0.8)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
          }}>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://amazon.com/dp/B0..." disabled={loading}
              onKeyDown={(e) => e.key === "Enter" && handleAudit()}
              style={{ flex: 1, fontSize: "15px", padding: "16px 20px", background: "transparent",
                border: "none", outline: "none", color: "#f1f5f9", fontFamily: "inherit" }} />
            <button onClick={handleAudit} disabled={loading || !url.trim()}
              style={{
                padding: "16px 28px", border: "none", cursor: loading || !url.trim() ? "default" : "pointer",
                background: loading || !url.trim() ? "#1e293b" : "#e94560",
                color: loading || !url.trim() ? "#525c6c" : "#fff",
                fontSize: "14px", fontWeight: 700, transition: "all 0.15s", whiteSpace: "nowrap",
                borderLeft: "1px solid rgba(255,255,255,0.06)",
              }}>
              {loading ? "Auditing..." : "Audit Free"}
            </button>
          </div>

          {/* Marketplace badges */}
          <div style={{ display: "flex", justifyContent: "center", gap: "6px", flexWrap: "wrap", marginBottom: "40px" }}>
            {[".com", ".com.mx", ".co.uk", ".de", ".fr", ".es", ".it", ".co.jp", ".com.br", ".in", ".ca", ".com.au"].map((d) => (
              <span key={d} style={{
                fontSize: "11px", color: "#3e4554", padding: "3px 7px",
                border: "1px solid rgba(255,255,255,0.04)", borderRadius: "4px",
                fontFamily: "monospace",
              }}>
                amazon{d}
              </span>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: "16px 20px", borderRadius: "12px",
              background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.15)",
              color: "#fca5a5", marginBottom: "24px", fontSize: "14px",
            }}>
              {error}
            </div>
          )}

          {/* ═══ PROCESSING ═══ */}
          {isProcessing && audit && <ProcessingView status={audit.status} />}

          {/* ═══ FAILED ═══ */}
          {isFailed && audit && (
            <div style={{
              padding: "32px", borderRadius: "16px", textAlign: "center",
              background: "rgba(239, 68, 68, 0.04)", border: "1px solid rgba(239, 68, 68, 0.12)",
            }}>
              <div style={{ fontSize: "40px", marginBottom: "16px", filter: "grayscale(0)" }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto" }}>
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
              </div>
              <h2 style={{ color: "#fca5a5", fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>Audit Failed</h2>
              <p style={{ color: "#8892a4", fontSize: "14px" }}>{audit.error_message || "Unknown error"}</p>
              <button onClick={() => { setAudit(null); setLoading(false); setError(null); }}
                style={{ marginTop: "20px", padding: "10px 24px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)",
                  background: "none", color: "#8892a4", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                Try Again
              </button>
            </div>
          )}

          {/* ═══ RESULTS ═══ */}
          {isComplete && audit && audit.overall_score !== null && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

              {/* Score Hero */}
              <div style={{
                padding: "40px 32px", borderRadius: "16px",
                background: "rgba(13, 13, 32, 0.8)", border: "1px solid rgba(255,255,255,0.04)",
                position: "relative", overflow: "hidden",
              }}>
                {/* Glow based on score */}
                <div style={{
                  position: "absolute", top: "-40%", left: "50%", transform: "translateX(-50%)",
                  width: "400px", height: "300px", borderRadius: "50%",
                  background: audit.overall_score < 50
                    ? "radial-gradient(circle, rgba(239, 68, 68, 0.06) 0%, transparent 70%)"
                    : audit.overall_score < 75
                    ? "radial-gradient(circle, rgba(245, 158, 11, 0.06) 0%, transparent 70%)"
                    : "radial-gradient(circle, rgba(34, 197, 94, 0.06) 0%, transparent 70%)",
                  pointerEvents: "none",
                }} />

                <div style={{ display: "flex", alignItems: "center", gap: "48px", position: "relative" }}>
                  <ScoreRing score={audit.overall_score} delay={200} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
                      <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Listing Score</h2>
                      <SeverityBadge score={audit.overall_score} />
                    </div>
                    {Object.entries(audit.dimension_scores).map(([key, value], i) => (
                      <DimensionBar key={key} label={key} score={value} delay={600 + i * 150} />
                    ))}
                  </div>
                </div>

                {/* Critical banner */}
                {audit.overall_score < 50 && (
                  <div style={{
                    marginTop: "28px", padding: "14px 20px", borderRadius: "10px",
                    background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.15)",
                    display: "flex", alignItems: "center", gap: "12px",
                    animation: "fade-in-up 0.5s ease-out 1.5s both",
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "#fca5a5" }}>
                      Critical underperformance detected. This listing is losing sales.
                    </span>
                  </div>
                )}

                {/* Fix All banner */}
                {totalIssues > 0 && (
                  <div style={{
                    marginTop: audit.overall_score < 50 ? "12px" : "28px",
                    padding: "14px 20px", borderRadius: "10px",
                    background: "rgba(233, 69, 96, 0.06)", border: "1px solid rgba(233, 69, 96, 0.12)",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    animation: "fade-in-up 0.5s ease-out 1.8s both",
                  }}>
                    <div>
                      <span style={{ fontSize: "14px", fontWeight: 600, color: "#f1f5f9" }}>
                        {totalIssues} fixable issue{totalIssues !== 1 ? "s" : ""}
                      </span>
                      <span style={{ fontSize: "13px", color: "#525c6c", marginLeft: "8px" }}>
                        across {Object.keys(audit.category_issues).filter(k => (audit.category_issues[k]?.length || 0) > 0).length} categories
                      </span>
                    </div>
                    <button style={{
                      display: "inline-flex", alignItems: "center", gap: "8px",
                      padding: "10px 20px", borderRadius: "8px", border: "none",
                      background: "#e94560", color: "#fff", fontSize: "13px", fontWeight: 700,
                      cursor: "pointer", boxShadow: "0 0 16px rgba(233, 69, 96, 0.2)",
                      transition: "all 0.15s",
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                    >
                      Fix All Issues
                      <span style={{ background: "rgba(255,255,255,0.2)", borderRadius: "4px", padding: "2px 8px", fontSize: "11px" }}>
                        {totalFixCost} tokens
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* Category Issues */}
              {totalIssues > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#f1f5f9", margin: "8px 0 0" }}>Issues by Category</h3>
                  {Object.entries(audit.category_issues).map(([cat, issues], i) => {
                    const dimKey = DIM_MAP[cat] || cat;
                    const score = (audit.dimension_scores as any)[dimKey] ?? 50;
                    return <CategoryCard key={cat} category={cat} issues={issues || []} score={score} delay={200 + i * 100} />;
                  })}
                </div>
              )}

              {/* Strengths */}
              {audit.strengths?.length > 0 && (
                <div style={{
                  padding: "24px", borderRadius: "14px",
                  background: "rgba(13, 13, 32, 0.8)", border: "1px solid rgba(255,255,255,0.04)",
                }}>
                  <h3 style={{ color: "#22c55e", fontSize: "16px", fontWeight: 600, marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    What{"'"}s Working
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {audit.strengths.map((s, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "start", gap: "10px", padding: "6px 0",
                        borderBottom: i < audit.strengths.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none" }}>
                        <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#22c55e", marginTop: "7px", flexShrink: 0 }} />
                        <span style={{ color: "#8892a4", fontSize: "13px", lineHeight: 1.5 }}>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Optimized Copy */}
              {audit.generated_copy && (audit.generated_copy.title || audit.generated_copy.bullets) && (
                <div style={{ padding: "24px", borderRadius: "14px",
                  background: "rgba(13, 13, 32, 0.8)", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <h3 style={{ color: "#f1f5f9", fontSize: "16px", fontWeight: 600, marginBottom: "4px" }}>AI-Optimized Copy</h3>
                  <p style={{ color: "#525c6c", fontSize: "12px", marginBottom: "16px" }}>Generated by Opus 4.6. Copy to update your listing.</p>
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
                <div style={{ padding: "24px", borderRadius: "14px",
                  background: "rgba(13, 13, 32, 0.8)", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <h3 style={{ color: "#f1f5f9", fontSize: "16px", fontWeight: 600, marginBottom: "10px" }}>Competitive Intelligence</h3>
                  <p style={{ color: "#e2e8f0", fontSize: "14px", lineHeight: 1.7, margin: 0 }}>
                    {audit.competitive_data.competitive_summary}
                  </p>
                </div>
              )}

              {/* Audit again */}
              <div style={{ textAlign: "center", paddingTop: "8px" }}>
                <button onClick={() => { setAudit(null); setUrl(""); setLoading(false); setResultsRevealed(false); }}
                  style={{ padding: "10px 24px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)",
                    background: "none", color: "#8892a4", fontSize: "13px", fontWeight: 600, cursor: "pointer",
                    transition: "all 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#f1f5f9"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#8892a4"; }}
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
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes spin-reverse { to { transform: rotate(-360deg); } }
        @keyframes breathe {
          0%, 100% { opacity: 0.5; transform: translateX(-50%) scale(1); }
          50% { opacity: 1; transform: translateX(-50%) scale(1.15); }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.4); }
        }
        @keyframes pulse-badge {
          0%, 100% { opacity: 0.8; }
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
        @media (max-width: 640px) {
          nav { padding: 0 20px !important; }
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
