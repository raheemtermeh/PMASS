import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { isPlatformRole } from "@/shared/permissions";

export interface TenantInfo {
  id: number;
  slug: string;
  name: string;
  is_active: boolean;
}

export interface AuthUser {
  id: number;
  tenant_id: number | null;
  email: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  job_title?: string | null;
  phone?: string | null;
  bio?: string | null;
  role: string;
  is_active: boolean;
  permissions: string[];
  tenant?: TenantInfo | null;
  created_at?: string;
  updated_at?: string;
}

const AUTH_KEY = "pmas-live-auth";
const REMEMBER_KEY = "pmas-live-remember";

export function getRememberMePreference(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(REMEMBER_KEY) === "1";
}

export function setRememberMePreference(remember: boolean): void {
  if (typeof window === "undefined") return;
  if (remember) {
    localStorage.setItem(REMEMBER_KEY, "1");
  } else {
    localStorage.removeItem(REMEMBER_KEY);
  }
}

/** Reads/writes auth to localStorage when Remember Me is on, else sessionStorage. */
const adaptiveStorage: StateStorage = {
  getItem: (name) => {
    if (typeof window === "undefined") return null;
    const remember = getRememberMePreference();
    return (remember ? localStorage : sessionStorage).getItem(name);
  },
  setItem: (name, value) => {
    if (typeof window === "undefined") return;
    const remember = getRememberMePreference();
    if (remember) {
      localStorage.setItem(name, value);
      sessionStorage.removeItem(name);
    } else {
      sessionStorage.setItem(name, value);
      localStorage.removeItem(name);
    }
  },
  removeItem: (name) => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(name);
    sessionStorage.removeItem(name);
  },
};

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setSession: (
    token: string,
    user: AuthUser,
    refreshToken?: string | null,
    options?: { remember?: boolean },
  ) => void;
  clearSession: () => void;
  isPlatformAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      setSession: (token, user, refreshToken, options) => {
        if (options?.remember !== undefined) {
          setRememberMePreference(options.remember);
        }
        set((state) => ({
          token,
          user,
          refreshToken: refreshToken !== undefined ? refreshToken : state.refreshToken,
        }));
      },
      clearSession: () => {
        set({ token: null, refreshToken: null, user: null });
        if (typeof window !== "undefined") {
          localStorage.removeItem(AUTH_KEY);
          sessionStorage.removeItem(AUTH_KEY);
        }
      },
      isPlatformAdmin: () => isPlatformRole(get().user?.role),
    }),
    {
      name: AUTH_KEY,
      storage: createJSONStorage(() => adaptiveStorage),
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    },
  ),
);

/**
 * True once the persisted session has been read from storage. Entry pages must
 * wait for this before deciding between the landing page and the dashboard,
 * otherwise a signed-in user briefly lands on /welcome.
 */
export function useAuthHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useAuthStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  return hydrated;
}
