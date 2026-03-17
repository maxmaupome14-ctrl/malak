"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

const STATUS_LABELS: Record<AuditStatus, string> = {
  pending: "Starting up...",
  scraping: "Scraping product data...",
  analyzing: "AI is analyzing the listing...",
  generating: "Generating recommendations...",
  completed: "Audit complete!",
  failed: "Audit failed",
};

const IMPACT_COLORS: Record<string, string> = {
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

export default function AuditPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAudit = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setAudit(null);

    try {
      const result = await api.post<AuditResult>("/audit", { url });
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
      const updated = await api.get<AuditResult>(`/audit/${audit.id}`);
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

  const isProcessing = audit && !["completed", "failed"].includes(audit.status);
  const isComplete = audit?.status === "completed";
  const isFailed = audit?.status === "failed";

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
      <div style={{ width: "100%", maxWidth: "800px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #e94560, #b91c1c)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
              margin: "0 auto 24px",
            }}
          >
            M
          </div>
          <h1 style={{ fontSize: "32px", fontWeight: 700, color: "#f1f5f9", marginBottom: "12px" }}>
            Audit a Product
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "16px", lineHeight: 1.6 }}>
            Paste any product URL and Malak&apos;s AI agents will analyze everything.
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
                borderTopColor: "#e94560",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto 24px",
              }}
            />
            <p style={{ fontSize: "18px", fontWeight: 600, color: "#f1f5f9", marginBottom: "8px" }}>
              {STATUS_LABELS[audit.status]}
            </p>
            <p style={{ color: "#64748b", fontSize: "14px" }}>
              This usually takes 10-30 seconds
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
              <h3 style={{ color: "#f1f5f9", fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>
                Recommendations
              </h3>
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

            {/* Audit again */}
            <div style={{ textAlign: "center" }}>
              <button
                onClick={() => {
                  setAudit(null);
                  setUrl("");
                  setLoading(false);
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
