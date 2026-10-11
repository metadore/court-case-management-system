"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import type { AuthUser } from "@tpt-court/types";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; firstName: string; lastName: string }) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    // Decode JWT payload client-side for instant render — no network round-trip needed
    const payload = decodeJwtPayload(storedToken);
    const isExpired = !payload?.exp || (payload.exp as number) * 1000 < Date.now();

    if (isExpired) {
      localStorage.removeItem("token");
      setIsLoading(false);
      return;
    }

    // Set cookie for Next.js middleware route protection
    document.cookie = `token=${storedToken}; path=/; max-age=604800; SameSite=Lax`;

    // Populate user state immediately from JWT claims — renders the dashboard without waiting
    setToken(storedToken);
    setUser({
      id: payload.sub as string,
      email: payload.email as string,
      role: payload.role as AuthUser["role"],
      courtId: (payload.courtId as string | null) ?? null,
      firstName: (payload.firstName as string | undefined) ?? "",
      lastName: (payload.lastName as string | undefined) ?? "",
      totpEnabled: false,
    });
    setIsLoading(false);

    // Background-verify the token is still valid (catches revoked tokens and picks up profile changes)
    api
      .get<{ data: AuthUser }>("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem("token");
        setToken(null);
        setUser(null);
        router.push("/login");
      });
  }, [router]);

  function persistToken(t: string) {
    localStorage.setItem("token", t);
    // M1 fix: Added Secure flag and max-age for the cookie
    const secureFlag = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `token=${t}; path=/; max-age=604800; SameSite=Lax${secureFlag}`;
  }

  function clearToken() {
    localStorage.removeItem("token");
    // M1 fix: Clear cookie with all applicable attributes
    document.cookie = "token=; path=/; max-age=0; SameSite=Lax; Secure";
  }

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{ data: { user: AuthUser; token: string } }>("/auth/login", {
        email,
        password,
      });
      persistToken(res.data.token);
      setToken(res.data.token);
      setUser(res.data.user);
      router.push("/dashboard");
    },
    [router]
  );

  const register = useCallback(
    async (data: { email: string; password: string; firstName: string; lastName: string }) => {
      const res = await api.post<{ data: { user: AuthUser; token: string } }>("/auth/register", data);
      persistToken(res.data.token);
      setToken(res.data.token);
      setUser(res.data.user);
      router.push("/dashboard");
    },
    [router]
  );

  const logout = useCallback(() => {
    clearToken();
    setToken(null);
    setUser(null);
    router.push("/");
  }, [router]);

  const refreshUser = useCallback(async () => {
    const res = await api.get<{ data: AuthUser }>("/auth/me");
    setUser(res.data);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}