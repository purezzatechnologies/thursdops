import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Build-mode demo password. Production deployment MUST rotate.
// See README "Deployment checklist".
const DEMO_PASSWORD = "Demo2026!";

const createPartnerUserSchema = z.object({
  partnerId: z.string().uuid(),
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(255),
});

export const createPartnerUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createPartnerUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Caller must be super_admin or manager
    const { data: caller } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (!caller || (caller.role !== "super_admin" && caller.role !== "manager")) {
      throw new Error("Only super_admins and managers can create partner users.");
    }

    // 2. Partner must exist and be active
    const { data: partner } = await supabase
      .from("content_partners")
      .select("id, is_active")
      .eq("id", data.partnerId)
      .maybeSingle();
    if (!partner) throw new Error("Partner not found.");
    if (!partner.is_active) throw new Error("Cannot add users to an inactive partner.");

    // 3. Email must not already exist anywhere in profiles
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", data.email)
      .maybeSingle();
    if (existing) {
      throw new Error(
        "A user with this email already exists. Use the existing account or choose a different email.",
      );
    }

    // 4. Create auth user
    const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (authErr || !created.user) {
      throw new Error(authErr?.message ?? "Failed to create auth user.");
    }
    const newUserId = created.user.id;

    // 5. Insert profile + partner_users link. On any failure, clean up auth user.
    try {
      const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
        id: newUserId,
        email: data.email,
        full_name: data.fullName,
        role: "content_partner",
        is_active: true,
        updated_by: userId,
      });
      if (profileErr) throw profileErr;

      const { error: linkErr } = await supabaseAdmin.from("partner_users").insert({
        profile_id: newUserId,
        content_partner_id: data.partnerId,
        updated_by: userId,
      });
      if (linkErr) throw linkErr;
    } catch (e) {
      // Clean up on failure to avoid orphans
      await supabaseAdmin.from("partner_users").delete().eq("profile_id", newUserId);
      await supabaseAdmin.from("profiles").delete().eq("id", newUserId);
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw e instanceof Error ? e : new Error("Failed to create partner user.");
    }

    return {
      userId: newUserId,
      email: data.email,
      fullName: data.fullName,
      // TODO: production deployment must rotate all partner_user passwords.
      // See deployment checklist in README.
      tempPassword: DEMO_PASSWORD,
    };
  });

// Deactivate a partner and cascade to its active partner_users.
const setPartnerActiveSchema = z.object({
  partnerId: z.string().uuid(),
  active: z.boolean(),
});

export const setPartnerActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setPartnerActiveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: caller } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (!caller || (caller.role !== "super_admin" && caller.role !== "manager")) {
      throw new Error("Only super_admins and managers can change partner status.");
    }

    // Update partner
    const { error: pErr } = await supabase
      .from("content_partners")
      .update({ is_active: data.active, updated_by: userId, updated_at: new Date().toISOString() })
      .eq("id", data.partnerId);
    if (pErr) throw new Error(pErr.message);

    let deactivatedUserCount = 0;
    if (!data.active) {
      // Cascade-deactivate all linked active partner users
      const { data: links } = await supabase
        .from("partner_users")
        .select("profile_id")
        .eq("content_partner_id", data.partnerId);
      const ids = (links ?? []).map((l) => l.profile_id);
      if (ids.length > 0) {
        const { data: updated, error: uErr } = await supabaseAdmin
          .from("profiles")
          .update({ is_active: false, updated_by: userId, updated_at: new Date().toISOString() })
          .in("id", ids)
          .eq("is_active", true)
          .select("id");
        if (uErr) throw new Error(uErr.message);
        deactivatedUserCount = updated?.length ?? 0;
      }
    }
    return { ok: true, deactivatedUserCount };
  });

// Toggle a single partner_user account active/inactive
const setPartnerUserActiveSchema = z.object({
  profileId: z.string().uuid(),
  active: z.boolean(),
});

export const setPartnerUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setPartnerUserActiveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: caller } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (!caller || (caller.role !== "super_admin" && caller.role !== "manager")) {
      throw new Error("Only super_admins and managers can change user status.");
    }
    // Verify target is a content_partner
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("id", data.profileId)
      .maybeSingle();
    if (!target || target.role !== "content_partner") {
      throw new Error("Target is not a partner user.");
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.active, updated_by: userId, updated_at: new Date().toISOString() })
      .eq("id", data.profileId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
