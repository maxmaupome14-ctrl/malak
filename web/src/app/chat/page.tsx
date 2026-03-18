"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/auth-guard";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

interface ConnectedStore {
  id: string;
  name: string;
  platform: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi! I'm Kansa, your AI ecommerce assistant. I can help you optimize your listings, analyze your products, and boost your sales. What would you like to work on?",
};

const STORAGE_KEY = "kansa-chat-history";

function loadMessages(): Message[] {
  if (typeof window === "undefined") return [WELCOME_MESSAGE];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Message[];
      if (parsed.length > 0) return parsed;
    }
  } catch {}
  return [WELCOME_MESSAGE];
}

function saveMessages(msgs: Message[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
  } catch {}
}

function ChatContent() {
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [stores, setStores] = useState<ConnectedStore[]>([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [noApiKey, setNoApiKey] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Persist messages to localStorage on every change
  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    api
      .get<ConnectedStore[]>("/stores")
      .then((s) => {
        setStores(s);
        if (s.length > 0) {
          setSelectedStore(s[0].id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setNoApiKey(false);
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      const token = getToken();
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: text,
          store_id: selectedStore || undefined,
          messages: messages
            .filter((m) => m.id !== "welcome")
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const detail =
          typeof errorBody.detail === "string"
            ? errorBody.detail
            : response.statusText;

        if (
          response.status === 400 &&
          detail.toLowerCase().includes("api key")
        ) {
          setNoApiKey(true);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content:
                      "It looks like you haven't configured an API key yet. Please add one in Settings to start chatting.",
                  }
                : m
            )
          );
          setIsStreaming(false);
          return;
        }

        throw new Error(detail);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          const jsonStr = trimmed.slice(6);
          if (jsonStr === "[DONE]") continue;

          try {
            const data = JSON.parse(jsonStr);
            const content =
              data.content ||
              data.delta?.content ||
              data.choices?.[0]?.delta?.content ||
              "";
            if (content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + content }
                    : m
                )
              );
            }
          } catch {
            // skip unparseable lines
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: m.content || `Error: ${err.message || "Something went wrong. Please try again."}`,
              }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 64px)",
        maxHeight: "calc(100vh - 64px)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: "16px",
          borderBottom: "1px solid #1e293b",
          marginBottom: "0",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div>
            <h1
              style={{ fontSize: "28px", fontWeight: 700, color: "#f1f5f9" }}
            >
              Kansa AI
            </h1>
            <p
              style={{ color: "#94a3b8", marginTop: "4px", fontSize: "14px" }}
            >
              Your AI-powered ecommerce assistant
            </p>
          </div>
          <button
            onClick={() => {
              setMessages([WELCOME_MESSAGE]);
              localStorage.removeItem(STORAGE_KEY);
            }}
            style={{
              background: "transparent",
              border: "1px solid #334155",
              borderRadius: "8px",
              color: "#94a3b8",
              padding: "6px 12px",
              fontSize: "12px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            New Chat
          </button>
        </div>

        {stores.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <label
              style={{ fontSize: "13px", color: "#64748b", whiteSpace: "nowrap" }}
            >
              Store:
            </label>
            <select
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
              style={{
                background: "#1a1a2e",
                border: "1px solid #334155",
                borderRadius: "8px",
                color: "#f1f5f9",
                padding: "8px 12px",
                fontSize: "13px",
                outline: "none",
                cursor: "pointer",
                minWidth: "160px",
              }}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px 0",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              justifyContent:
                msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "75%",
                padding: "12px 16px",
                borderRadius:
                  msg.role === "user"
                    ? "16px 16px 4px 16px"
                    : "16px 16px 16px 4px",
                background:
                  msg.role === "user" ? "#e94560" : "#16162a",
                border:
                  msg.role === "user"
                    ? "1px solid #e94560"
                    : "1px solid #1e293b",
                color: msg.role === "user" ? "#ffffff" : "#f1f5f9",
                fontSize: "14px",
                lineHeight: "1.6",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {msg.content}

              {/* No API key link */}
              {noApiKey && msg.id === messages[messages.length - 1]?.id && msg.role === "assistant" && (
                <div style={{ marginTop: "12px" }}>
                  <Link
                    href="/settings"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      color: "#e94560",
                      fontSize: "13px",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    Go to Settings &rarr;
                  </Link>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isStreaming && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "16px 16px 16px 4px",
                background: "#16162a",
                border: "1px solid #1e293b",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "#94a3b8",
                    display: "inline-block",
                    animation: `typingDot 1.4s infinite`,
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          flexShrink: 0,
          borderTop: "1px solid #1e293b",
          paddingTop: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "flex-end",
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Kansa anything about your store..."
            rows={1}
            style={{
              flex: 1,
              background: "#1a1a2e",
              border: "1px solid #334155",
              borderRadius: "12px",
              color: "#f1f5f9",
              padding: "14px 16px",
              fontSize: "14px",
              outline: "none",
              resize: "none",
              lineHeight: "1.5",
              maxHeight: "120px",
              overflowY: "auto",
              fontFamily: "inherit",
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height =
                Math.min(target.scrollHeight, 120) + "px";
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            style={{
              background: input.trim() && !isStreaming ? "#e94560" : "#334155",
              border: "none",
              borderRadius: "12px",
              color: input.trim() && !isStreaming ? "#ffffff" : "#64748b",
              padding: "14px 20px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: input.trim() && !isStreaming ? "pointer" : "not-allowed",
              transition: "all 0.15s",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Send
          </button>
        </div>
        <p
          style={{
            fontSize: "11px",
            color: "#475569",
            marginTop: "8px",
            textAlign: "center",
          }}
        >
          Kansa AI can make mistakes. Verify important information.
        </p>
      </div>

      {/* Inline keyframes for typing dots animation */}
      <style>{`
        @keyframes typingDot {
          0%, 44% { opacity: 0.3; transform: scale(0.8); }
          22% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

export default function ChatPage() {
  return (
    <AuthGuard>
      <ChatContent />
    </AuthGuard>
  );
}
