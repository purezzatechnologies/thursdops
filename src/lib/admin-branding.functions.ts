import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MAX_LEN = 1_600_000; // ~1.2MB image as a data URL

/**
 * Set (or clear) the app-wide logo. Super admin only. Accepts a data: image URL
 * or an https URL; pass null to reset to the default mark.
 */
export const setAppLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      logoUrl: z
        .string()
        .max(MAX_LEN, "Image is too large — please use a file under ~1MB.")
        .refine((s) => s.startsWith("data:image/") || s.startsWith("https://") || s.startsWith("http://"),
          "Must be an image.")
        .nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: me } = await supabaseAdmin
      .from("profiles").select("role").eq("id", context.userId).maybeSingle();
    if (!me || me.role !== "super_admin") throw new Error("Forbidden: super admins only.");

    const { error } = await supabaseAdmin
      .from("app_branding")
      .update({ logo_url: data.logoUrl, updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
