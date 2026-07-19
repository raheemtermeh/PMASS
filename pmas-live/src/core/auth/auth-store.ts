import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
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

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  clearSession: () => void;
  isPlatformAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      clearSession: () => set({ token: null, user: null }),
      isPlatformAdmin: () => isPlatformRole(get().user?.role),
    }),
    {
      name: "pmas-live-auth",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);
