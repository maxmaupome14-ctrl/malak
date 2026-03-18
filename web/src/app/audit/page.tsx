"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

type AuditStatus = "pending" | "scraping" | "analyzing" | "generating" | "completed" | "failed";

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
  effort: "easy" | "medium" | "hard";
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
  generated_copy: Record<string, any>;
  competitive_data: Record<string, any>;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

const STATUS_LABELS: Record<AuditStatus, string> = {
  pending: "Starting up...",
  scraping: "Scout is scraping the product...",
  analyzing: "Auditor is analyzing the listing...",
  generating: "Spy, Copywriter & Strategist are working...",
  completed: "Audit complete!",
  failed: "Audit failed",
};

const IMPACT_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

const THREAT_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const radius = (size - 12) / 2;
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
          strokeWidth="8"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
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
        <span style={{ fontSize: size * 0.3, fontWeight: 800, color: "#f1f5f9" }}>
          {score}
        </span>
        <span style={{ fontSize: size * 0.1, color: "#94a3b8" }}>/ 100</span>
      </div>
    </div>
  );
}

function DimensionBar({ label, score }: { label: string; score: number }) {
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ marginBottom: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span style={{ fontSize: "13px", color: "#94a3b8", textTransform: "capitalize" }}>
          {label}
        </span>
        <span style={{ fontSize: "13px", fontWeight: 600, color }}>{score}</span>
      </div>
      <div style={{ height: "6px", borderRadius: "3px", background: "#1e293b" }}>
        <div
          style={{
            height: "100%",
            width: `${score}%`,
            borderRadius: "3px",
            background: color,
            transition: "width 1s ease",
          }}
        />
      </div>
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
        <button
          onClick={copy}
          style={{
            fontSize: "12px",
            color: copied ? "#22c55e" : "#64748b",
            background: "none",
            border: "1px solid #1e293b",
            borderRadius: "4px",
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div
        style={{
          padding: "12px 16px",
          borderRadius: "8px",
          background: "#0f0f1e",
          border: "1px solid #1e293b",
          color: "#e2e8f0",
          fontSize: "14px",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
        }}
      >
        {text}
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ color: "#f1f5f9", fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>
      {children}
    </h3>
  );
}

function AuditPageInner() {
  const searchParams = useSearchParams();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"audit" | "copy" | "intel" | "strategy">("audit");
  const autoStarted = useRef(false);

  const handleAudit = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setAudit(null);
    setActiveTab("audit");

    try {
      const result = await api.post<AuditResult>("/audit/free", { url });
      setAudit(result);
    } catch (e: any) {
      setError(e.message || "Failed to start audit");
      setLoading(false);
    }
  };

  // Poll for results
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

  // Auto-start audit if URL is in query params (from landing page)
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

  const hasCopy = audit?.generated_copy && (audit.generated_copy.title || audit.generated_copy.bullets);
  const hasIntel = audit?.competitive_data && audit.competitive_data.competitive_summary;
  const hasStrategy = audit?.generated_copy?.strategy?.summary;

  const tabs = [
    { id: "audit" as const, label: "Audit", available: true },
    { id: "copy" as const, label: "Optimized Copy", available: !!hasCopy },
    { id: "intel" as const, label: "Competitive Intel", available: !!hasIntel },
    { id: "strategy" as const, label: "Strategy", available: !!hasStrategy },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "40px 20px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "900px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #c41e3a, #b91c1c)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
              margin: "0 auto 24px",
            }}
          >
            K
          </div>
          <h1 style={{ fontSize: "32px", fontWeight: 700, color: "#f1f5f9", marginBottom: "12px" }}>
            Audit a Product
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "16px", lineHeight: 1.6 }}>
            Paste any product URL and Kansa&apos;s AI agents will analyze everything.
          </p>
        </div>

        {/* Input */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://amazon.com/dp/B0... or any Shopify/Walmart/ML URL"
            className="input"
            style={{ flex: 1, fontSize: "16px", padding: "14px 20px" }}
            onKeyDown={(e) => e.key === "Enter" && handleAudit()}
            disabled={loading}
          />
          <button
            onClick={handleAudit}
            disabled={loading || !url.trim()}
            className="btn-primary"
            style={{ padding: "14px 32px", fontSize: "16px" }}
          >
            {loading ? "Running..." : "Audit"}
          </button>
        </div>

        {/* Platforms */}
        <div
          style={{ display: "flex", justifyContent: "center", gap: "16px", flexWrap: "wrap", marginBottom: "40px" }}
        >
          {["Amazon", "Shopify", "Walmart", "MercadoLibre"].map((p) => (
            <span
              key={p}
              style={{
                fontSize: "13px",
                color: "#64748b",
                padding: "6px 12px",
                border: "1px solid #1e293b",
                borderRadius: "6px",
                background: "#16162a",
              }}
            >
              {p}
            </span>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              padding: "16px",
              borderRadius: "8px",
              background: "#1c1017",
              border: "1px solid #7f1d1d",
              color: "#fca5a5",
              marginBottom: "24px",
            }}
          >
            {error}
          </div>
        )}

        {/* Processing status */}
        {isProcessing && audit && (
          <div
            className="card"
            style={{ textAlign: "center", padding: "48px 24px" }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                border: "3px solid #1e293b",
                borderTopColor: "#c41e3a",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto 24px",
              }}
            />
            <p style={{ fontSize: "18px", fontWeight: 600, color: "#f1f5f9", marginBottom: "8px" }}>
              {STATUS_LABELS[audit.status]}
            </p>
            <p style={{ color: "#64748b", fontSize: "14px" }}>
              {audit.status === "generating"
                ? "Running 3 agents in parallel — this takes 15-45 seconds"
                : "This usually takes 10-30 seconds"}
            </p>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {/* Failed */}
        {isFailed && audit && (
          <div
            className="card"
            style={{ padding: "24px", borderColor: "#7f1d1d" }}
          >
            <h2 style={{ color: "#fca5a5", fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>
              Audit Failed
            </h2>
            <p style={{ color: "#94a3b8" }}>{audit.error_message || "Unknown error"}</p>
          </div>
        )}

        {/* Results */}
        {isComplete && audit && audit.overall_score !== null && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Tab Navigation */}
            <div style={{ display: "flex", gap: "4px", background: "#0f0f1e", borderRadius: "10px", padding: "4px" }}>
              {tabs.filter(t => t.available).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    flex: 1,
                    padding: "10px 16px",
                    borderRadius: "8px",
                    border: "none",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: activeTab === tab.id ? "#1e293b" : "transparent",
                    color: activeTab === tab.id ? "#f1f5f9" : "#64748b",
                    transition: "all 0.2s",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ═══ TAB: Audit ═══ */}
            {activeTab === "audit" && (
              <>
                {/* Score overview */}
                <div className="card" style={{ padding: "32px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "40px" }}>
                    <ScoreRing score={audit.overall_score} />
                    <div style={{ flex: 1 }}>
                      <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9", marginBottom: "16px" }}>
                        Listing Score
                      </h2>
                      {Object.entries(audit.dimension_scores).map(([key, value]) => (
                        <DimensionBar key={key} label={key} score={value} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Strengths & Weaknesses */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div className="card" style={{ padding: "24px" }}>
                    <h3 style={{ color: "#22c55e", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>
                      Strengths
                    </h3>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {audit.strengths.map((s, i) => (
                        <li
                          key={i}
                          style={{
                            padding: "8px 0",
                            borderBottom: i < audit.strengths.length - 1 ? "1px solid #1e293b" : "none",
                            color: "#94a3b8",
                            fontSize: "14px",
                            lineHeight: 1.5,
                          }}
                        >
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="card" style={{ padding: "24px" }}>
                    <h3 style={{ color: "#ef4444", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>
                      Weaknesses
                    </h3>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {audit.weaknesses.map((w, i) => (
                        <li
                          key={i}
                          style={{
                            padding: "8px 0",
                            borderBottom: i < audit.weaknesses.length - 1 ? "1px solid #1e293b" : "none",
                            color: "#94a3b8",
                            fontSize: "14px",
                            lineHeight: 1.5,
                          }}
                        >
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Recommendations */}
                <div className="card" style={{ padding: "24px" }}>
                  <SectionHeader>Recommendations</SectionHeader>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {audit.recommendations.map((rec, i) => (
                      <div
                        key={i}
                        style={{
                          padding: "16px",
                          borderRadius: "8px",
                          background: "#0f0f1e",
                          border: "1px solid #1e293b",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                          <span
                            style={{
                              width: "24px",
                              height: "24px",
                              borderRadius: "50%",
                              background: "#1e293b",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "12px",
                              fontWeight: 700,
                              color: "#f1f5f9",
                              flexShrink: 0,
                            }}
                          >
                            {i + 1}
                          </span>
                          <span style={{ fontWeight: 600, color: "#f1f5f9", fontSize: "14px" }}>
                            {rec.title}
                          </span>
                          <span
                            style={{
                              marginLeft: "auto",
                              fontSize: "11px",
                              fontWeight: 600,
                              textTransform: "uppercase",
                              color: IMPACT_COLORS[rec.impact] || "#94a3b8",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              background: `${IMPACT_COLORS[rec.impact] || "#94a3b8"}15`,
                            }}
                          >
                            {rec.impact} impact
                          </span>
                        </div>
                        <p style={{ color: "#94a3b8", fontSize: "13px", lineHeight: 1.6, margin: 0 }}>
                          {rec.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ═══ TAB: Optimized Copy ═══ */}
            {activeTab === "copy" && hasCopy && (
              <div className="card" style={{ padding: "24px" }}>
                <SectionHeader>AI-Optimized Copy</SectionHeader>
                <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "24px" }}>
                  Generated by the Copywriter agent. Copy any section to update your listing.
                </p>

                {audit.generated_copy.title?.optimized && (
                  <CopyBlock label="Optimized Title" text={audit.generated_copy.title.optimized} />
                )}

                {audit.generated_copy.bullets?.optimized && (
                  <CopyBlock
                    label="Optimized Bullet Points"
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

                {audit.generated_copy.backend_keywords?.length > 0 && (
                  <CopyBlock
                    label="Backend Keywords"
                    text={audit.generated_copy.backend_keywords.join(", ")}
                  />
                )}

                {audit.generated_copy.seo_notes?.length > 0 && (
                  <div style={{ marginTop: "16px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      SEO Notes
                    </span>
                    <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
                      {audit.generated_copy.seo_notes.map((note: string, i: number) => (
                        <li key={i} style={{ color: "#64748b", fontSize: "13px", padding: "4px 0", lineHeight: 1.5 }}>
                          {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* ═══ TAB: Competitive Intel ═══ */}
            {activeTab === "intel" && hasIntel && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Summary + Threat */}
                <div className="card" style={{ padding: "24px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                    <SectionHeader>Competitive Intelligence</SectionHeader>
                    {audit.competitive_data.threat_level && (
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          color: THREAT_COLORS[audit.competitive_data.threat_level] || "#94a3b8",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          background: `${THREAT_COLORS[audit.competitive_data.threat_level] || "#94a3b8"}15`,
                          marginBottom: "16px",
                        }}
                      >
                        {audit.competitive_data.threat_level} threat
                      </span>
                    )}
                  </div>
                  <p style={{ color: "#e2e8f0", fontSize: "15px", lineHeight: 1.7, margin: 0 }}>
                    {audit.competitive_data.competitive_summary}
                  </p>
                </div>

                {/* Price Position */}
                {audit.competitive_data.price_position && (
                  <div className="card" style={{ padding: "24px" }}>
                    <h4 style={{ color: "#f1f5f9", fontSize: "15px", fontWeight: 600, marginBottom: "8px" }}>
                      Price Position: {audit.competitive_data.price_position.assessment}
                    </h4>
                    <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: 1.6, margin: 0 }}>
                      {audit.competitive_data.price_position.reasoning}
                    </p>
                  </div>
                )}

                {/* Strengths vs Market / Weaknesses vs Market */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  {audit.competitive_data.strengths_vs_market?.length > 0 && (
                    <div className="card" style={{ padding: "24px" }}>
                      <h4 style={{ color: "#22c55e", fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>
                        Your Advantages
                      </h4>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {audit.competitive_data.strengths_vs_market.map((s: string, i: number) => (
                          <li key={i} style={{ color: "#94a3b8", fontSize: "13px", padding: "6px 0", lineHeight: 1.5 }}>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {audit.competitive_data.weaknesses_vs_market?.length > 0 && (
                    <div className="card" style={{ padding: "24px" }}>
                      <h4 style={{ color: "#ef4444", fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>
                        Gaps vs Market
                      </h4>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {audit.competitive_data.weaknesses_vs_market.map((w: string, i: number) => (
                          <li key={i} style={{ color: "#94a3b8", fontSize: "13px", padding: "6px 0", lineHeight: 1.5 }}>
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Opportunities */}
                {audit.competitive_data.opportunities?.length > 0 && (
                  <div className="card" style={{ padding: "24px" }}>
                    <h4 style={{ color: "#3b82f6", fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>
                      Market Opportunities
                    </h4>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {audit.competitive_data.opportunities.map((o: string, i: number) => (
                        <li key={i} style={{ color: "#94a3b8", fontSize: "13px", padding: "6px 0", lineHeight: 1.5 }}>
                          {o}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* ═══ TAB: Strategy ═══ */}
            {activeTab === "strategy" && hasStrategy && (() => {
              const strategy = audit.generated_copy.strategy;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {/* Summary */}
                  <div className="card" style={{ padding: "24px" }}>
                    <SectionHeader>Action Plan</SectionHeader>
                    <p style={{ color: "#e2e8f0", fontSize: "15px", lineHeight: 1.7, margin: 0 }}>
                      {strategy.summary}
                    </p>
                    {strategy.estimated_score_improvement?.projected > 0 && (
                      <div
                        style={{
                          marginTop: "16px",
                          padding: "12px 16px",
                          borderRadius: "8px",
                          background: "#0f2a1a",
                          border: "1px solid #166534",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                        }}
                      >
                        <span style={{ fontSize: "24px", fontWeight: 800, color: "#22c55e" }}>
                          {strategy.estimated_score_improvement.current} → {strategy.estimated_score_improvement.projected}
                        </span>
                        <span style={{ color: "#86efac", fontSize: "14px" }}>
                          Projected score after implementing all recommendations
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Quick Wins */}
                  {strategy.quick_wins?.length > 0 && (
                    <div className="card" style={{ padding: "24px" }}>
                      <h4 style={{ color: "#22c55e", fontSize: "16px", fontWeight: 600, marginBottom: "16px" }}>
                        Quick Wins (under 1 hour)
                      </h4>
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {strategy.quick_wins.map((win: any, i: number) => (
                          <div
                            key={i}
                            style={{
                              padding: "14px 16px",
                              borderRadius: "8px",
                              background: "#0f0f1e",
                              border: "1px solid #1e293b",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "6px" }}>
                              <span style={{ fontWeight: 600, color: "#f1f5f9", fontSize: "14px" }}>
                                {win.action}
                              </span>
                              <span style={{ fontSize: "12px", color: "#64748b", whiteSpace: "nowrap", marginLeft: "12px" }}>
                                {win.time_estimate}
                              </span>
                            </div>
                            <p style={{ color: "#94a3b8", fontSize: "13px", lineHeight: 1.5, margin: 0 }}>
                              {win.why}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Strategic Moves */}
                  {strategy.strategic_moves?.length > 0 && (
                    <div className="card" style={{ padding: "24px" }}>
                      <h4 style={{ color: "#3b82f6", fontSize: "16px", fontWeight: 600, marginBottom: "16px" }}>
                        Strategic Moves (long-term)
                      </h4>
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {strategy.strategic_moves.map((move: any, i: number) => (
                          <div
                            key={i}
                            style={{
                              padding: "14px 16px",
                              borderRadius: "8px",
                              background: "#0f0f1e",
                              border: "1px solid #1e293b",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "6px" }}>
                              <span style={{ fontWeight: 600, color: "#f1f5f9", fontSize: "14px" }}>
                                {move.action}
                              </span>
                              <span
                                style={{
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  color: IMPACT_COLORS[move.impact] || "#94a3b8",
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                  background: `${IMPACT_COLORS[move.impact] || "#94a3b8"}15`,
                                  whiteSpace: "nowrap",
                                  marginLeft: "12px",
                                }}
                              >
                                {move.impact}
                              </span>
                            </div>
                            <p style={{ color: "#94a3b8", fontSize: "13px", lineHeight: 1.5, margin: 0 }}>
                              {move.why}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Weekly Plan */}
                  {strategy.weekly_plan && Object.keys(strategy.weekly_plan).length > 0 && (
                    <div className="card" style={{ padding: "24px" }}>
                      <h4 style={{ color: "#f1f5f9", fontSize: "16px", fontWeight: 600, marginBottom: "16px" }}>
                        Weekly Execution Plan
                      </h4>
                      {Object.entries(strategy.weekly_plan).map(([week, actions]) => (
                        <div key={week} style={{ marginBottom: "16px" }}>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "#94a3b8", textTransform: "capitalize" }}>
                            {week.replace("_", " ")}
                          </span>
                          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
                            {(actions as string[]).map((action: string, i: number) => (
                              <li key={i} style={{ color: "#e2e8f0", fontSize: "14px", padding: "4px 0 4px 16px", borderLeft: "2px solid #1e293b", lineHeight: 1.5 }}>
                                {action}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Audit again */}
            <div style={{ textAlign: "center" }}>
              <button
                onClick={() => {
                  setAudit(null);
                  setUrl("");
                  setLoading(false);
                  setActiveTab("audit");
                }}
                className="btn-secondary"
                style={{ padding: "12px 24px" }}
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
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "#94a3b8" }}>Loading...</p></div>}>
      <AuditPageInner />
    </Suspense>
  );
}
