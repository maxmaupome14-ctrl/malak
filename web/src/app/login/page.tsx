"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login, register } from "@/lib/auth";
import { ApiError } from "@/lib/api";

function KansaLogo() {
  return (
    <svg width="44" height="44" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="kansa-login-grad" x1="0" y1="0" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#c41e3a" />
          <stop offset="100%" stopColor="#891527" />
        </linearGradient>
      </defs>
      <rect width="30" height="30" rx="8" fill="url(#kansa-login-grad)" />
      <rect x="7" y="16" width="4.5" height="7" rx="1.5" fill="rgba(255,255,255,0.35)" />
      <rect x="12.75" y="11" width="4.5" height="12" rx="1.5" fill="rgba(255,255,255,0.65)" />
      <rect x="18.5" y="7" width="4.5" height="16" rx="1.5" fill="white" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isRegister) {
        await register(email, password);
        await login(email, password);
      } else {
        await login(email, password);
      }
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        background: "#08081a",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background gradient orb */}
      <div
        style={{
          position: "fixed",
          top: "25%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "700px",
          height: "700px",
          background: "radial-gradient(circle, rgba(196,30,58,0.05) 0%, transparent 65%)",
          pointerEvents: "none",
        }}
      />

      {/* Subtle grid pattern */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)
          `,
          backgroundSize: "64px 64px",
          pointerEvents: "none",
        }}
      />

      <div style={{ width: "100%", maxWidth: "400px", position: "relative" }}>
        {/* Logo & brand */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "12px",
              textDecoration: "none",
            }}
          >
            <KansaLogo />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <span style={{ fontSize: "24px", fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.5px", lineHeight: 1 }}>
                Kansa
              </span>
              <span style={{ fontSize: "11px", fontWeight: 500, color: "#3d4250", letterSpacing: "0.5px", marginTop: "3px" }}>
                AI Commerce Platform
              </span>
            </div>
          </Link>
        </div>

        {/* Form card */}
        <div
          style={{
            background: "rgba(13,13,32,0.8)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.04)",
            borderRadius: "16px",
            padding: "36px",
          }}
        >
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "#f1f5f9",
              marginBottom: "6px",
              letterSpacing: "-0.3px",
            }}
          >
            {isRegister ? "Create your account" : "Welcome back"}
          </h1>
          <p style={{ color: "#4a4f5e", fontSize: "14px", marginBottom: "28px" }}>
            {isRegister
              ? "Start optimizing your ecommerce listings."
              : "Sign in to your Kansa account."}
          </p>

          {error && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.06)",
                border: "1px solid rgba(239, 68, 68, 0.12)",
                borderRadius: "10px",
                padding: "12px 16px",
                marginBottom: "20px",
                color: "#fca5a5",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "18px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#6b7280",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.06)",
                  background: "rgba(8,8,26,0.6)",
                  color: "#f1f5f9",
                  fontSize: "14px",
                  outline: "none",
                  transition: "border-color 0.15s",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(196,30,58,0.35)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
              />
            </div>
            <div style={{ marginBottom: "26px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#6b7280",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="--------"
                required
                minLength={8}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.06)",
                  background: "rgba(8,8,26,0.6)",
                  color: "#f1f5f9",
                  fontSize: "14px",
                  outline: "none",
                  transition: "border-color 0.15s",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(196,30,58,0.35)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "13px",
                borderRadius: "10px",
                border: "none",
                background: loading ? "#1a1a2e" : "linear-gradient(135deg, #c41e3a, #a01830)",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
                letterSpacing: "0.2px",
              }}
            >
              {loading
                ? isRegister
                  ? "Creating account..."
                  : "Signing in..."
                : isRegister
                  ? "Create Account"
                  : "Sign In"}
            </button>
          </form>

          <p
            style={{
              textAlign: "center",
              marginTop: "22px",
              fontSize: "13px",
              color: "#4a4f5e",
            }}
          >
            {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setError(null);
              }}
              style={{
                background: "none",
                border: "none",
                color: "#c41e3a",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              {isRegister ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>

        {/* Footer */}
        <p style={{ textAlign: "center", marginTop: "28px", fontSize: "11px", color: "#2a2f3e" }}>
          Kansa AI &middot; AI-powered ecommerce
        </p>
      </div>
    </div>
  );
}
