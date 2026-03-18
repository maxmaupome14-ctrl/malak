"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/auth-guard";
import { api, ApiError } from "@/lib/api";

/* ───────────────────── Types ───────────────────── */

type ConnectionMethod = "oauth" | "token";

interface OAuthResponse {
  authorize_url: string;
}

interface TokenResponse {
  ok: boolean;
  store_name: string;
  store_id: string;
}

/* ───────────────────── Step Indicator ───────────────────── */

function StepIndicator({ currentStep }: { currentStep: number }) {
  const steps = [
    { num: 1, label: "Enter Domain" },
    { num: 2, label: "Authorize" },
    { num: 3, label: "Connected" },
  ];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0",
        marginBottom: "36px",
      }}
    >
      {steps.map((step, i) => (
        <div key={step.num} style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
                fontWeight: 700,
                transition: "all 0.3s ease",
                background:
                  currentStep > step.num
                    ? "#22c55e"
                    : currentStep === step.num
                    ? "#e94560"
                    : "#1a1a2e",
                color:
                  currentStep >= step.num ? "#fff" : "#64748b",
                border:
                  currentStep >= step.num
                    ? "2px solid transparent"
                    : "2px solid #334155",
              }}
            >
              {currentStep > step.num ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3.5 8.5L6.5 11.5L12.5 4.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                step.num
              )}
            </div>
            <span
              style={{
                fontSize: "11px",
                fontWeight: currentStep === step.num ? 600 : 400,
                color: currentStep >= step.num ? "#f1f5f9" : "#64748b",
                whiteSpace: "nowrap",
              }}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              style={{
                width: "60px",
                height: "2px",
                background: currentStep > step.num ? "#22c55e" : "#334155",
                marginLeft: "12px",
                marginRight: "12px",
                marginBottom: "20px",
                transition: "background 0.3s ease",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ───────────────────── Error Banner ───────────────────── */

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      style={{
        background: "rgba(239, 68, 68, 0.1)",
        border: "1px solid rgba(239, 68, 68, 0.3)",
        borderRadius: "10px",
        padding: "14px 16px",
        marginBottom: "24px",
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        style={{ flexShrink: 0, marginTop: "1px" }}
      >
        <circle cx="9" cy="9" r="8" stroke="#fca5a5" strokeWidth="1.5" />
        <path d="M9 5.5V9.5" stroke="#fca5a5" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="9" cy="12" r="0.75" fill="#fca5a5" />
      </svg>
      <span style={{ color: "#fca5a5", fontSize: "13px", lineHeight: "1.5", flex: 1 }}>
        {message}
      </span>
      <button
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          color: "#fca5a5",
          cursor: "pointer",
          padding: "0",
          fontSize: "16px",
          lineHeight: "1",
          flexShrink: 0,
        }}
        aria-label="Dismiss error"
      >
        &times;
      </button>
    </div>
  );
}

/* ───────────────────── Success Screen ───────────────────── */

function SuccessScreen({ storeName }: { storeName: string }) {
  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div
        style={{
          width: "72px",
          height: "72px",
          borderRadius: "50%",
          background: "rgba(34, 197, 94, 0.15)",
          border: "2px solid rgba(34, 197, 94, 0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 20px",
        }}
      >
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path
            d="M8 16.5L13.5 22L24 10"
            stroke="#22c55e"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 style={{ fontSize: "22px", fontWeight: 700, color: "#f1f5f9", marginBottom: "8px" }}>
        Store Connected!
      </h2>
      <p style={{ color: "#94a3b8", fontSize: "15px", marginBottom: "8px" }}>
        <strong style={{ color: "#f1f5f9" }}>{storeName}</strong> is now linked to Malak.
      </p>
      <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "28px" }}>
        Syncing your products now... Redirecting to dashboard.
      </p>
      <div
        style={{
          width: "40px",
          height: "40px",
          border: "3px solid #334155",
          borderTop: "3px solid #e94560",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
          margin: "0 auto",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ───────────────────── Method Cards (Selector) ───────────────────── */

function MethodSelector({
  selected,
  onSelect,
}: {
  selected: ConnectionMethod;
  onSelect: (m: ConnectionMethod) => void;
}) {
  const methods: { key: ConnectionMethod; title: string; desc: string; tag?: string }[] = [
    {
      key: "oauth",
      title: "Connect via Shopify",
      desc: "Authorize through Shopify's secure OAuth flow. Best for most users.",
      tag: "Recommended",
    },
    {
      key: "token",
      title: "Use Access Token",
      desc: "Paste a custom app access token directly. For developers and advanced setups.",
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "28px" }}>
      {methods.map((m) => {
        const isActive = selected === m.key;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onSelect(m.key)}
            style={{
              position: "relative",
              background: isActive ? "rgba(233, 69, 96, 0.08)" : "#16162a",
              border: isActive ? "2px solid #e94560" : "2px solid #1e293b",
              borderRadius: "12px",
              padding: "20px 18px",
              textAlign: "left",
              cursor: "pointer",
              transition: "all 0.2s ease",
              outline: "none",
            }}
          >
            {m.tag && (
              <span
                style={{
                  position: "absolute",
                  top: "10px",
                  right: "10px",
                  background: isActive ? "#e94560" : "#334155",
                  color: "#fff",
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: "6px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  transition: "background 0.2s ease",
                }}
              >
                {m.tag}
              </span>
            )}
            <div
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                border: isActive ? "2px solid #e94560" : "2px solid #475569",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "14px",
                transition: "border-color 0.2s ease",
              }}
            >
              {isActive && (
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: "#e94560",
                  }}
                />
              )}
            </div>
            <h3
              style={{
                fontSize: "15px",
                fontWeight: 600,
                color: isActive ? "#f1f5f9" : "#94a3b8",
                marginBottom: "6px",
                transition: "color 0.2s ease",
              }}
            >
              {m.title}
            </h3>
            <p
              style={{
                fontSize: "12px",
                lineHeight: "1.5",
                color: "#64748b",
                margin: 0,
              }}
            >
              {m.desc}
            </p>
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────── Main Connect Content ───────────────────── */

function ConnectContent() {
  const router = useRouter();
  const [method, setMethod] = useState<ConnectionMethod>("oauth");
  const [shopDomain, setShopDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [connectedStore, setConnectedStore] = useState<string | null>(null);

  const cleanDomain = useCallback((raw: string) => {
    let d = raw.trim().toLowerCase();
    // Strip protocol if pasted
    d = d.replace(/^https?:\/\//, "");
    // Strip trailing slash
    d = d.replace(/\/+$/, "");
    // If they pasted admin.shopify.com/store/xxx, extract the store name
    const adminMatch = d.match(/admin\.shopify\.com\/store\/([a-z0-9-]+)/);
    if (adminMatch) {
      d = `${adminMatch[1]}.myshopify.com`;
    }
    // If they just typed the store name without .myshopify.com, add it
    if (d && !d.includes(".")) {
      d = `${d}.myshopify.com`;
    }
    return d;
  }, []);

  const triggerSync = useCallback(
    async (storeId?: string) => {
      try {
        // Attempt to trigger a product sync; ignore errors since it's non-critical
        await api.post("/products/sync", storeId ? { store_id: storeId } : undefined);
      } catch {
        // Sync trigger is best-effort
      }
    },
    []
  );

  const handleOAuthConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const domain = cleanDomain(shopDomain);
    if (!domain) {
      setError("Please enter your Shopify store domain.");
      setLoading(false);
      return;
    }

    try {
      setCurrentStep(2);
      const result = await api.post<OAuthResponse>("/oauth/shopify/connect", {
        shop_domain: domain,
      });
      // Redirect to Shopify authorization
      window.location.href = result.authorize_url;
    } catch (err) {
      setCurrentStep(1);
      if (err instanceof ApiError) {
        if (err.status === 422) {
          setError(
            "Invalid store domain. Make sure it looks like your-store.myshopify.com"
          );
        } else if (err.status === 409) {
          setError("This store is already connected. Check your dashboard.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Connection failed. Please check your domain and try again.");
      }
      setLoading(false);
    }
  };

  const handleTokenConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const domain = cleanDomain(shopDomain);
    if (!domain) {
      setError("Please enter your Shopify store domain.");
      setLoading(false);
      return;
    }

    const token = accessToken.trim();
    if (!token) {
      setError("Please enter your access token.");
      setLoading(false);
      return;
    }

    if (!token.startsWith("shpat_") && !token.startsWith("shpca_") && !token.startsWith("shppa_")) {
      setError(
        "That doesn't look like a valid Shopify access token. Tokens usually start with shpat_, shpca_, or shppa_."
      );
      setLoading(false);
      return;
    }

    try {
      setCurrentStep(2);
      const result = await api.post<TokenResponse>("/oauth/shopify/connect-token", {
        shop_domain: domain,
        access_token: token,
      });

      setCurrentStep(3);
      setConnectedStore(result.store_name || domain);

      // Trigger product sync
      await triggerSync(result.store_id);

      // Redirect after a brief moment so the user sees the success state
      setTimeout(() => {
        router.push("/dashboard");
      }, 2500);
    } catch (err) {
      setCurrentStep(1);
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError(
            "Invalid access token. Double check the token and make sure it has the required permissions."
          );
        } else if (err.status === 422) {
          setError(
            "Invalid store domain or token format. Please check both fields."
          );
        } else if (err.status === 409) {
          setError("This store is already connected. Check your dashboard.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Connection failed. Please try again.");
      }
      setLoading(false);
    }
  };

  // ── Success state ──
  if (connectedStore && currentStep === 3) {
    return (
      <div style={{ maxWidth: "560px", margin: "0 auto" }}>
        <StepIndicator currentStep={3} />
        <div
          style={{
            background: "#16162a",
            border: "1px solid #1e293b",
            borderRadius: "16px",
            padding: "40px 32px",
          }}
        >
          <SuccessScreen storeName={connectedStore} />
        </div>
      </div>
    );
  }

  // ── Main form ──
  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <Link
          href="/dashboard"
          style={{
            color: "#94a3b8",
            fontSize: "13px",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            marginBottom: "16px",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M8.5 3L4.5 7L8.5 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to Dashboard
        </Link>
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 700,
            color: "#f1f5f9",
            marginBottom: "6px",
          }}
        >
          Connect Your Store
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "15px", margin: 0 }}>
          Link your Shopify store to import products, run audits, and optimize your listings.
        </p>
      </div>

      {/* Content area */}
      <div style={{ maxWidth: "560px" }}>
        {/* Step indicator */}
        <StepIndicator currentStep={currentStep} />

        {/* Method selector cards */}
        <MethodSelector selected={method} onSelect={(m) => { setMethod(m); setError(null); }} />

        {/* Form card */}
        <div
          style={{
            background: "#16162a",
            border: "1px solid #1e293b",
            borderRadius: "16px",
            padding: "28px 24px",
          }}
        >
          {/* Shopify logo + label */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "24px",
              paddingBottom: "20px",
              borderBottom: "1px solid #1e293b",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #96bf48, #5e8e3e)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="20" height="22" viewBox="0 0 20 22" fill="none">
                <path
                  d="M15.5 4.5C15.5 4.5 15 4.3 14.3 4.3C13.1 4.3 11.6 5 10.8 6.8C10.8 6.8 9.4 4 7 4C4.5 4 2.5 6.2 2.5 9.5C2.5 14 6.5 18.5 10 21C13.5 18.5 17.5 14 17.5 9.5C17.5 7 16.8 5.3 15.5 4.5Z"
                  fill="white"
                  fillOpacity="0.9"
                />
              </svg>
            </div>
            <div>
              <h2
                style={{
                  fontSize: "17px",
                  fontWeight: 600,
                  color: "#f1f5f9",
                  margin: 0,
                }}
              >
                {method === "oauth" ? "Shopify OAuth" : "Direct Access Token"}
              </h2>
              <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>
                {method === "oauth"
                  ? "Secure authorization through Shopify"
                  : "Connect using a custom app token"}
              </p>
            </div>
          </div>

          {/* Error banner */}
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

          {/* Form */}
          <form onSubmit={method === "oauth" ? handleOAuthConnect : handleTokenConnect}>
            {/* Domain field (both methods) */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#94a3b8",
                  marginBottom: "6px",
                }}
              >
                Store Domain
              </label>
              <input
                type="text"
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                placeholder="your-store.myshopify.com"
                disabled={loading}
                required
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  background: "#1a1a2e",
                  border: "1px solid #334155",
                  borderRadius: "10px",
                  color: "#f1f5f9",
                  fontSize: "14px",
                  outline: "none",
                  transition: "border-color 0.2s ease",
                  boxSizing: "border-box",
                  opacity: loading ? 0.6 : 1,
                }}
                onFocus={(e) => (e.target.style.borderColor = "#e94560")}
                onBlur={(e) => (e.target.style.borderColor = "#334155")}
              />
              <p
                style={{
                  color: "#64748b",
                  fontSize: "12px",
                  marginTop: "8px",
                  lineHeight: "1.5",
                  margin: "8px 0 0 0",
                }}
              >
                Find your domain in your Shopify admin URL:{" "}
                <span style={{ color: "#94a3b8", fontFamily: "monospace", fontSize: "11px" }}>
                  https://admin.shopify.com/store/
                  <strong style={{ color: "#e94560" }}>YOUR-STORE</strong>
                </span>
              </p>
            </div>

            {/* Access token field (token method only) */}
            {method === "token" && (
              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "#94a3b8",
                    marginBottom: "6px",
                  }}
                >
                  Access Token
                </label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="shpat_xxxxxxxxxxxxxxxxxxxxx"
                  disabled={loading}
                  required
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    background: "#1a1a2e",
                    border: "1px solid #334155",
                    borderRadius: "10px",
                    color: "#f1f5f9",
                    fontSize: "14px",
                    fontFamily: "monospace",
                    outline: "none",
                    transition: "border-color 0.2s ease",
                    boxSizing: "border-box",
                    opacity: loading ? 0.6 : 1,
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#e94560")}
                  onBlur={(e) => (e.target.style.borderColor = "#334155")}
                />
                <p
                  style={{
                    color: "#64748b",
                    fontSize: "12px",
                    marginTop: "8px",
                    lineHeight: "1.5",
                    margin: "8px 0 0 0",
                  }}
                >
                  In Shopify Admin: Settings &rarr; Apps and sales channels &rarr; Develop apps
                  &rarr; Your app &rarr; API credentials
                </p>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "13px 20px",
                background: loading
                  ? "linear-gradient(135deg, #7a2535, #5e1c2a)"
                  : "linear-gradient(135deg, #e94560, #c73650)",
                border: "none",
                borderRadius: "10px",
                color: "#fff",
                fontSize: "15px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
                opacity: loading ? 0.8 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
              }}
            >
              {loading ? (
                <>
                  <div
                    style={{
                      width: "18px",
                      height: "18px",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTop: "2px solid #fff",
                      borderRadius: "50%",
                      animation: "spin 0.7s linear infinite",
                    }}
                  />
                  {method === "oauth" ? "Redirecting to Shopify..." : "Verifying token..."}
                </>
              ) : method === "oauth" ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M6 2L10 8L6 14"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Connect with Shopify
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="7" width="12" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M5 7V5C5 3.34 6.34 2 8 2C9.66 2 11 3.34 11 5V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  Connect with Token
                </>
              )}
            </button>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </form>
        </div>

        {/* Permissions info */}
        <div
          style={{
            marginTop: "20px",
            padding: "16px 18px",
            background: "rgba(59, 130, 246, 0.06)",
            border: "1px solid rgba(59, 130, 246, 0.15)",
            borderRadius: "12px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              style={{ flexShrink: 0, marginTop: "1px" }}
            >
              <circle cx="9" cy="9" r="8" stroke="#60a5fa" strokeWidth="1.5" />
              <path d="M9 8V12.5" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="9" cy="5.75" r="0.75" fill="#60a5fa" />
            </svg>
            <div>
              <p
                style={{
                  color: "#94a3b8",
                  fontSize: "13px",
                  lineHeight: "1.6",
                  margin: "0 0 8px 0",
                  fontWeight: 500,
                }}
              >
                Permissions requested:
              </p>
              <ul
                style={{
                  color: "#64748b",
                  fontSize: "12px",
                  lineHeight: "1.8",
                  margin: 0,
                  paddingLeft: "16px",
                }}
              >
                <li>
                  <strong style={{ color: "#94a3b8" }}>Products</strong> &mdash; read &amp; write
                  (to sync and optimize listings)
                </li>
                <li>
                  <strong style={{ color: "#94a3b8" }}>Orders</strong> &mdash; read only (to analyze
                  performance)
                </li>
              </ul>
              <p
                style={{
                  color: "#475569",
                  fontSize: "11px",
                  marginTop: "10px",
                  marginBottom: 0,
                }}
              >
                You can revoke access any time from your Shopify admin.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────── Page Export ───────────────────── */

export default function ConnectPage() {
  return (
    <AuthGuard>
      <ConnectContent />
    </AuthGuard>
  );
}
