import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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
  role: string;
  is_active: boolean;
  permissions: string[];
  tenant?: TenantInfo | null;
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
      isPlatformAdmin: () => {
        const role = get().user?.role;
        return role === "platform_admin" || role === "super_admin";
      },
    }),
    {
      name: "pmas-live-auth",
      // sessionStorage reduces persistence window vs localStorage (still XSS-stealable while tab open).
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);
