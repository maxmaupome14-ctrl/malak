"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const [url, setUrl] = useState("");
  const router = useRouter();

  const handleAudit = () => {
    if (url.trim()) {
      router.push(`/audit?url=${encodeURIComponent(url.trim())}`);
    } else {
      router.push("/audit");
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Nav */}
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 40px",
          borderBottom: "1px solid #1e293b",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #e94560, #b91c1c)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "18px",
              color: "white",
            }}
          >
            M
          </div>
          <span style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>
            Malak AI
          </span>
        </div>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <Link
            href="https://github.com/maxmaupome14-ctrl/malak"
            style={{ color: "#94a3b8", fontSize: "14px", textDecoration: "none" }}
          >
            GitHub
          </Link>
          <Link href="/login" className="btn-secondary">
            Sign In
          </Link>
          <Link href="/dashboard" className="btn-primary">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 20px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 16px",
            borderRadius: "999px",
            border: "1px solid #334155",
            background: "#16162a",
            fontSize: "13px",
            color: "#94a3b8",
            marginBottom: "32px",
          }}
        >
          <span style={{ color: "#22c55e" }}>●</span>
          Open Source AI Marketing Intelligence
        </div>

        <h1
          style={{
            fontSize: "clamp(40px, 6vw, 72px)",
            fontWeight: 800,
            lineHeight: 1.1,
            maxWidth: "800px",
            color: "#f1f5f9",
            margin: "0 0 24px",
          }}
        >
          Your AI{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #e94560, #f87171)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Chief Marketing Officer
          </span>{" "}
          for Ecommerce
        </h1>

        <p
          style={{
            fontSize: "18px",
            color: "#94a3b8",
            maxWidth: "600px",
            lineHeight: 1.7,
            margin: "0 0 48px",
          }}
        >
          Paste a product URL. Malak&apos;s AI agents scrape, analyze, and generate
          optimized copy — so you can stop guessing and start selling.
        </p>

        {/* URL Input */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            width: "100%",
            maxWidth: "600px",
          }}
        >
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAudit()}
            placeholder="Paste any product URL..."
            className="input"
            style={{ flex: 1, fontSize: "16px", padding: "14px 20px" }}
          />
          <button
            onClick={handleAudit}
            className="btn-primary"
            style={{ padding: "14px 32px", fontSize: "16px", whiteSpace: "nowrap" }}
          >
            Audit Now
          </button>
        </div>

        {/* Supported platforms */}
        <p
          style={{
            marginTop: "24px",
            fontSize: "13px",
            color: "#64748b",
          }}
        >
          Works with Amazon, Shopify, Walmart, MercadoLibre, and more
        </p>

        {/* Agent cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "20px",
            width: "100%",
            maxWidth: "900px",
            marginTop: "80px",
          }}
        >
          {[
            {
              icon: "🔍",
              name: "Scout",
              desc: "Universal scraper — extracts structured data from any ecommerce platform",
            },
            {
              icon: "📊",
              name: "Auditor",
              desc: "Listing analyzer — scores and evaluates every aspect of your product page",
            },
            {
              icon: "🕵️",
              name: "Spy",
              desc: "Competitive intel — tracks competitors, pricing, and market shifts",
            },
            {
              icon: "🧠",
              name: "Strategist",
              desc: "Action planner — concrete, prioritized recommendations you can act on",
            },
            {
              icon: "✍️",
              name: "Copywriter",
              desc: "Optimization engine — generates SEO-perfect titles, bullets, and descriptions",
            },
            {
              icon: "👁️",
              name: "Sentinel",
              desc: "24/7 monitor — alerts you when competitors move or your market shifts",
            },
            {
              icon: "📦",
              name: "Logistics",
              desc: "Fulfillment optimizer — analyzes shipping, delivery speed, and logistics strategy",
            },
          ].map((agent) => (
            <div
              key={agent.name}
              className="card"
              style={{
                textAlign: "left",
                transition: "border-color 0.2s",
              }}
            >
              <div style={{ fontSize: "28px", marginBottom: "12px" }}>
                {agent.icon}
              </div>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "#f1f5f9",
                  marginBottom: "8px",
                }}
              >
                {agent.name}
              </h3>
              <p style={{ fontSize: "14px", color: "#94a3b8", lineHeight: 1.6 }}>
                {agent.desc}
              </p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          textAlign: "center",
          padding: "32px",
          borderTop: "1px solid #1e293b",
          color: "#64748b",
          fontSize: "13px",
        }}
      >
        Malak AI is open source under the MIT License.
      </footer>
    </div>
  );
}
