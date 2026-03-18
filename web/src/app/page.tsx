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
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <svg width="36" height="36" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="kansa-nav-grad" x1="0" y1="0" x2="30" y2="30" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#c41e3a" />
                <stop offset="100%" stopColor="#891527" />
              </linearGradient>
            </defs>
            <rect width="30" height="30" rx="8" fill="url(#kansa-nav-grad)" />
            <rect x="7" y="16" width="4.5" height="7" rx="1.5" fill="rgba(255,255,255,0.35)" />
            <rect x="12.75" y="11" width="4.5" height="12" rx="1.5" fill="rgba(255,255,255,0.65)" />
            <rect x="18.5" y="7" width="4.5" height="16" rx="1.5" fill="white" />
          </svg>
          <span style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.4px" }}>
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
            border: "1px solid rgba(255,255,255,0.06)",
            background: "#0d0d20",
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
              background: "linear-gradient(135deg, #c41e3a, #f87171)",
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
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  background: "rgba(196, 30, 58, 0.08)",
                  border: "1px solid rgba(196, 30, 58, 0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "18px",
                  color: "#c41e3a",
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
              { path: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", name: "Scout", desc: "Scrapes and extracts structured data from any ecommerce platform" },
              { path: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", name: "Auditor", desc: "Scores every aspect of your listing against best practices" },
              { path: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z", name: "Spy", desc: "Competitive intel — tracks pricing, reviews, and market trends" },
              { path: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z", name: "Copywriter", desc: "Generates SEO-optimized titles, descriptions, and bullet points" },
              { path: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z", name: "Strategist", desc: "Creates actionable plans with quick wins and long-term plays" },
              { path: "M13 10V3L4 14h7v7l9-11h-7z", name: "Pusher", desc: "Pushes approved changes directly to your store via API" },
            ].map((agent) => (
              <div key={agent.name} className="card-hover" style={{ textAlign: "left", background: "#0d0d20", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "14px", padding: "24px" }}>
                <div style={{ marginBottom: "10px" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c41e3a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={agent.path} /></svg>
                </div>
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
          borderTop: "1px solid rgba(255,255,255,0.04)",
          color: "#64748b",
          fontSize: "13px",
        }}
      >
        Kansa &mdash; AI that runs your ecommerce store.
      </footer>
    </div>
  );
}
