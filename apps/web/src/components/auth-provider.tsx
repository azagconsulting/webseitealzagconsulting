"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { apiRequest, authHeaders, ApiError } from "@/lib/api";
import type {
  AuthResponse,
  AuthTokens,
  AuthUser,
  LoginResponse,
} from "@/lib/types";

interface LoginPayload {
  email: string;
  password: string;
}

type LoginResult =
  | { status: "authenticated" }
  | { status: "two-factor-required"; deviceId: string; expiresAt: string };

interface AuthContextValue {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  loading: boolean;
  error: string | null;
  login: (payload: LoginPayload) => Promise<LoginResult>;
  verifyLoginCode: (payload: {
    email: string;
    code: string;
    deviceId?: string;
  }) => Promise<void>;
  consumeMagicLogin: (payload: { token: string; deviceId?: string }) => Promise<void>;
  logout: () => void;
  authorizedRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
  refreshProfile: () => Promise<void>;
}

const STORAGE_KEY = "arcto-crm-auth";
const DEVICE_KEY = "arcto-crm-device-id";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getDeviceId() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(DEVICE_KEY);
}

function persistDeviceId(value: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(DEVICE_KEY, value);
}

function generateDeviceId() {
  const webCrypto = typeof window !== "undefined" ? window.crypto : undefined;

  if (webCrypto?.randomUUID) {
    return webCrypto.randomUUID();
  }
  if (webCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    return Array.from(bytes, (entry) => entry.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function ensureDeviceId() {
  const existing = getDeviceId();
  if (existing) {
    return existing;
  }
  const next = generateDeviceId();
  persistDeviceId(next);
  return next;
}

function getPersistedAuth() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthResponse> | null;
    if (!parsed?.tokens?.accessToken || !parsed.tokens.refreshToken) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed as AuthResponse;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokensRef = useRef<AuthTokens | null>(null);

  const persistAuth = useCallback((payload: AuthResponse) => {
    setUser(payload.user);
    setTokens(payload.tokens);
    tokensRef.current = payload.tokens;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setTokens(null);
    tokensRef.current = null;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
      window.location.href = "/mitarbeiterzugang";
    }
  }, []);

  const handleAuthResponse = useCallback(
    (payload: AuthResponse) => {
      setError(null);
      persistAuth(payload);
    },
    [persistAuth],
  );

  const refreshTokens = useCallback(async () => {
    const refreshToken = tokensRef.current?.refreshToken;
    if (!refreshToken) {
      throw new Error("Kein Refresh Token gefunden");
    }

    const response = await apiRequest<AuthResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });

    handleAuthResponse(response);
    return response.tokens.accessToken;
  }, [handleAuthResponse]);

  const fetchProfile = useCallback(
    async (accessToken?: string) => {
      if (!accessToken) {
        setLoading(false);
        return;
      }

      const loadProfile = async (token: string) => {
        const profile = await apiRequest<AuthUser>("/auth/me", {
          headers: authHeaders(token),
        });
        setUser(profile);
      };

      try {
        await loadProfile(accessToken);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          try {
            const nextAccessToken = await refreshTokens();
            await loadProfile(nextAccessToken);
            return;
          } catch (refreshErr) {
            console.error(refreshErr);
          }
        }

        console.error(err);
        logout();
      } finally {
        setLoading(false);
      }
    },
    [logout, refreshTokens],
  );

  useEffect(() => {
    const existing = getPersistedAuth();
    if (!existing) {
      setLoading(false);
      return;
    }

    setUser(existing.user);
    setTokens(existing.tokens);
    tokensRef.current = existing.tokens;
    if (existing.tokens?.accessToken) {
      void fetchProfile(existing.tokens.accessToken);
    } else {
      setLoading(false);
    }
  }, [fetchProfile]);

  const login = useCallback(
    async (payload: LoginPayload): Promise<LoginResult> => {
      setError(null);
      try {
        const deviceId = ensureDeviceId();
        const response = await apiRequest<LoginResponse>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ ...payload, deviceId }),
        });
        if ("requiresTwoFactor" in response) {
          if (response.deviceId && response.deviceId !== deviceId) {
            persistDeviceId(response.deviceId);
          }
          return {
            status: "two-factor-required",
            deviceId: response.deviceId,
            expiresAt: response.expiresAt,
          };
        }
        handleAuthResponse(response);
        return { status: "authenticated" };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Login fehlgeschlagen";
        setError(message);
        throw err;
      }
    },
    [handleAuthResponse],
  );

  const verifyLoginCode = useCallback(
    async (payload: { email: string; code: string; deviceId?: string }) => {
      setError(null);
      try {
        const deviceId = payload.deviceId ?? ensureDeviceId();
        persistDeviceId(deviceId);
        const response = await apiRequest<AuthResponse>("/auth/login/verify", {
          method: "POST",
          body: JSON.stringify({
            email: payload.email,
            code: payload.code,
            deviceId,
          }),
        });
        handleAuthResponse(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Login-Code ist ungueltig.";
        setError(message);
        throw err;
      }
    },
    [handleAuthResponse],
  );

  const consumeMagicLogin = useCallback(
    async (payload: { token: string; deviceId?: string }) => {
      setError(null);
      try {
        const deviceId = payload.deviceId ?? ensureDeviceId();
        persistDeviceId(deviceId);
        const response = await apiRequest<AuthResponse>("/auth/magic-link/consume", {
          method: "POST",
          body: JSON.stringify({
            token: payload.token,
            deviceId,
          }),
        });
        handleAuthResponse(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Magic-Link ist ungueltig.";
        setError(message);
        throw err;
      }
    },
    [handleAuthResponse],
  );

  const authorizedRequest = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      if (!tokens?.accessToken) {
        throw new Error("Nicht eingeloggt");
      }

      try {
        return await apiRequest<T>(path, {
          ...init,
          headers: authHeaders(tokens.accessToken, init.headers),
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          const nextAccessToken = await refreshTokens();
          return apiRequest<T>(path, {
            ...init,
            headers: authHeaders(nextAccessToken, init.headers),
          });
        }

        throw err;
      }
    },
    [refreshTokens, tokens?.accessToken],
  );

  const refreshProfile = useCallback(async () => {
    if (!tokens?.accessToken) {
      return;
    }
    await fetchProfile(tokens.accessToken);
  }, [fetchProfile, tokens?.accessToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      tokens,
      loading,
      error,
      login,
      verifyLoginCode,
      consumeMagicLogin,
      logout,
      authorizedRequest,
      refreshProfile,
    }),
    [
      authorizedRequest,
      error,
      loading,
      login,
      logout,
      refreshProfile,
      tokens,
      user,
      consumeMagicLogin,
      verifyLoginCode,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth muss innerhalb des AuthProvider verwendet werden");
  }
  return context;
}
