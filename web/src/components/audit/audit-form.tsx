"use client";

import { useState } from "react";

interface AuditFormProps {
  onSubmit: (url: string) => void;
  loading?: boolean;
}

export function AuditForm({ onSubmit, loading = false }: AuditFormProps) {
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmit(url.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: "12px" }}>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste any product URL..."
        className="input"
        style={{ flex: 1, fontSize: "16px", padding: "14px 20px" }}
        required
      />
      <button
        type="submit"
        disabled={loading || !url.trim()}
        className="btn-primary"
        style={{ padding: "14px 32px", fontSize: "16px", whiteSpace: "nowrap" }}
      >
        {loading ? "Analyzing..." : "Run Audit"}
      </button>
    </form>
  );
}
