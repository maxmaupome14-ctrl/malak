"use client";

import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // TODO: Call auth API
    // if (isRegister) await api.post("/auth/register", { email, password });
    // else await api.post("/auth/login", { email, password });
    setTimeout(() => setLoading(false), 1000); // Placeholder
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "400px" }}>
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
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #e94560, #b91c1c)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: "20px",
                color: "white",
              }}
            >
              M
            </div>
            <span style={{ fontSize: "22px", fontWeight: 700, color: "#f1f5f9" }}>
              Malak AI
            </span>
          </Link>
        </div>

        {/* Form card */}
        <div className="card">
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 600,
              color: "#f1f5f9",
              marginBottom: "8px",
            }}
          >
            {isRegister ? "Create your account" : "Welcome back"}
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "14px", marginBottom: "28px" }}>
            {isRegister
              ? "Start optimizing your ecommerce listings with AI."
              : "Sign in to your Malak AI account."}
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#94a3b8",
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
                className="input"
                required
              />
            </div>
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#94a3b8",
                  marginBottom: "6px",
                }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
                required
                minLength={8}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ width: "100%", padding: "12px" }}
            >
              {loading
                ? "Loading..."
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
              color: "#64748b",
            }}
          >
            {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => setIsRegister(!isRegister)}
              style={{
                background: "none",
                border: "none",
                color: "#e94560",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              {isRegister ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
