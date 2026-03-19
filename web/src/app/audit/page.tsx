"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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

const STATUS_LABELS: Record<AuditStatus, string> = {
  pending: "Starting up...",
  scraping: "Scout is scraping the product...",
  analyzing: "Auditor is analyzing with Opus 4.6...",
  generating: "Generating optimized copy & competitive intel...",
  completed: "Audit complete!",
  failed: "Audit failed",
};

const IMPACT_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  title: { label: "Title", icon: "T" },
  bullets: { label: "Bullet Points", icon: "B" },
  description: { label: "Description", icon: "D" },
  images: { label: "Images", icon: "I" },
  keywords: { label: "Keywords & SEO", icon: "K" },
  competitive: { label: "Competitive Position", icon: "C" },
};

const CATEGORY_TO_DIMENSION: Record<string, string> = {
  title: "title",
  bullets: "content",
  description: "content",
  images: "images",
  keywords: "seo",
  competitive: "pricing",
};

// ─── Components ────────────────────────────────────────

function ScoreRing({ score, size = 140 }: { score: number; size?: number }) {
  const radius = (size - 14) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1e293b" strokeWidth="10" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: size * 0.32, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
          {score}
        </span>
        <span style={{ fontSize: size * 0.1, color: "#64748b", fontWeight: 500 }}>/ 100</span>
      </div>
    </div>
  );
}

function DimensionBar({ label, score }: { label: string; score: number }) {
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        <span style={{ fontSize: "13px", color: "#94a3b8", textTransform: "capitalize", fontWeight: 500 }}>
          {label}
        </span>
        <span style={{ fontSize: "13px", fontWeight: 700, color }}>{score}</span>
      </div>
      <div style={{ height: "8px", borderRadius: "4px", background: "#0f172a" }}>
        <div style={{
          height: "100%", width: `${score}%`, borderRadius: "4px", background: color,
          transition: "width 1.2s cubic-bezier(0.4, 0, 0.2, 1)",
        }} />
      </div>
    </div>
  );
}

function FixButton({ cost, action, onClick }: { cost: number; action: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: "8px",
        padding: "8px 16px", borderRadius: "8px", border: "none",
        background: "linear-gradient(135deg, #e94560, #c41e3a)",
        color: "#fff", fontSize: "13px", fontWeight: 600,
        cursor: "pointer", whiteSpace: "nowrap",
        boxShadow: "0 0 20px rgba(233, 69, 96, 0.3)",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = "0 0 30px rgba(233, 69, 96, 0.5)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 0 20px rgba(233, 69, 96, 0.3)";
      }}
    >
      {action}
      <span style={{
        background: "rgba(255,255,255,0.2)", borderRadius: "4px",
        padding: "2px 6px", fontSize: "11px", fontWeight: 700,
      }}>
        {cost} tokens
      </span>
    </button>
  );
}

function CategoryCard({
  category,
  issues,
  score,
}: {
  category: string;
  issues: CategoryIssue[];
  score: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const info = CATEGORY_LABELS[category] || { label: category, icon: "?" };
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

  if (!issues || issues.length === 0) return null;

  return (
    <div style={{
      borderRadius: "12px", background: "#0c0c1d",
      border: "1px solid #1e293b", overflow: "hidden",
    }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "16px",
          padding: "20px 24px", border: "none", background: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{
          width: "40px", height: "40px", borderRadius: "10px",
          background: `${color}15`, border: `1px solid ${color}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "16px", fontWeight: 800, color,
        }}>
          {info.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "16px", fontWeight: 600, color: "#f1f5f9" }}>
              {info.label}
            </span>
            <span style={{
              fontSize: "13px", fontWeight: 700, color,
              background: `${color}15`, padding: "2px 8px", borderRadius: "4px",
            }}>
              {score}/100
            </span>
          </div>
          <span style={{ fontSize: "13px", color: "#64748b", marginTop: "2px", display: "block" }}>
            {issues.length} issue{issues.length !== 1 ? "s" : ""} found
          </span>
        </div>
        <svg
          width="20" height="20" viewBox="0 0 20 20" fill="none"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", color: "#64748b" }}
        >
          <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Issues */}
      {expanded && (
        <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {issues.map((issue, i) => (
            <div key={i} style={{
              padding: "16px", borderRadius: "10px",
              background: "#0f172a", border: "1px solid #1e293b",
            }}>
              <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: "16px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <span style={{
                      fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
                      color: IMPACT_COLORS[issue.impact] || "#94a3b8",
                      padding: "2px 6px", borderRadius: "3px",
                      background: `${IMPACT_COLORS[issue.impact] || "#94a3b8"}15`,
                      letterSpacing: "0.05em",
                    }}>
                      {issue.impact}
                    </span>
                  </div>
                  <p style={{ color: "#e2e8f0", fontSize: "14px", fontWeight: 500, margin: "0 0 4px", lineHeight: 1.5 }}>
                    {issue.issue}
                  </p>
                  {issue.detail && issue.detail !== issue.issue && (
                    <p style={{ color: "#64748b", fontSize: "13px", margin: 0, lineHeight: 1.5 }}>
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

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {label}
        </span>
        <button onClick={copy} style={{
          fontSize: "12px", color: copied ? "#22c55e" : "#64748b",
          background: "none", border: "1px solid #1e293b", borderRadius: "4px",
          padding: "4px 10px", cursor: "pointer",
        }}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div style={{
        padding: "12px 16px", borderRadius: "8px",
        background: "#0f0f1e", border: "1px solid #1e293b",
        color: "#e2e8f0", fontSize: "14px", lineHeight: 1.6, whiteSpace: "pre-wrap",
      }}>
        {text}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────

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
    } catch {
      // Silently retry on network errors
    }
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
        setError(null);
        api.post<AuditResult>("/audit/free", { url: urlParam })
          .then((result) => setAudit(result))
          .catch((e: any) => {
            setError(e.message || "Failed to start audit");
            setLoading(false);
          });
      }, 0);
    }
  }, [searchParams]);

  const isProcessing = audit && !["completed", "failed"].includes(audit.status);
  const isComplete = audit?.status === "completed";
  const isFailed = audit?.status === "failed";

  // Calculate totals
  const totalIssues = audit?.category_issues
    ? Object.values(audit.category_issues).reduce((sum, issues) => sum + (issues?.length || 0), 0)
    : 0;
  const totalFixCost = audit?.category_issues
    ? Object.values(audit.category_issues).reduce(
        (sum, issues) => sum + (issues || []).reduce((s: number, i: CategoryIssue) => s + (i.fix_cost || 0), 0), 0
      )
    : 0;

  const hasIssues = totalIssues > 0;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: "960px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "6px 14px", borderRadius: "20px",
            background: "linear-gradient(135deg, rgba(233,69,96,0.15), rgba(196,30,58,0.1))",
            border: "1px solid rgba(233,69,96,0.2)",
            marginBottom: "20px",
          }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#e94560", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Amazon Optimizer
            </span>
          </div>
          <h1 style={{ fontSize: "36px", fontWeight: 800, color: "#f1f5f9", marginBottom: "12px", letterSpacing: "-0.02em" }}>
            Audit Your Listing
          </h1>
          <p style={{ color: "#64748b", fontSize: "16px", lineHeight: 1.6, maxWidth: "500px", margin: "0 auto" }}>
            Paste any Amazon product URL. AI analyzes 6 dimensions and finds every fixable issue.
          </p>
        </div>

        {/* Input */}
        <div style={{
          display: "flex", gap: "12px", marginBottom: "16px",
          padding: "6px", borderRadius: "14px",
          background: "#0c0c1d", border: "1px solid #1e293b",
        }}>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://amazon.com/dp/B0..."
            style={{
              flex: 1, fontSize: "16px", padding: "14px 20px",
              background: "transparent", border: "none", outline: "none",
              color: "#f1f5f9", fontFamily: "inherit",
            }}
            onKeyDown={(e) => e.key === "Enter" && handleAudit()}
            disabled={loading}
          />
          <button
            onClick={handleAudit}
            disabled={loading || !url.trim()}
            style={{
              padding: "14px 32px", fontSize: "15px", fontWeight: 700,
              borderRadius: "10px", border: "none", cursor: "pointer",
              background: loading || !url.trim()
                ? "#1e293b"
                : "linear-gradient(135deg, #e94560, #c41e3a)",
              color: loading || !url.trim() ? "#64748b" : "#fff",
              transition: "all 0.2s",
              boxShadow: loading || !url.trim() ? "none" : "0 0 20px rgba(233, 69, 96, 0.3)",
            }}
          >
            {loading ? "Auditing..." : "Audit Free"}
          </button>
        </div>

        {/* Marketplace badges */}
        <div style={{ display: "flex", justifyContent: "center", gap: "8px", flexWrap: "wrap", marginBottom: "40px" }}>
          {[
            ".com", ".com.mx", ".co.uk", ".de", ".fr", ".es", ".it",
            ".co.jp", ".com.br", ".in", ".ca", ".com.au",
          ].map((domain) => (
            <span key={domain} style={{
              fontSize: "12px", color: "#475569", padding: "4px 8px",
              border: "1px solid #1e293b", borderRadius: "6px",
              background: "#0c0c1d", fontFamily: "monospace",
            }}>
              amazon{domain}
            </span>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: "16px 20px", borderRadius: "12px",
            background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)",
            color: "#fca5a5", marginBottom: "24px", fontSize: "14px",
          }}>
            {error}
          </div>
        )}

        {/* Processing */}
        {isProcessing && audit && (
          <div style={{
            textAlign: "center", padding: "60px 24px",
            borderRadius: "16px", background: "#0c0c1d", border: "1px solid #1e293b",
          }}>
            <div style={{
              width: "56px", height: "56px",
              border: "3px solid #1e293b", borderTopColor: "#e94560",
              borderRadius: "50%", animation: "spin 1s linear infinite",
              margin: "0 auto 28px",
            }} />
            <p style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9", marginBottom: "8px" }}>
              {STATUS_LABELS[audit.status]}
            </p>
            <p style={{ color: "#64748b", fontSize: "14px" }}>
              {audit.status === "generating"
                ? "Running agents in parallel — 15-45 seconds"
                : "Usually takes 10-30 seconds"}
            </p>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {/* Failed */}
        {isFailed && audit && (
          <div style={{
            padding: "24px", borderRadius: "12px",
            background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)",
          }}>
            <h2 style={{ color: "#fca5a5", fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>
              Audit Failed
            </h2>
            <p style={{ color: "#94a3b8" }}>{audit.error_message || "Unknown error"}</p>
          </div>
        )}

        {/* ═══ RESULTS ═══ */}
        {isComplete && audit && audit.overall_score !== null && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

            {/* Score Overview Card */}
            <div style={{
              padding: "32px", borderRadius: "16px",
              background: "#0c0c1d", border: "1px solid #1e293b",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "40px" }}>
                <ScoreRing score={audit.overall_score} />
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: "22px", fontWeight: 700, color: "#f1f5f9", marginBottom: "20px" }}>
                    Listing Score
                  </h2>
                  {Object.entries(audit.dimension_scores).map(([key, value]) => (
                    <DimensionBar key={key} label={key} score={value} />
                  ))}
                </div>
              </div>

              {/* Fix All banner */}
              {hasIssues && (
                <div style={{
                  marginTop: "24px", padding: "16px 20px", borderRadius: "12px",
                  background: "linear-gradient(135deg, rgba(233,69,96,0.1), rgba(196,30,58,0.05))",
                  border: "1px solid rgba(233,69,96,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div>
                    <span style={{ fontSize: "15px", fontWeight: 600, color: "#f1f5f9" }}>
                      {totalIssues} fixable issue{totalIssues !== 1 ? "s" : ""} found
                    </span>
                    <span style={{ fontSize: "13px", color: "#64748b", marginLeft: "8px" }}>
                      across {Object.keys(audit.category_issues).filter(k => (audit.category_issues[k]?.length || 0) > 0).length} categories
                    </span>
                  </div>
                  <button style={{
                    display: "inline-flex", alignItems: "center", gap: "10px",
                    padding: "10px 24px", borderRadius: "10px", border: "none",
                    background: "linear-gradient(135deg, #e94560, #c41e3a)",
                    color: "#fff", fontSize: "14px", fontWeight: 700, cursor: "pointer",
                    boxShadow: "0 0 30px rgba(233, 69, 96, 0.4)",
                  }}>
                    Fix All Issues
                    <span style={{
                      background: "rgba(255,255,255,0.2)", borderRadius: "6px",
                      padding: "3px 8px", fontSize: "12px",
                    }}>
                      {totalFixCost} tokens
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Summary */}
            {audit.recommendations?.length > 0 && (
              <div style={{
                padding: "24px", borderRadius: "16px",
                background: "#0c0c1d", border: "1px solid #1e293b",
              }}>
                <p style={{ color: "#e2e8f0", fontSize: "15px", lineHeight: 1.7, margin: 0 }}>
                  {(audit as any).summary || audit.recommendations[0]?.description || ""}
                </p>
              </div>
            )}

            {/* Category Issues */}
            {hasIssues && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
                  Issues by Category
                </h3>
                {Object.entries(audit.category_issues).map(([category, issues]) => {
                  const dimKey = CATEGORY_TO_DIMENSION[category] || category;
                  const score = (audit.dimension_scores as any)[dimKey] ?? 50;
                  return (
                    <CategoryCard
                      key={category}
                      category={category}
                      issues={issues || []}
                      score={score}
                    />
                  );
                })}
              </div>
            )}

            {/* Strengths */}
            {audit.strengths?.length > 0 && (
              <div style={{
                padding: "24px", borderRadius: "16px",
                background: "#0c0c1d", border: "1px solid #1e293b",
              }}>
                <h3 style={{ color: "#22c55e", fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>
                  What&apos;s Working Well
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {audit.strengths.map((s, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "start", gap: "12px",
                      padding: "10px 0",
                      borderBottom: i < audit.strengths.length - 1 ? "1px solid #1e293b" : "none",
                    }}>
                      <div style={{
                        width: "6px", height: "6px", borderRadius: "50%",
                        background: "#22c55e", marginTop: "7px", flexShrink: 0,
                      }} />
                      <span style={{ color: "#94a3b8", fontSize: "14px", lineHeight: 1.5 }}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Optimized Copy */}
            {audit.generated_copy && (audit.generated_copy.title || audit.generated_copy.bullets) && (
              <div style={{
                padding: "24px", borderRadius: "16px",
                background: "#0c0c1d", border: "1px solid #1e293b",
              }}>
                <h3 style={{ color: "#f1f5f9", fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>
                  AI-Optimized Copy
                </h3>
                <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "20px" }}>
                  Generated by Kansa&apos;s Copywriter agent. Copy to update your listing.
                </p>

                {audit.generated_copy.title?.optimized && (
                  <CopyBlock label="Optimized Title" text={audit.generated_copy.title.optimized} />
                )}
                {audit.generated_copy.bullets?.optimized && (
                  <CopyBlock
                    label="Optimized Bullets"
                    text={
                      Array.isArray(audit.generated_copy.bullets.optimized)
                        ? audit.generated_copy.bullets.optimized.map((b: string, i: number) => `${i + 1}. ${b}`).join("\n")
                        : audit.generated_copy.bullets.optimized
                    }
                  />
                )}
                {audit.generated_copy.description?.optimized && (
                  <CopyBlock label="Optimized Description" text={audit.generated_copy.description.optimized} />
                )}
              </div>
            )}

            {/* Competitive Intel */}
            {audit.competitive_data?.competitive_summary && (
              <div style={{
                padding: "24px", borderRadius: "16px",
                background: "#0c0c1d", border: "1px solid #1e293b",
              }}>
                <h3 style={{ color: "#f1f5f9", fontSize: "18px", fontWeight: 600, marginBottom: "12px" }}>
                  Competitive Intelligence
                </h3>
                <p style={{ color: "#e2e8f0", fontSize: "15px", lineHeight: 1.7, margin: 0 }}>
                  {audit.competitive_data.competitive_summary}
                </p>
              </div>
            )}

            {/* Audit again */}
            <div style={{ textAlign: "center", paddingTop: "8px" }}>
              <button
                onClick={() => { setAudit(null); setUrl(""); setLoading(false); }}
                style={{
                  padding: "12px 28px", borderRadius: "10px",
                  border: "1px solid #1e293b", background: "#0c0c1d",
                  color: "#94a3b8", fontSize: "14px", fontWeight: 600, cursor: "pointer",
                }}
              >
                Audit Another Product
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#94a3b8" }}>Loading...</p>
      </div>
    }>
      <AuditPageInner />
    </Suspense>
  );
}
