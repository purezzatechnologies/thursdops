import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type UserRole = Database["public"]["Enums"]["user_role"];

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  avatar_url: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isDemo: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const DEMO_FLAG_KEY = "thursd_demo_mode";

export function dashboardPathForRole(role: UserRole): string {
  switch (role) {
    case "super_admin": return "/admin";
    case "manager": return "/manager";
    case "editor": return "/editor";
    case "ops_support": return "/ops";
    case "content_partner": return "/partner";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsDemo(sessionStorage.getItem(DEMO_FLAG_KEY) === "true");
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setProfile(null);
        setLoading(false);
        return;
      }
      // Defer profile fetch to avoid deadlock with auth callback
      setTimeout(() => {
        void loadProfile(newSession.user.id);
      }, 0);
    });

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        void loadProfile(data.session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,full_name,role,is_active,avatar_url")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("profile load failed", error);
    }
    if (data && !data.is_active) {
      await supabase.auth.signOut();
      setProfile(null);
      setSession(null);
      setLoading(false);
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(DEMO_FLAG_KEY);
        alert("Account deactivated. Please contact an administrator.");
      }
      return;
    }
    setProfile(data ?? null);
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(DEMO_FLAG_KEY);
    }
    setIsDemo(false);
  }

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        profile,
        loading,
        isDemo,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

export function markDemoMode() {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(DEMO_FLAG_KEY, "true");
  }
}
