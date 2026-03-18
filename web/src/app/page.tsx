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
            K
          </div>
          <span style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>
            Kansa
          </span>
        </div>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <Link href="/pricing" style={{ color: "#94a3b8", fontSize: "14px", textDecoration: "none" }}>
            Pricing
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
          <span style={{ color: "#22c55e" }}>&#9679;</span>
          AI that runs your ecommerce store
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
            Employee
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
          Connect your Shopify store. Kansa&apos;s AI agents analyze every listing,
          generate optimized copy, and push changes directly &mdash; so you sell more
          without lifting a finger.
        </p>

        {/* CTA buttons */}
        <div style={{ display: "flex", gap: "16px", marginBottom: "32px" }}>
          <Link href="/dashboard" className="btn-primary" style={{ padding: "16px 32px", fontSize: "16px" }}>
            Connect Your Store
          </Link>
          <button
            onClick={() => document.getElementById("free-audit")?.scrollIntoView({ behavior: "smooth" })}
            className="btn-secondary"
            style={{ padding: "16px 32px", fontSize: "16px" }}
          >
            Try Free Audit
          </button>
        </div>

        <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "80px" }}>
          $99/mo or $1,000 lifetime &middot; BYOK (Bring Your Own Keys) &middot; Cancel anytime
        </p>

        {/* How it works */}
        <div style={{ width: "100%", maxWidth: "900px", marginBottom: "80px" }}>
          <h2 style={{ fontSize: "32px", fontWeight: 700, color: "#f1f5f9", marginBottom: "48px" }}>
            How Kansa Works
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px" }}>
            {[
              { step: "1", title: "Connect", desc: "Link your Shopify store with one click via OAuth. Your data stays yours." },
              { step: "2", title: "Optimize", desc: "AI agents analyze every listing and generate optimized titles, descriptions, and tags." },
              { step: "3", title: "Push", desc: "Review the diffs, approve what you like, and push changes directly to your store." },
            ].map((item) => (
              <div key={item.step} style={{ textAlign: "center" }}>
                <div style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #e94560, #b91c1c)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: "20px",
                  color: "white",
                  margin: "0 auto 16px",
                }}>
                  {item.step}
                </div>
                <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#f1f5f9", marginBottom: "8px" }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: "14px", color: "#94a3b8", lineHeight: 1.6 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Free Audit Section */}
        <div id="free-audit" style={{ width: "100%", maxWidth: "600px", marginBottom: "80px" }}>
          <h2 style={{ fontSize: "28px", fontWeight: 700, color: "#f1f5f9", marginBottom: "12px" }}>
            Try a Free Audit
          </h2>
          <p style={{ color: "#94a3b8", fontSize: "15px", marginBottom: "24px" }}>
            No account needed. Paste any product URL and see what Kansa can do.
          </p>
          <div style={{ display: "flex", gap: "12px" }}>
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
          <p style={{ marginTop: "12px", fontSize: "13px", color: "#64748b" }}>
            Works with Shopify, Amazon, Walmart, MercadoLibre, and more
          </p>
        </div>

        {/* Agent cards */}
        <div style={{ width: "100%", maxWidth: "900px" }}>
          <h2 style={{ fontSize: "28px", fontWeight: 700, color: "#f1f5f9", marginBottom: "32px" }}>
            Your AI Team
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "16px",
            }}
          >
            {[
              { icon: "\u{1f50d}", name: "Scout", desc: "Scrapes and extracts structured data from any ecommerce platform" },
              { icon: "\u{1f4ca}", name: "Auditor", desc: "Scores every aspect of your listing against best practices" },
              { icon: "\u{1f575}\ufe0f", name: "Spy", desc: "Competitive intel — tracks pricing, reviews, and market trends" },
              { icon: "\u270d\ufe0f", name: "Copywriter", desc: "Generates SEO-optimized titles, descriptions, and bullet points" },
              { icon: "\u{1f9e0}", name: "Strategist", desc: "Creates actionable plans with quick wins and long-term plays" },
              { icon: "\u{1f680}", name: "Pusher", desc: "Pushes approved changes directly to your store via API" },
            ].map((agent) => (
              <div key={agent.name} className="card" style={{ textAlign: "left" }}>
                <div style={{ fontSize: "24px", marginBottom: "8px" }}>{agent.icon}</div>
                <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#f1f5f9", marginBottom: "6px" }}>
                  {agent.name}
                </h3>
                <p style={{ fontSize: "13px", color: "#94a3b8", lineHeight: 1.5 }}>
                  {agent.desc}
                </p>
              </div>
            ))}
          </div>
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
        Kansa &mdash; AI that runs your ecommerce store.
      </footer>
    </div>
  );
}
