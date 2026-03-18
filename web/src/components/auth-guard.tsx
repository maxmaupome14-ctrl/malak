"use client";

import { useEffect, useState, createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { getMe, isAuthenticated, type User } from "@/lib/auth";

interface AuthContextValue {
  user: User;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Hook to access the authenticated user from within an AuthGuard.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthGuard");
  }
  return ctx;
}

/**
 * AuthGuard checks authentication on mount.
 * - If no token exists, redirects to /login immediately.
 * - If a token exists, validates it via GET /users/me.
 * - If validation fails (401), clears token and redirects to /login.
 * - While checking, renders a loading spinner.
 * - Once verified, renders children with user context.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function verify() {
      // Quick check: no token at all
      if (!isAuthenticated()) {
        router.replace("/login");
        return;
      }

      // Validate token against the API
      const me = await getMe();
      if (!me) {
        router.replace("/login");
        return;
      }

      setUser(me);
      setChecking(false);
    }

    verify();
  }, [router]);

  if (checking || !user) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "200px",
          color: "#64748b",
          fontSize: "14px",
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user }}>
      {children}
    </AuthContext.Provider>
  );
}
