"use client";

import { useEffect, useState } from "react";
import AuthGuard from "@/components/auth-guard";
import { api } from "@/lib/api";

interface ApiKeysState {
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  google_ai_api_key: string | null;
  has_openai: boolean;
  has_anthropic: boolean;
  has_google_ai: boolean;
}

function SettingsContent() {
  const [keys, setKeys] = useState<ApiKeysState | null>(null);
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [googleAiKey, setGoogleAiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    api.get<ApiKeysState>("/settings/api-keys").then((k) => {
      setKeys(k);
    }).catch(() => {});
  }, []);

  const saveKeys = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const body: Record<string, string> = {};
      if (openaiKey) body.openai_api_key = openaiKey;
      if (anthropicKey) body.anthropic_api_key = anthropicKey;
      if (googleAiKey) body.google_ai_api_key = googleAiKey;

      const updated = await api.put<ApiKeysState>("/settings/api-keys", body);
      setKeys(updated);
      setOpenaiKey("");
      setAnthropicKey("");
      setGoogleAiKey("");
      setMessage({ type: "success", text: "API keys saved successfully!" });
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Failed to save keys" });
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async (key: "openai_api_key" | "anthropic_api_key" | "google_ai_api_key") => {
    try {
      const updated = await api.put<ApiKeysState>("/settings/api-keys", { [key]: "" });
      setKeys(updated);
      setMessage({ type: "success", text: "Key removed." });
    } catch (e: any) {
      setMessage({ type: "error", text: e.message });
    }
  };

  return (
    <div style={{ maxWidth: "700px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#f1f5f9", marginBottom: "8px" }}>
        Settings
      </h1>
      <p style={{ color: "#94a3b8", fontSize: "14px", marginBottom: "32px" }}>
        Bring Your Own Keys &mdash; Kansa uses your API keys to power the AI agents.
      </p>

      {message && (
        <div style={{
          padding: "12px 16px",
          borderRadius: "8px",
          marginBottom: "20px",
          background: message.type === "success" ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
          border: `1px solid ${message.type === "success" ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
          color: message.type === "success" ? "#86efac" : "#fca5a5",
          fontSize: "14px",
        }}>
          {message.text}
        </div>
      )}

      {/* OpenAI */}
      <div className="card" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#f1f5f9", marginBottom: "4px" }}>
              OpenAI API Key
            </h3>
            <p style={{ fontSize: "13px", color: "#64748b" }}>
              Used by Copywriter, Spy, and Strategist agents. Get one at{" "}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener" style={{ color: "#e94560", textDecoration: "none" }}>
                platform.openai.com
              </a>
            </p>
          </div>
          {keys?.has_openai && (
            <span style={{
              fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
              color: "#86efac", padding: "4px 10px", borderRadius: "6px",
              background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)",
            }}>
              Connected
            </span>
          )}
        </div>

        {keys?.has_openai && (
          <div style={{
            display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px",
            padding: "10px 14px", background: "#0f0f1e", borderRadius: "8px", border: "1px solid #1e293b",
          }}>
            <code style={{ flex: 1, color: "#94a3b8", fontSize: "14px", fontFamily: "monospace" }}>
              {keys.openai_api_key}
            </code>
            <button
              onClick={() => clearKey("openai_api_key")}
              style={{
                fontSize: "12px", color: "#fca5a5", background: "none",
                border: "1px solid rgba(239,68,68,0.3)", borderRadius: "6px",
                padding: "4px 10px", cursor: "pointer",
              }}
            >
              Remove
            </button>
          </div>
        )}

        <input
          type="password"
          value={openaiKey}
          onChange={(e) => setOpenaiKey(e.target.value)}
          placeholder={keys?.has_openai ? "Enter new key to replace..." : "sk-..."}
          className="input"
          style={{ width: "100%", fontFamily: "monospace" }}
        />
      </div>

      {/* Anthropic */}
      <div className="card" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#f1f5f9", marginBottom: "4px" }}>
              Anthropic API Key
            </h3>
            <p style={{ fontSize: "13px", color: "#64748b" }}>
              Optional — use Claude instead of GPT for agent reasoning. Get one at{" "}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" style={{ color: "#e94560", textDecoration: "none" }}>
                console.anthropic.com
              </a>
            </p>
          </div>
          {keys?.has_anthropic && (
            <span style={{
              fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
              color: "#86efac", padding: "4px 10px", borderRadius: "6px",
              background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)",
            }}>
              Connected
            </span>
          )}
        </div>

        {keys?.has_anthropic && (
          <div style={{
            display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px",
            padding: "10px 14px", background: "#0f0f1e", borderRadius: "8px", border: "1px solid #1e293b",
          }}>
            <code style={{ flex: 1, color: "#94a3b8", fontSize: "14px", fontFamily: "monospace" }}>
              {keys.anthropic_api_key}
            </code>
            <button
              onClick={() => clearKey("anthropic_api_key")}
              style={{
                fontSize: "12px", color: "#fca5a5", background: "none",
                border: "1px solid rgba(239,68,68,0.3)", borderRadius: "6px",
                padding: "4px 10px", cursor: "pointer",
              }}
            >
              Remove
            </button>
          </div>
        )}

        <input
          type="password"
          value={anthropicKey}
          onChange={(e) => setAnthropicKey(e.target.value)}
          placeholder={keys?.has_anthropic ? "Enter new key to replace..." : "sk-ant-..."}
          className="input"
          style={{ width: "100%", fontFamily: "monospace" }}
        />
      </div>

      {/* Google AI */}
      <div className="card" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#f1f5f9", marginBottom: "4px" }}>
              Google AI API Key
            </h3>
            <p style={{ fontSize: "13px", color: "#64748b" }}>
              Powers AI image generation (Nano Banana) and video (Veo). Get one at{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style={{ color: "#e94560", textDecoration: "none" }}>
                aistudio.google.com
              </a>
            </p>
          </div>
          {keys?.has_google_ai && (
            <span style={{
              fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
              color: "#86efac", padding: "4px 10px", borderRadius: "6px",
              background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)",
            }}>
              Connected
            </span>
          )}
        </div>

        {keys?.has_google_ai && (
          <div style={{
            display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px",
            padding: "10px 14px", background: "#0f0f1e", borderRadius: "8px", border: "1px solid #1e293b",
          }}>
            <code style={{ flex: 1, color: "#94a3b8", fontSize: "14px", fontFamily: "monospace" }}>
              {keys.google_ai_api_key}
            </code>
            <button
              onClick={() => clearKey("google_ai_api_key")}
              style={{
                fontSize: "12px", color: "#fca5a5", background: "none",
                border: "1px solid rgba(239,68,68,0.3)", borderRadius: "6px",
                padding: "4px 10px", cursor: "pointer",
              }}
            >
              Remove
            </button>
          </div>
        )}

        <input
          type="password"
          value={googleAiKey}
          onChange={(e) => setGoogleAiKey(e.target.value)}
          placeholder={keys?.has_google_ai ? "Enter new key to replace..." : "AIza..."}
          className="input"
          style={{ width: "100%", fontFamily: "monospace" }}
        />
      </div>

      {/* Save */}
      <button
        onClick={saveKeys}
        disabled={saving || (!openaiKey && !anthropicKey && !googleAiKey)}
        className="btn-primary"
        style={{
          padding: "12px 32px",
          fontSize: "15px",
          opacity: (!openaiKey && !anthropicKey && !googleAiKey) ? 0.5 : 1,
        }}
      >
        {saving ? "Saving..." : "Save API Keys"}
      </button>

      {/* Info box */}
      <div style={{
        marginTop: "32px", padding: "20px", borderRadius: "10px",
        background: "rgba(59, 130, 246, 0.05)", border: "1px solid rgba(59, 130, 246, 0.15)",
      }}>
        <h4 style={{ fontSize: "14px", fontWeight: 600, color: "#93c5fd", marginBottom: "8px" }}>
          How BYOK works
        </h4>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {[
            "Your keys are stored securely and only used for YOUR requests",
            "You pay OpenAI/Anthropic/Google directly — Kansa never touches your API bill",
            "Google AI key enables AI image generation (Nano Banana) and video (Veo)",
            "Keys are never shared, logged, or sent to third parties",
            "You can remove your keys at any time",
          ].map((t) => (
            <li key={t} style={{ fontSize: "13px", color: "#94a3b8", padding: "4px 0", display: "flex", gap: "8px" }}>
              <span style={{ color: "#3b82f6" }}>{"\u2713"}</span> {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsContent />
    </AuthGuard>
  );
}
