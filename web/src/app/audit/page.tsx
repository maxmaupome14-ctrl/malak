"use client";

import { useState } from "react";

export default function AuditPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAudit = async () => {
    if (!url.trim()) return;
    setLoading(true);
    // TODO: Call API to run audit
    // const response = await api.post("/audit", { url });
    // redirect to results page
    setTimeout(() => setLoading(false), 2000); // Placeholder
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "640px", textAlign: "center" }}>
        {/* Header */}
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
          🔍
        </div>
        <h1
          style={{
            fontSize: "32px",
            fontWeight: 700,
            color: "#f1f5f9",
            marginBottom: "12px",
          }}
        >
          Audit a Product
        </h1>
        <p
          style={{
            color: "#94a3b8",
            fontSize: "16px",
            lineHeight: 1.6,
            marginBottom: "40px",
          }}
        >
          Paste any product URL and Malak&apos;s agents will analyze the listing,
          score it, and generate optimized copy.
        </p>

        {/* Input */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            marginBottom: "24px",
          }}
        >
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://amazon.com/dp/B0..."
            className="input"
            style={{ flex: 1, fontSize: "16px", padding: "14px 20px" }}
            onKeyDown={(e) => e.key === "Enter" && handleAudit()}
          />
          <button
            onClick={handleAudit}
            disabled={loading || !url.trim()}
            className="btn-primary"
            style={{ padding: "14px 32px", fontSize: "16px" }}
          >
            {loading ? "Analyzing..." : "Audit"}
          </button>
        </div>

        {/* Supported platforms */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "24px",
            flexWrap: "wrap",
          }}
        >
          {["Amazon", "Shopify", "Walmart", "MercadoLibre"].map((platform) => (
            <span
              key={platform}
              style={{
                fontSize: "13px",
                color: "#64748b",
                padding: "6px 12px",
                border: "1px solid #1e293b",
                borderRadius: "6px",
                background: "#16162a",
              }}
            >
              {platform}
            </span>
          ))}
        </div>

        {/* What you'll get */}
        <div style={{ marginTop: "64px", textAlign: "left" }}>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "#f1f5f9",
              marginBottom: "20px",
              textAlign: "center",
            }}
          >
            What you&apos;ll get
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
            }}
          >
            {[
              {
                title: "Listing Score",
                desc: "Overall quality score with breakdown by category",
              },
              {
                title: "SEO Analysis",
                desc: "Keyword coverage, search visibility, and missed opportunities",
              },
              {
                title: "Competitive Position",
                desc: "How you stack up against top competitors",
              },
              {
                title: "Optimized Copy",
                desc: "AI-generated titles, bullets, and descriptions ready to use",
              },
            ].map((item) => (
              <div key={item.title} className="card">
                <h3
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#f1f5f9",
                    marginBottom: "6px",
                  }}
                >
                  {item.title}
                </h3>
                <p style={{ fontSize: "13px", color: "#94a3b8", lineHeight: 1.5 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
