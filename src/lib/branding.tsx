import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface BrandingValue {
  logoUrl: string | null;
  refresh: () => Promise<void>;
}

const BrandingContext = createContext<BrandingValue>({ logoUrl: null, refresh: async () => {} });

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data } = await supabase.from("app_branding").select("logo_url").eq("id", 1).maybeSingle();
    setLogoUrl(data?.logo_url ?? null);
  }, []);

  useEffect(() => {
    void refresh();
    // Live-update the logo everywhere when it changes.
    const channel = supabase
      .channel("app-branding")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_branding" }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh]);

  return <BrandingContext.Provider value={{ logoUrl, refresh }}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
