"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login, register } from "@/lib/auth";
import { ApiError } from "@/lib/api";

function KansaLogo() {
  return (
    <svg width="40" height="40" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="kansa-login-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e94560" />
          <stop offset="100%" stopColor="#c2185b" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#kansa-login-grad)" />
      <path
        d="M11 8v16M11 16l7-8M11 16l7 8"
        stroke="white"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22" cy="12" r="2" fill="rgba(255,255,255,0.6)" />
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
      }}
    >
      {/* Subtle radial glow behind the form */}
      <div
        style={{
          position: "fixed",
          top: "30%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "600px",
          height: "600px",
          background: "radial-gradient(circle, rgba(233,69,96,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ width: "100%", maxWidth: "380px", position: "relative" }}>
        {/* Logo */}
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
              <span style={{ fontSize: "22px", fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.5px", lineHeight: 1 }}>
                Kansa
              </span>
              <span style={{ fontSize: "11px", fontWeight: 500, color: "#475569", letterSpacing: "0.3px", marginTop: "2px" }}>
                AI Commerce
              </span>
            </div>
          </Link>
        </div>

        {/* Form card */}
        <div
          style={{
            background: "#0d0d20",
            border: "1px solid rgba(255,255,255,0.04)",
            borderRadius: "16px",
            padding: "32px",
          }}
        >
          <h1
            style={{
              fontSize: "20px",
              fontWeight: 700,
              color: "#f1f5f9",
              marginBottom: "6px",
              letterSpacing: "-0.3px",
            }}
          >
            {isRegister ? "Create your account" : "Welcome back"}
          </h1>
          <p style={{ color: "#525c6c", fontSize: "13px", marginBottom: "28px" }}>
            {isRegister
              ? "Start optimizing your ecommerce listings with AI."
              : "Sign in to your Kansa account."}
          </p>

          {error && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.06)",
                border: "1px solid rgba(239, 68, 68, 0.15)",
                borderRadius: "10px",
                padding: "12px 16px",
                marginBottom: "20px",
                color: "#fca5a5",
                fontSize: "13px",
              }}
            >
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
                  color: "#8892a4",
                  marginBottom: "6px",
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
                  padding: "11px 14px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.06)",
                  background: "#0a0a1a",
                  color: "#f1f5f9",
                  fontSize: "14px",
                  outline: "none",
                  transition: "border-color 0.15s",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(233,69,96,0.4)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
              />
            </div>
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#8892a4",
                  marginBottom: "6px",
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
                  padding: "11px 14px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.06)",
                  background: "#0a0a1a",
                  color: "#f1f5f9",
                  fontSize: "14px",
                  outline: "none",
                  transition: "border-color 0.15s",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(233,69,96,0.4)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "10px",
                border: "none",
                background: loading ? "#334155" : "#e94560",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "background 0.15s",
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
              marginTop: "20px",
              fontSize: "13px",
              color: "#525c6c",
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
                color: "#e94560",
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
        <p style={{ textAlign: "center", marginTop: "24px", fontSize: "11px", color: "#2a2a40" }}>
          Kansa AI &middot; AI-powered ecommerce
        </p>
      </div>
    </div>
  );
}
