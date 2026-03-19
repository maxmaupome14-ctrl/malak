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
      <nav style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "20px 40px", borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <svg width="36" height="36" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="kansa-nav-grad" x1="0" y1="0" x2="30" y2="30" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#e94560" />
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
        <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
          <Link href="/pricing" style={{ color: "#94a3b8", fontSize: "14px", textDecoration: "none", fontWeight: 500 }}>
            Pricing
          </Link>
          <Link href="/login" style={{ color: "#94a3b8", fontSize: "14px", textDecoration: "none", fontWeight: 500 }}>
            Sign In
          </Link>
          <Link
            href="/audit"
            style={{
              padding: "10px 20px", borderRadius: "8px", fontSize: "14px", fontWeight: 600,
              background: "linear-gradient(135deg, #e94560, #c41e3a)", color: "#fff",
              textDecoration: "none", boxShadow: "0 0 20px rgba(233, 69, 96, 0.3)",
            }}
          >
            Free Audit
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", padding: "80px 20px", textAlign: "center",
      }}>
        {/* Product badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          padding: "6px 16px", borderRadius: "999px",
          background: "linear-gradient(135deg, rgba(233,69,96,0.1), rgba(196,30,58,0.05))",
          border: "1px solid rgba(233,69,96,0.2)",
          marginBottom: "32px",
        }}>
          <span style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: "#e94560", boxShadow: "0 0 8px #e94560",
          }} />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#e94560", letterSpacing: "0.03em" }}>
            Amazon Optimizer
          </span>
        </div>

        <h1 style={{
          fontSize: "clamp(40px, 6vw, 72px)", fontWeight: 800,
          lineHeight: 1.05, maxWidth: "850px", color: "#f1f5f9",
          margin: "0 0 24px", letterSpacing: "-0.03em",
        }}>
          Optimize your Amazon listing.{" "}
          <span style={{
            background: "linear-gradient(135deg, #e94560, #f87171)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            Prove it worked.
          </span>
        </h1>

        <p style={{
          fontSize: "18px", color: "#94a3b8", maxWidth: "580px",
          lineHeight: 1.7, margin: "0 0 48px",
        }}>
          AI audits your listing across 6 dimensions, finds every fixable issue,
          and measures the impact in 30 days. Not vibes &mdash; proof.
        </p>

        {/* Hero CTA — URL input */}
        <div style={{
          display: "flex", gap: "8px", width: "100%", maxWidth: "620px",
          padding: "6px", borderRadius: "14px",
          background: "#0c0c1d", border: "1px solid #1e293b",
          marginBottom: "16px",
        }}>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAudit()}
            placeholder="Paste your Amazon product URL..."
            style={{
              flex: 1, fontSize: "16px", padding: "14px 20px",
              background: "transparent", border: "none", outline: "none",
              color: "#f1f5f9", fontFamily: "inherit",
            }}
          />
          <button
            onClick={handleAudit}
            style={{
              padding: "14px 28px", borderRadius: "10px", border: "none",
              background: "linear-gradient(135deg, #e94560, #c41e3a)",
              color: "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer",
              boxShadow: "0 0 20px rgba(233, 69, 96, 0.3)",
              whiteSpace: "nowrap",
            }}
          >
            Audit Free
          </button>
        </div>

        <p style={{ fontSize: "13px", color: "#475569", marginBottom: "80px" }}>
          No account needed &middot; Works on all 14 Amazon marketplaces &middot; Results in 30 seconds
        </p>

        {/* How it works — the loop */}
        <div style={{ width: "100%", maxWidth: "900px", marginBottom: "100px" }}>
          <h2 style={{
            fontSize: "32px", fontWeight: 700, color: "#f1f5f9",
            marginBottom: "12px", letterSpacing: "-0.02em",
          }}>
            Audit. Fix. Measure.
          </h2>
          <p style={{ color: "#64748b", fontSize: "16px", marginBottom: "48px", maxWidth: "500px", margin: "0 auto 48px" }}>
            The only optimizer that proves its value in 30 days.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }}>
            {[
              {
                step: "1",
                title: "Audit",
                subtitle: "FREE",
                desc: "Paste any Amazon URL. AI scores your listing across 6 dimensions and identifies every fixable issue.",
                color: "#e94560",
              },
              {
                step: "2",
                title: "Fix",
                subtitle: "TOKENS",
                desc: "One-click AI fixes for each issue. Rewritten titles, bullets, descriptions, keyword strategies. Before/after diff.",
                color: "#f59e0b",
              },
              {
                step: "3",
                title: "Measure",
                subtitle: "PROOF",
                desc: "Connect Seller Central. Track BSR, sessions, conversion, revenue. 30-day report proves the fix worked.",
                color: "#22c55e",
              },
            ].map((item) => (
              <div key={item.step} style={{
                padding: "28px", borderRadius: "16px",
                background: "#0c0c1d", border: "1px solid #1e293b",
                textAlign: "left",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px",
                }}>
                  <div style={{
                    width: "40px", height: "40px", borderRadius: "10px",
                    background: `${item.color}15`, border: `1px solid ${item.color}30`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 800, fontSize: "18px", color: item.color,
                  }}>
                    {item.step}
                  </div>
                  <div>
                    <span style={{ fontSize: "18px", fontWeight: 700, color: "#f1f5f9" }}>
                      {item.title}
                    </span>
                    <span style={{
                      marginLeft: "8px", fontSize: "11px", fontWeight: 700,
                      color: item.color, padding: "2px 6px", borderRadius: "4px",
                      background: `${item.color}15`, letterSpacing: "0.05em",
                    }}>
                      {item.subtitle}
                    </span>
                  </div>
                </div>
                <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: 1.6, margin: 0 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 6 Dimensions */}
        <div style={{ width: "100%", maxWidth: "900px", marginBottom: "100px" }}>
          <h2 style={{
            fontSize: "28px", fontWeight: 700, color: "#f1f5f9",
            marginBottom: "12px", letterSpacing: "-0.02em",
          }}>
            6 Dimensions. Every Issue Found.
          </h2>
          <p style={{ color: "#64748b", fontSize: "15px", marginBottom: "40px" }}>
            Powered by Claude Opus 4.6 — the most capable AI model available.
          </p>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "12px",
          }}>
            {[
              { cat: "Title", cost: 5, desc: "Keywords, length, brand position, search optimization" },
              { cat: "Bullets", cost: 8, desc: "Benefits vs features, completeness, keyword density" },
              { cat: "Description", cost: 8, desc: "A+ content quality, SEO structure, conversion copy" },
              { cat: "Images", cost: 3, desc: "Count, quality, infographics, lifestyle shots, video" },
              { cat: "Keywords", cost: 5, desc: "Backend search terms, gaps, long-tail opportunities" },
              { cat: "Competitive", cost: 10, desc: "Price position, review gap, market share, strategy" },
            ].map((item) => (
              <div key={item.cat} style={{
                padding: "20px", borderRadius: "12px",
                background: "#0c0c1d", border: "1px solid #1e293b",
                textAlign: "left",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "15px", fontWeight: 600, color: "#f1f5f9" }}>
                    {item.cat}
                  </span>
                  <span style={{
                    fontSize: "11px", fontWeight: 700, color: "#e94560",
                    padding: "2px 8px", borderRadius: "4px",
                    background: "rgba(233,69,96,0.1)",
                  }}>
                    Fix: {item.cost} tokens
                  </span>
                </div>
                <p style={{ color: "#64748b", fontSize: "13px", lineHeight: 1.5, margin: 0 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Token Pricing */}
        <div style={{ width: "100%", maxWidth: "900px", marginBottom: "100px" }}>
          <h2 style={{
            fontSize: "28px", fontWeight: 700, color: "#f1f5f9",
            marginBottom: "12px", letterSpacing: "-0.02em",
          }}>
            Simple Token Pricing
          </h2>
          <p style={{ color: "#64748b", fontSize: "15px", marginBottom: "40px" }}>
            Buy tokens, spend them on fixes. No subscriptions. Tokens never expire.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
            {[
              { name: "Starter", tokens: 30, price: 9, perToken: "0.30", popular: false },
              { name: "Pro", tokens: 120, price: 29, perToken: "0.24", popular: true },
              { name: "Beast", tokens: 500, price: 99, perToken: "0.20", popular: false },
              { name: "Agency", tokens: 2000, price: 299, perToken: "0.15", popular: false },
            ].map((pack) => (
              <div key={pack.name} style={{
                padding: "28px 24px", borderRadius: "16px",
                background: pack.popular ? "linear-gradient(135deg, rgba(233,69,96,0.08), rgba(196,30,58,0.04))" : "#0c0c1d",
                border: pack.popular ? "1px solid rgba(233,69,96,0.3)" : "1px solid #1e293b",
                textAlign: "center", position: "relative",
              }}>
                {pack.popular && (
                  <div style={{
                    position: "absolute", top: "-10px", left: "50%", transform: "translateX(-50%)",
                    fontSize: "11px", fontWeight: 700, color: "#e94560",
                    padding: "3px 12px", borderRadius: "999px",
                    background: "rgba(233,69,96,0.15)", border: "1px solid rgba(233,69,96,0.3)",
                    letterSpacing: "0.05em", textTransform: "uppercase",
                  }}>
                    Most Popular
                  </div>
                )}
                <div style={{ fontSize: "15px", fontWeight: 600, color: "#f1f5f9", marginBottom: "4px" }}>
                  {pack.name}
                </div>
                <div style={{ fontSize: "36px", fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.03em" }}>
                  ${pack.price}
                </div>
                <div style={{ fontSize: "14px", color: "#64748b", marginBottom: "16px" }}>
                  {pack.tokens} tokens
                </div>
                <div style={{
                  fontSize: "12px", color: "#94a3b8",
                  padding: "6px 0", borderTop: "1px solid #1e293b",
                }}>
                  ${pack.perToken}/token
                </div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: "13px", color: "#475569", marginTop: "16px" }}>
            10 free tokens on signup &middot; Enough to fix your first issue
          </p>
        </div>

        {/* Global Coverage */}
        <div style={{ width: "100%", maxWidth: "900px", marginBottom: "100px" }}>
          <h2 style={{
            fontSize: "28px", fontWeight: 700, color: "#f1f5f9",
            marginBottom: "12px", letterSpacing: "-0.02em",
          }}>
            14 Amazon Marketplaces. One Tool.
          </h2>
          <p style={{ color: "#64748b", fontSize: "15px", marginBottom: "32px" }}>
            Marketplace-aware scoring adapts to local language, keywords, and search behavior.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px" }}>
            {[
              "US", "Mexico", "Brazil", "UK", "Germany", "Spain",
              "France", "Italy", "Japan", "India", "UAE", "Saudi Arabia",
              "Canada", "Australia",
            ].map((country) => (
              <span key={country} style={{
                fontSize: "13px", color: "#94a3b8", padding: "8px 16px",
                borderRadius: "8px", background: "#0c0c1d", border: "1px solid #1e293b",
                fontWeight: 500,
              }}>
                {country}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div style={{
          width: "100%", maxWidth: "620px", padding: "48px 40px",
          borderRadius: "20px",
          background: "linear-gradient(135deg, rgba(233,69,96,0.08), rgba(196,30,58,0.04))",
          border: "1px solid rgba(233,69,96,0.2)",
          textAlign: "center", marginBottom: "40px",
        }}>
          <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#f1f5f9", marginBottom: "12px" }}>
            See what&apos;s wrong with your listing
          </h2>
          <p style={{ color: "#64748b", fontSize: "15px", marginBottom: "24px" }}>
            Free audit. No account. 30 seconds.
          </p>
          <button
            onClick={handleAudit}
            style={{
              padding: "16px 40px", borderRadius: "12px", border: "none",
              background: "linear-gradient(135deg, #e94560, #c41e3a)",
              color: "#fff", fontSize: "16px", fontWeight: 700, cursor: "pointer",
              boxShadow: "0 0 30px rgba(233, 69, 96, 0.4)",
            }}
          >
            Audit My Listing
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        textAlign: "center", padding: "32px",
        borderTop: "1px solid rgba(255,255,255,0.04)",
        color: "#475569", fontSize: "13px",
      }}>
        Kansa &mdash; Optimize your Amazon listing. Prove it worked.
      </footer>
    </div>
  );
}
