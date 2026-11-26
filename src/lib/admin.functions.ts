import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEMO_PASSWORD = "Demo2026!";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (!data || data.role !== "super_admin") {
    throw new Error("Super admin access required.");
  }
}

const createUserSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(255),
  role: z.enum(["super_admin", "manager", "editor", "ops_support", "content_partner"]),
  partnerId: z.string().uuid().nullable().optional(),
});

export const createInternalUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createUserSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.role === "content_partner" && !data.partnerId) {
      throw new Error("Partner is required for content_partner role.");
    }

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", data.email)
      .maybeSingle();
    if (existing) throw new Error("A user with this email already exists.");

    const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (authErr || !created.user) throw new Error(authErr?.message ?? "Auth create failed");
    const newId = created.user.id;

    try {
      const { error: pErr } = await supabaseAdmin.from("profiles").insert({
        id: newId,
        email: data.email,
        full_name: data.fullName,
        role: data.role,
        is_active: true,
        updated_by: context.userId,
      });
      if (pErr) throw pErr;
      if (data.role === "content_partner" && data.partnerId) {
        const { error: lErr } = await supabaseAdmin.from("partner_users").insert({
          profile_id: newId,
          content_partner_id: data.partnerId,
          updated_by: context.userId,
        });
        if (lErr) throw lErr;
      }
    } catch (e) {
      await supabaseAdmin.from("partner_users").delete().eq("profile_id", newId);
      await supabaseAdmin.from("profiles").delete().eq("id", newId);
      await supabaseAdmin.auth.admin.deleteUser(newId);
      throw e instanceof Error ? e : new Error("Create failed");
    }
    return { userId: newId, email: data.email, tempPassword: DEMO_PASSWORD };
  });

const updateUserSchema = z.object({
  profileId: z.string().uuid(),
  fullName: z.string().trim().min(1).max(200).optional(),
  role: z.enum(["super_admin", "manager", "editor", "ops_support", "content_partner"]).optional(),
  isActive: z.boolean().optional(),
  partnerId: z.string().uuid().nullable().optional(),
});

export const updateInternalUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => updateUserSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("id, role, is_active, full_name")
      .eq("id", data.profileId)
      .maybeSingle();
    if (!target) throw new Error("User not found.");

    // Guard: can't deactivate / demote the last active super_admin
    const goingInactive = data.isActive === false && target.is_active;
    const goingNonAdmin =
      data.role && data.role !== "super_admin" && target.role === "super_admin";
    if (goingInactive || goingNonAdmin) {
      const { data: admins } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("role", "super_admin")
        .eq("is_active", true);
      const otherActive = (admins ?? []).filter((a) => a.id !== data.profileId).length;
      if (target.role === "super_admin" && otherActive === 0) {
        throw new Error("Cannot deactivate or change the only active Super Admin.");
      }
    }

    const updates: {
      updated_by: string;
      updated_at: string;
      full_name?: string;
      role?: "super_admin" | "manager" | "editor" | "ops_support" | "content_partner";
      is_active?: boolean;
    } = {
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (data.fullName !== undefined) updates.full_name = data.fullName;
    if (data.role !== undefined) updates.role = data.role;
    if (data.isActive !== undefined) updates.is_active = data.isActive;

    const { error } = await supabaseAdmin.from("profiles").update(updates).eq("id", data.profileId);
    if (error) throw new Error(error.message);

    // Handle partner link reassignment for content_partner role
    if (data.role === "content_partner" && data.partnerId) {
      await supabaseAdmin.from("partner_users").delete().eq("profile_id", data.profileId);
      const { error: lErr } = await supabaseAdmin.from("partner_users").insert({
        profile_id: data.profileId,
        content_partner_id: data.partnerId,
        updated_by: context.userId,
      });
      if (lErr) throw new Error(lErr.message);
    }
    // If role changed away from content_partner, remove links
    if (data.role && data.role !== "content_partner" && target.role === "content_partner") {
      await supabaseAdmin.from("partner_users").delete().eq("profile_id", data.profileId);
    }

    // Notify user on role change
    if (data.role && data.role !== target.role) {
      await supabaseAdmin.from("notifications").insert({
        recipient_id: data.profileId,
        type: "role_changed",
        title: "Your role has been updated.",
        body: `New role: ${data.role.replace(/_/g, " ")}. Please sign out and back in.`,
        link: "/",
      });
    }
    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: data.email,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAllUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id,email,full_name,role,is_active,created_at")
      .order("created_at", { ascending: false });
    const { data: links } = await supabaseAdmin
      .from("partner_users")
      .select("profile_id, content_partner_id, content_partners(name)");
    const linkMap = new Map<string, { partnerId: string; partnerName: string }>();
    for (const l of (links ?? []) as Array<{ profile_id: string; content_partner_id: string; content_partners: { name: string } | null }>) {
      linkMap.set(l.profile_id, {
        partnerId: l.content_partner_id,
        partnerName: l.content_partners?.name ?? "—",
      });
    }
    // Last sign-in via admin auth listUsers (best-effort, paginated up to 1000)
    const lastSignIn = new Map<string, string | null>();
    try {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of users?.users ?? []) {
        lastSignIn.set(u.id, u.last_sign_in_at ?? null);
      }
    } catch {
      // ignore — not critical
    }
    return {
      rows: (profiles ?? []).map((p) => ({
        ...p,
        partner: linkMap.get(p.id) ?? null,
        last_sign_in_at: lastSignIn.get(p.id) ?? null,
      })),
    };
  });
