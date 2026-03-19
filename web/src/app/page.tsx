"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/* ─── Animated counter ─── */
function AnimatedNumber({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    const start = ref.current;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (value - start) * eased);
      setDisplay(current);
      if (progress < 1) requestAnimationFrame(animate);
      else ref.current = value;
    };
    requestAnimationFrame(animate);
  }, [value, duration]);

  return <>{display}</>;
}

/* ─── Fade-in on scroll ─── */
function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ─── SVG Icons (Lucide-style) ─── */
const Icons = {
  title: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" />
    </svg>
  ),
  bullets: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" />
    </svg>
  ),
  description: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  images: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  keywords: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  competitive: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  arrow: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
};

const DIMENSIONS = [
  { key: "title", label: "Title", cost: 5, desc: "Keywords, length, brand position, search ranking", icon: Icons.title },
  { key: "bullets", label: "Bullet Points", cost: 8, desc: "Benefits vs features, completeness, persuasion", icon: Icons.bullets },
  { key: "description", label: "Description", cost: 8, desc: "A+ content quality, SEO structure, conversion copy", icon: Icons.description },
  { key: "images", label: "Images", cost: 3, desc: "Count, quality, infographics, lifestyle, video", icon: Icons.images },
  { key: "keywords", label: "Keywords", cost: 5, desc: "Backend terms, gaps, long-tail opportunities", icon: Icons.keywords },
  { key: "competitive", label: "Competitive", cost: 10, desc: "Price position, review gap, market strategy", icon: Icons.competitive },
];

const TOKEN_PACKS = [
  { name: "Starter", tokens: 30, price: 9, per: "0.30" },
  { name: "Pro", tokens: 120, price: 29, per: "0.24", popular: true },
  { name: "Beast", tokens: 500, price: 99, per: "0.20" },
  { name: "Agency", tokens: 2000, price: 299, per: "0.15" },
];

const MARKETS = [
  "US", "Mexico", "Brazil", "UK", "Germany", "Spain", "France",
  "Italy", "Japan", "India", "UAE", "Saudi Arabia", "Canada", "Australia",
];

export default function LandingPage() {
  const [url, setUrl] = useState("");
  const router = useRouter();
  const [hoveredDim, setHoveredDim] = useState<string | null>(null);

  const handleAudit = () => {
    if (url.trim()) {
      router.push(`/audit?url=${encodeURIComponent(url.trim())}`);
    } else {
      router.push("/audit");
    }
  };

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>

      {/* ═══ Background Effects ═══ */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(233, 69, 96, 0.08), transparent 70%)",
      }} />
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: `radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)`,
        backgroundSize: "24px 24px",
      }} />

      {/* ═══ Nav ═══ */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 40px", height: "64px",
        background: "rgba(8, 8, 26, 0.8)",
        backdropFilter: "blur(12px) saturate(1.5)",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
          <div style={{
            width: "32px", height: "32px", borderRadius: "8px",
            background: "linear-gradient(135deg, #e94560 0%, #891527 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 16px rgba(233, 69, 96, 0.25)",
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 11V8.5C3 8.22 3.22 8 3.5 8H5.5C5.78 8 6 8.22 6 8.5V11C6 11.28 5.78 11.5 5.5 11.5H3.5C3.22 11.5 3 11.28 3 11Z" fill="rgba(255,255,255,0.4)" />
              <path d="M6.5 11V6C6.5 5.72 6.72 5.5 7 5.5H9C9.28 5.5 9.5 5.72 9.5 6V11C9.5 11.28 9.28 11.5 9 11.5H7C6.72 11.5 6.5 11.28 6.5 11Z" fill="rgba(255,255,255,0.65)" />
              <path d="M10 11V4C10 3.72 10.22 3.5 10.5 3.5H12.5C12.78 3.5 13 3.72 13 4V11C13 11.28 12.78 11.5 12.5 11.5H10.5C10.22 11.5 10 11.28 10 11Z" fill="white" />
            </svg>
          </div>
          <span style={{ fontSize: "18px", fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.5px" }}>
            Kansa
          </span>
        </Link>

        <div style={{ display: "flex", gap: "32px", alignItems: "center" }}>
          <Link href="/pricing" style={{
            color: "#8892a4", fontSize: "14px", textDecoration: "none", fontWeight: 500,
            transition: "color 0.15s",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#f1f5f9"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#8892a4"; }}
          >
            Pricing
          </Link>
          <Link href="/login" style={{
            color: "#8892a4", fontSize: "14px", textDecoration: "none", fontWeight: 500,
            transition: "color 0.15s",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#f1f5f9"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#8892a4"; }}
          >
            Sign In
          </Link>
          <Link
            href="/audit"
            style={{
              padding: "8px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
              background: "#e94560", color: "#fff", textDecoration: "none",
              transition: "all 0.15s",
              boxShadow: "0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#d13a54"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#e94560"; e.currentTarget.style.transform = "translateY(0)"; }}
          >
            Free Audit
          </Link>
        </div>
      </nav>

      {/* ═══ Hero ═══ */}
      <main style={{ position: "relative", zIndex: 1 }}>
        <section style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          paddingTop: "160px", paddingBottom: "120px", paddingLeft: "20px", paddingRight: "20px",
          textAlign: "center",
        }}>
          {/* Badge */}
          <FadeIn>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              padding: "5px 14px 5px 8px", borderRadius: "999px",
              background: "rgba(233, 69, 96, 0.06)",
              border: "1px solid rgba(233, 69, 96, 0.12)",
              marginBottom: "32px",
            }}>
              <span style={{
                width: "20px", height: "20px", borderRadius: "50%",
                background: "rgba(233, 69, 96, 0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{
                  width: "6px", height: "6px", borderRadius: "50%",
                  background: "#e94560",
                  boxShadow: "0 0 8px rgba(233, 69, 96, 0.6)",
                  animation: "pulse-glow 2s ease-in-out infinite",
                }} />
              </span>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#e94560", letterSpacing: "0.02em" }}>
                Amazon Optimizer
              </span>
            </div>
          </FadeIn>

          {/* Headline */}
          <FadeIn delay={80}>
            <h1 style={{
              fontSize: "clamp(36px, 5.5vw, 68px)", fontWeight: 800,
              lineHeight: 1.05, maxWidth: "800px", color: "#f1f5f9",
              margin: "0 0 24px", letterSpacing: "-0.035em",
            }}>
              Optimize your listing.{" "}
              <span style={{
                background: "linear-gradient(135deg, #e94560 0%, #f87171 50%, #e94560 100%)",
                backgroundSize: "200% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                animation: "shimmer 3s linear infinite",
              }}>
                Prove it worked.
              </span>
            </h1>
          </FadeIn>

          <FadeIn delay={160}>
            <p style={{
              fontSize: "17px", color: "#8892a4", maxWidth: "520px",
              lineHeight: 1.7, margin: "0 auto 48px",
            }}>
              AI audits your Amazon listing across 6 dimensions, finds every
              fixable issue, and measures the impact. Not vibes — proof.
            </p>
          </FadeIn>

          {/* URL Input */}
          <FadeIn delay={240}>
            <div style={{
              display: "flex", gap: "0", width: "100%", maxWidth: "580px",
              borderRadius: "12px", overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(13, 13, 32, 0.8)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.02)",
              transition: "border-color 0.2s, box-shadow 0.2s",
            }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "rgba(233, 69, 96, 0.3)";
                e.currentTarget.style.boxShadow = "0 4px 24px rgba(0,0,0,0.3), 0 0 40px rgba(233, 69, 96, 0.06)";
              }}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.boxShadow = "0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.02)";
                }
              }}
            >
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAudit()}
                placeholder="Paste your Amazon product URL..."
                style={{
                  flex: 1, fontSize: "15px", padding: "16px 20px",
                  background: "transparent", border: "none", outline: "none",
                  color: "#f1f5f9", fontFamily: "inherit",
                }}
              />
              <button
                onClick={handleAudit}
                style={{
                  padding: "16px 28px", border: "none",
                  background: "#e94560",
                  color: "#fff", fontSize: "14px", fontWeight: 700, cursor: "pointer",
                  whiteSpace: "nowrap", transition: "background 0.15s",
                  borderLeft: "1px solid rgba(255,255,255,0.06)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#d13a54"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#e94560"; }}
              >
                Audit Free
              </button>
            </div>
          </FadeIn>

          <FadeIn delay={300}>
            <p style={{ fontSize: "13px", color: "#525c6c", marginTop: "16px" }}>
              No account needed · All 14 Amazon marketplaces · Results in 30 seconds
            </p>
          </FadeIn>
        </section>

        {/* ═══ How It Works ═══ */}
        <section style={{
          padding: "0 20px 120px",
          display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: "56px" }}>
              <h2 style={{
                fontSize: "clamp(28px, 3vw, 40px)", fontWeight: 800, color: "#f1f5f9",
                letterSpacing: "-0.03em", marginBottom: "12px",
              }}>
                Audit. Fix. Measure.
              </h2>
              <p style={{ color: "#64748b", fontSize: "16px", maxWidth: "420px", margin: "0 auto" }}>
                The only optimizer that proves its value in 30 days.
              </p>
            </div>
          </FadeIn>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1px",
            width: "100%", maxWidth: "900px",
            background: "rgba(255,255,255,0.04)",
            borderRadius: "16px", overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.04)",
          }}>
            {[
              { step: "01", title: "Audit", tag: "FREE", color: "#e94560", desc: "Paste any Amazon URL. AI scores your listing across 6 dimensions and identifies every fixable issue." },
              { step: "02", title: "Fix", tag: "TOKENS", color: "#f59e0b", desc: "One-click AI fixes. Rewritten titles, bullets, descriptions, keyword strategies. Before/after diff." },
              { step: "03", title: "Measure", tag: "PROOF", color: "#22c55e", desc: "Connect Seller Central. Track BSR, sessions, conversion, revenue. 30-day report proves the fix worked." },
            ].map((item, i) => (
              <FadeIn key={item.step} delay={i * 100}>
                <div style={{
                  padding: "36px 32px", background: "rgba(8, 8, 26, 0.9)",
                  minHeight: "220px", display: "flex", flexDirection: "column",
                }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px",
                  }}>
                    <span style={{
                      fontSize: "12px", fontWeight: 700, color: "#525c6c",
                      fontFamily: "monospace", letterSpacing: "0.05em",
                    }}>
                      {item.step}
                    </span>
                    <span style={{
                      fontSize: "10px", fontWeight: 700, color: item.color,
                      padding: "3px 8px", borderRadius: "4px",
                      background: `${item.color}12`, letterSpacing: "0.08em",
                      border: `1px solid ${item.color}20`,
                    }}>
                      {item.tag}
                    </span>
                  </div>
                  <h3 style={{
                    fontSize: "24px", fontWeight: 700, color: "#f1f5f9",
                    marginBottom: "12px", letterSpacing: "-0.02em",
                  }}>
                    {item.title}
                  </h3>
                  <p style={{
                    color: "#8892a4", fontSize: "14px", lineHeight: 1.65, margin: 0,
                    flex: 1,
                  }}>
                    {item.desc}
                  </p>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* ═══ 6 Dimensions ═══ */}
        <section style={{
          padding: "0 20px 120px",
          display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: "56px" }}>
              <h2 style={{
                fontSize: "clamp(28px, 3vw, 40px)", fontWeight: 800, color: "#f1f5f9",
                letterSpacing: "-0.03em", marginBottom: "12px",
              }}>
                6 Dimensions. Every Issue.
              </h2>
              <p style={{ color: "#64748b", fontSize: "16px" }}>
                Powered by Claude Opus 4.6 — the most capable AI model.
              </p>
            </div>
          </FadeIn>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px",
            width: "100%", maxWidth: "900px",
          }}>
            {DIMENSIONS.map((dim, i) => (
              <FadeIn key={dim.key} delay={i * 60}>
                <div
                  style={{
                    padding: "24px", borderRadius: "12px",
                    background: hoveredDim === dim.key ? "rgba(13, 13, 32, 0.95)" : "rgba(13, 13, 32, 0.6)",
                    border: hoveredDim === dim.key
                      ? "1px solid rgba(233, 69, 96, 0.15)"
                      : "1px solid rgba(255,255,255,0.04)",
                    transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                    cursor: "pointer",
                    transform: hoveredDim === dim.key ? "translateY(-2px)" : "translateY(0)",
                    boxShadow: hoveredDim === dim.key ? "0 8px 32px rgba(0,0,0,0.3)" : "none",
                  }}
                  onMouseEnter={() => setHoveredDim(dim.key)}
                  onMouseLeave={() => setHoveredDim(null)}
                >
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                    marginBottom: "14px",
                  }}>
                    <div style={{ color: "#e94560", opacity: 0.7 }}>{dim.icon}</div>
                    <span style={{
                      fontSize: "11px", fontWeight: 600, color: "#8892a4",
                      padding: "3px 8px", borderRadius: "6px",
                      background: "rgba(255,255,255,0.04)",
                      fontFamily: "monospace",
                    }}>
                      {dim.cost} tokens
                    </span>
                  </div>
                  <h3 style={{
                    fontSize: "15px", fontWeight: 600, color: "#f1f5f9",
                    marginBottom: "6px",
                  }}>
                    {dim.label}
                  </h3>
                  <p style={{ color: "#64748b", fontSize: "13px", lineHeight: 1.55, margin: 0 }}>
                    {dim.desc}
                  </p>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* ═══ Token Pricing ═══ */}
        <section style={{
          padding: "0 20px 120px",
          display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: "56px" }}>
              <h2 style={{
                fontSize: "clamp(28px, 3vw, 40px)", fontWeight: 800, color: "#f1f5f9",
                letterSpacing: "-0.03em", marginBottom: "12px",
              }}>
                Pay per fix. Not per month.
              </h2>
              <p style={{ color: "#64748b", fontSize: "16px" }}>
                Buy tokens. Spend them on fixes. Never expire.
              </p>
            </div>
          </FadeIn>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px",
            width: "100%", maxWidth: "900px",
          }}>
            {TOKEN_PACKS.map((pack, i) => (
              <FadeIn key={pack.name} delay={i * 80}>
                <div style={{
                  padding: "32px 24px", borderRadius: "14px",
                  background: pack.popular
                    ? "linear-gradient(180deg, rgba(233, 69, 96, 0.06) 0%, rgba(8, 8, 26, 0.95) 100%)"
                    : "rgba(13, 13, 32, 0.6)",
                  border: pack.popular
                    ? "1px solid rgba(233, 69, 96, 0.2)"
                    : "1px solid rgba(255,255,255,0.04)",
                  textAlign: "center", position: "relative",
                  transition: "border-color 0.2s, transform 0.2s",
                  cursor: "pointer",
                }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = pack.popular
                      ? "rgba(233, 69, 96, 0.35)"
                      : "rgba(255,255,255,0.08)";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = pack.popular
                      ? "rgba(233, 69, 96, 0.2)"
                      : "rgba(255,255,255,0.04)";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  {pack.popular && (
                    <div style={{
                      position: "absolute", top: "-1px", left: "50%", transform: "translateX(-50%)",
                      width: "50%", height: "2px",
                      background: "linear-gradient(90deg, transparent, #e94560, transparent)",
                    }} />
                  )}
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#8892a4", marginBottom: "16px", letterSpacing: "0.02em" }}>
                    {pack.name}
                  </div>
                  <div style={{
                    fontSize: "40px", fontWeight: 800, color: "#f1f5f9",
                    letterSpacing: "-0.04em", lineHeight: 1, marginBottom: "4px",
                  }}>
                    ${pack.price}
                  </div>
                  <div style={{ fontSize: "14px", color: "#64748b", marginBottom: "20px" }}>
                    <AnimatedNumber value={pack.tokens} /> tokens
                  </div>
                  <div style={{
                    fontSize: "12px", color: "#525c6c",
                    padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.04)",
                    fontFamily: "monospace",
                  }}>
                    ${pack.per} per token
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>

          <FadeIn delay={400}>
            <div style={{
              display: "flex", alignItems: "center", gap: "6px",
              marginTop: "20px", color: "#525c6c", fontSize: "13px",
            }}>
              <span style={{ color: "#22c55e" }}>{Icons.check}</span>
              <span>10 free tokens on signup — enough to fix your first issue</span>
            </div>
          </FadeIn>
        </section>

        {/* ═══ Marketplaces ═══ */}
        <section style={{
          padding: "0 20px 120px",
          display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: "40px" }}>
              <h2 style={{
                fontSize: "clamp(24px, 2.5vw, 32px)", fontWeight: 700, color: "#f1f5f9",
                letterSpacing: "-0.02em", marginBottom: "8px",
              }}>
                14 Amazon Marketplaces
              </h2>
              <p style={{ color: "#64748b", fontSize: "15px" }}>
                Marketplace-aware scoring adapts to local language and search behavior.
              </p>
            </div>
          </FadeIn>

          <FadeIn delay={100}>
            <div style={{
              display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px",
              maxWidth: "700px",
            }}>
              {MARKETS.map((m) => (
                <span key={m} style={{
                  fontSize: "13px", color: "#8892a4", padding: "7px 14px",
                  borderRadius: "8px",
                  background: "rgba(13, 13, 32, 0.6)",
                  border: "1px solid rgba(255,255,255,0.04)",
                  fontWeight: 500, transition: "border-color 0.15s",
                  cursor: "default",
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"; }}
                >
                  {m}
                </span>
              ))}
            </div>
          </FadeIn>
        </section>

        {/* ═══ Bottom CTA ═══ */}
        <section style={{
          padding: "0 20px 80px",
          display: "flex", justifyContent: "center",
        }}>
          <FadeIn>
            <div style={{
              width: "100%", maxWidth: "600px", padding: "48px 40px",
              borderRadius: "20px", textAlign: "center",
              background: "rgba(13, 13, 32, 0.8)",
              border: "1px solid rgba(255,255,255,0.04)",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: "-1px", left: "20%", right: "20%", height: "1px",
                background: "linear-gradient(90deg, transparent, rgba(233, 69, 96, 0.4), transparent)",
              }} />
              <h2 style={{
                fontSize: "28px", fontWeight: 700, color: "#f1f5f9",
                marginBottom: "12px", letterSpacing: "-0.02em",
              }}>
                See what{"'"}s wrong with your listing
              </h2>
              <p style={{ color: "#64748b", fontSize: "15px", marginBottom: "28px" }}>
                Free audit. No account. 30 seconds.
              </p>
              <button
                onClick={handleAudit}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "8px",
                  padding: "14px 32px", borderRadius: "10px", border: "none",
                  background: "#e94560", color: "#fff", fontSize: "15px",
                  fontWeight: 700, cursor: "pointer",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.3), 0 0 24px rgba(233, 69, 96, 0.2)",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#d13a54";
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3), 0 0 32px rgba(233, 69, 96, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#e94560";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.3), 0 0 24px rgba(233, 69, 96, 0.2)";
                }}
              >
                Audit My Listing
                <span style={{ color: "rgba(255,255,255,0.6)" }}>{Icons.arrow}</span>
              </button>
            </div>
          </FadeIn>
        </section>
      </main>

      {/* ═══ Footer ═══ */}
      <footer style={{
        position: "relative", zIndex: 1,
        textAlign: "center", padding: "32px 20px",
        borderTop: "1px solid rgba(255,255,255,0.03)",
      }}>
        <span style={{ color: "#3e4554", fontSize: "13px" }}>
          Kansa — Optimize your Amazon listing. Prove it worked.
        </span>
      </footer>

      {/* ═══ Keyframes ═══ */}
      <style>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.3); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @media (max-width: 768px) {
          nav { padding: 0 20px !important; }
          nav > div:last-child > a:first-child,
          nav > div:last-child > a:nth-child(2) { display: none; }
        }
        @media (max-width: 640px) {
          section > div > div[style*="grid-template-columns: repeat(3"] {
            grid-template-columns: 1fr !important;
          }
          section > div > div[style*="grid-template-columns: repeat(4"] {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}
