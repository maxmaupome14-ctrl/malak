/**
 * Authentication helpers for JWT-based auth with the Malak API.
 */

import { api, ApiError } from "./api";

const TOKEN_KEY = "malak_token";
const USER_KEY = "malak_user";

export interface User {
  id: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
}

interface AuthResponse {
  access_token: string;
  token_type: string;
}

/**
 * Register a new user account.
 */
export async function register(email: string, password: string): Promise<User> {
  const user = await api.post<User>("/auth/register", { email, password });
  return user;
}

/**
 * Log in and store the JWT token.
 */
export async function login(email: string, password: string): Promise<User> {
  // FastAPI-Users expects form-encoded login
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || ""}/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: email, password }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const detail = errorBody.detail || "Invalid credentials";
    const message =
      detail === "LOGIN_BAD_CREDENTIALS"
        ? "Invalid email or password"
        : typeof detail === "string"
          ? detail
          : "Login failed";
    throw new ApiError(response.status, message);
  }

  const data: AuthResponse = await response.json();
  localStorage.setItem(TOKEN_KEY, data.access_token);

  // Fetch and cache user profile
  const user = await getMe();
  if (!user) {
    throw new ApiError(401, "Failed to fetch user profile after login");
  }
  return user;
}

/**
 * Log out — clear stored credentials.
 */
export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.location.href = "/login";
}

/**
 * Get the current authenticated user.
 * Returns null and clears token if the request fails (e.g. expired/invalid token).
 */
export async function getMe(): Promise<User | null> {
  try {
    const user = await api.get<User>("/users/me");
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
    return null;
  }
}

/**
 * Get cached user (from localStorage, no API call).
 */
export function getCachedUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

/**
 * Check if user is currently authenticated (has a token).
 */
export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(TOKEN_KEY);
}

/**
 * Get the stored JWT token.
 */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
