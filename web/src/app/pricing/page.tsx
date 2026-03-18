"use client";

import Link from "next/link";

const CHECK = "\u2713";

export default function PricingPage() {
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
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
          <svg width="36" height="36" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="kansa-price-grad" x1="0" y1="0" x2="30" y2="30" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#c41e3a" />
                <stop offset="100%" stopColor="#891527" />
              </linearGradient>
            </defs>
            <rect width="30" height="30" rx="8" fill="url(#kansa-price-grad)" />
            <rect x="7" y="16" width="4.5" height="7" rx="1.5" fill="rgba(255,255,255,0.35)" />
            <rect x="12.75" y="11" width="4.5" height="12" rx="1.5" fill="rgba(255,255,255,0.65)" />
            <rect x="18.5" y="7" width="4.5" height="16" rx="1.5" fill="white" />
          </svg>
          <span style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.4px" }}>Kansa</span>
        </Link>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <Link href="/login" className="btn-secondary">Sign In</Link>
          <Link href="/dashboard" className="btn-primary">Get Started</Link>
        </div>
      </nav>

      <main style={{ flex: 1, padding: "80px 20px", maxWidth: "1000px", margin: "0 auto", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: "64px" }}>
          <h1 style={{ fontSize: "40px", fontWeight: 800, color: "#f1f5f9", marginBottom: "16px" }}>
            Simple, Transparent Pricing
          </h1>
          <p style={{ fontSize: "18px", color: "#94a3b8", maxWidth: "500px", margin: "0 auto" }}>
            BYOK model &mdash; bring your own Shopify and AI keys. You only pay for Kansa&apos;s agent intelligence.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "24px" }}>
          {/* Free */}
          <div className="card" style={{ padding: "32px", display: "flex", flexDirection: "column" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#94a3b8", marginBottom: "8px" }}>Free</h3>
            <div style={{ fontSize: "40px", fontWeight: 800, color: "#f1f5f9", marginBottom: "8px" }}>
              $0
            </div>
            <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "32px" }}>No account needed</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, flex: 1 }}>
              {[
                "Audit any product URL",
                "AI-generated copy",
                "Competitive intelligence",
                "Strategy & action plan",
              ].map((f) => (
                <li key={f} style={{ padding: "8px 0", fontSize: "14px", color: "#94a3b8", display: "flex", gap: "8px" }}>
                  <span style={{ color: "#22c55e" }}>{CHECK}</span> {f}
                </li>
              ))}
            </ul>
            <Link
              href="/audit"
              className="btn-secondary"
              style={{ display: "block", textAlign: "center", marginTop: "24px", padding: "12px" }}
            >
              Try Free Audit
            </Link>
          </div>

          {/* Monthly */}
          <div
            className="card"
            style={{
              padding: "32px",
              display: "flex",
              flexDirection: "column",
              border: "2px solid #c41e3a",
              position: "relative",
            }}
          >
            <div style={{
              position: "absolute",
              top: "-12px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "linear-gradient(135deg, #c41e3a, #b91c1c)",
              color: "white",
              fontSize: "12px",
              fontWeight: 700,
              padding: "4px 16px",
              borderRadius: "12px",
            }}>
              MOST POPULAR
            </div>
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#f1f5f9", marginBottom: "8px" }}>Pro Monthly</h3>
            <div style={{ fontSize: "40px", fontWeight: 800, color: "#f1f5f9", marginBottom: "8px" }}>
              $99<span style={{ fontSize: "16px", fontWeight: 400, color: "#64748b" }}>/mo</span>
            </div>
            <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "32px" }}>Cancel anytime</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, flex: 1 }}>
              {[
                "Everything in Free",
                "Connect Shopify stores",
                "Auto-generate optimizations",
                "One-click push to store",
                "Bulk product optimization",
                "Priority AI processing",
              ].map((f) => (
                <li key={f} style={{ padding: "8px 0", fontSize: "14px", color: "#e2e8f0", display: "flex", gap: "8px" }}>
                  <span style={{ color: "#22c55e" }}>{CHECK}</span> {f}
                </li>
              ))}
            </ul>
            <Link
              href="/dashboard"
              className="btn-primary"
              style={{ display: "block", textAlign: "center", marginTop: "24px", padding: "12px" }}
            >
              Start Free Trial
            </Link>
          </div>

          {/* Lifetime */}
          <div className="card" style={{ padding: "32px", display: "flex", flexDirection: "column" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#94a3b8", marginBottom: "8px" }}>Lifetime</h3>
            <div style={{ fontSize: "40px", fontWeight: 800, color: "#f1f5f9", marginBottom: "8px" }}>
              $1,000
            </div>
            <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "32px" }}>One-time payment, forever access</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, flex: 1 }}>
              {[
                "Everything in Pro",
                "Lifetime access",
                "All future features",
                "Early access to new agents",
                "Priority support",
              ].map((f) => (
                <li key={f} style={{ padding: "8px 0", fontSize: "14px", color: "#94a3b8", display: "flex", gap: "8px" }}>
                  <span style={{ color: "#22c55e" }}>{CHECK}</span> {f}
                </li>
              ))}
            </ul>
            <Link
              href="/dashboard"
              className="btn-secondary"
              style={{ display: "block", textAlign: "center", marginTop: "24px", padding: "12px" }}
            >
              Get Lifetime Access
            </Link>
          </div>
        </div>

        {/* BYOK Explanation */}
        <div style={{ marginTop: "64px", textAlign: "center" }}>
          <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#f1f5f9", marginBottom: "16px" }}>
            BYOK &mdash; Bring Your Own Keys
          </h2>
          <p style={{ fontSize: "15px", color: "#94a3b8", maxWidth: "600px", margin: "0 auto", lineHeight: 1.7 }}>
            You provide your own Shopify OAuth and AI API keys (OpenAI, Claude, Google).
            Kansa only charges for the agent intelligence that orchestrates everything.
            Zero marginal cost per user means we can keep prices low forever.
          </p>
        </div>
      </main>

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
