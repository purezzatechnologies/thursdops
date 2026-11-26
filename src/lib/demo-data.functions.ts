import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Demo / test-data manager (super admin only).
 *
 * SECURITY MODEL: every demo record uses a hard-coded ID from the manifest
 * below. Import, status and delete only ever reference these exact IDs, so a
 * delete can never touch real data — it is not derived from user input or any
 * heuristic. All three operations reject non-super-admins server-side.
 */

// ── Fixed demo record IDs (the single source of truth) ──────────────────
const DP = ["d0d00001-0000-0000-0000-000000000001", "d0d00001-0000-0000-0000-000000000002"];
const DC = ["d0d00002-0000-0000-0000-000000000001", "d0d00002-0000-0000-0000-000000000002", "d0d00002-0000-0000-0000-000000000003"];
const DO = ["d0d00003-0000-0000-0000-000000000001", "d0d00003-0000-0000-0000-000000000002", "d0d00003-0000-0000-0000-000000000003"];
const DT = Array.from({ length: 8 }, (_, i) => `d0d00004-0000-0000-0000-00000000000${i + 1}`);
const DS = Array.from({ length: 5 }, (_, i) => `d0d00005-0000-0000-0000-00000000000${i + 1}`);
const DK = ["d0d00007-0000-0000-0000-000000000001", "d0d00007-0000-0000-0000-000000000002"];
const DN = ["d0d0000a-0000-0000-0000-000000000001", "d0d0000a-0000-0000-0000-000000000002", "d0d0000a-0000-0000-0000-000000000003"];

// Demo partner LOGIN accounts (auth users with role content_partner), linked to
// the demo partner companies. Supabase generates the auth-user id, so these are
// identified for cleanup by the demo partner ids they link to (via partner_users).
const DEMO_PARTNER_PASSWORD = "Demo2026!";
const DEMO_PARTNER_LOGINS = [
  { partnerId: DP[0], email: "bloom.partner@thursd.com", fullName: "Bloom & Co (Demo Partner)" },
  { partnerId: DP[1], email: "verdant.partner@thursd.com", fullName: "Verdant Studio (Demo Partner)" },
];

const IDS: Record<string, string[]> = {
  content_partners: DP,
  contracts: DC,
  contract_owners: DO,
  tasks: DT,
  submissions: DS,
  kpi_snapshots: DK,
  notifications: DN,
};

// Reverse-FK order for deletion (children first).
const DELETE_ORDER = [
  "notifications",
  "kpi_snapshots",
  "submissions",
  "contract_owners",
  "tasks",
  "contracts",
  "content_partners",
] as const;

const TABLE_LABEL: Record<string, string> = {
  content_partners: "Partners",
  contracts: "Contracts",
  contract_owners: "Contract owners",
  tasks: "Tasks",
  submissions: "Submissions",
  kpi_snapshots: "KPI snapshots",
  notifications: "Notifications",
};

async function assertSuperAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (!data || data.role !== "super_admin") {
    throw new Error("Forbidden: super admins only.");
  }
}

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};
// Thursday-anchored week start (weeks run Thu → Wed in this app).
function weekStartFor(due: Date) {
  const d = new Date(due);
  const diff = (d.getDay() - 4 + 7) % 7;
  d.setDate(d.getDate() - diff);
  return dateOnly(d);
}
function isoWeekLabel(due: Date) {
  const d = new Date(Date.UTC(due.getFullYear(), due.getMonth(), due.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `W${week}`;
}

/** Status: how many demo records currently exist, per table. */
export const getDemoDataStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    const byTable: { table: string; label: string; count: number; total: number }[] = [];
    let total = 0;
    for (const [table, ids] of Object.entries(IDS)) {
      const { count } = await supabaseAdmin
        .from(table)
        .select("id", { count: "exact", head: true })
        .in("id", ids);
      const c = count ?? 0;
      total += c;
      byTable.push({ table, label: TABLE_LABEL[table] ?? table, count: c, total: ids.length });
    }
    return { present: total > 0, total, byTable };
  });

/** Import: (re)create the demo dataset. Idempotent (upsert by id). */
export const seedDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);

    // Reference real staff so the demo set is self-contained.
    const { data: staff } = await supabaseAdmin
      .from("profiles")
      .select("id,role")
      .in("role", ["manager", "super_admin", "editor", "ops_support"])
      .eq("is_active", true);
    const managers = (staff ?? []).filter((s) => s.role === "manager" || s.role === "super_admin").map((s) => s.id);
    const editors = (staff ?? []).filter((s) => s.role === "editor").map((s) => s.id);
    const opsList = (staff ?? []).filter((s) => s.role === "ops_support").map((s) => s.id);
    if (managers.length === 0) throw new Error("Need at least one manager/admin to attach demo data to.");
    const mgr = (i: number) => managers[i % managers.length];
    const edi = (i: number) => (editors.length ? editors[i % editors.length] : managers[i % managers.length]);
    const ops = opsList[0] ?? editors[0] ?? managers[0];
    const me = context.userId;

    // Partners
    await supabaseAdmin.from("content_partners").upsert([
      { id: DP[0], name: "[Demo] Bloom & Co", company_details: "Test partner — safe to delete.", contact_email: "hello@demo-bloom.test", contact_phone: "+00 000 0001", is_active: true, updated_by: me },
      { id: DP[1], name: "[Demo] Verdant Studio", company_details: "Test partner — safe to delete.", contact_email: "team@demo-verdant.test", contact_phone: "+00 000 0002", is_active: true, updated_by: me },
    ], { onConflict: "id" });

    // Partner LOGIN accounts — so partners can actually sign in and appear in the
    // Content Partners section of /demo-login. Idempotent: reuse by email if present.
    for (const p of DEMO_PARTNER_LOGINS) {
      const { data: existing } = await supabaseAdmin
        .from("profiles").select("id").ilike("email", p.email).maybeSingle();
      let uid = existing?.id as string | undefined;
      if (!uid) {
        const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
          email: p.email,
          password: DEMO_PARTNER_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: p.fullName },
        });
        if (cErr || !created?.user) throw new Error(cErr?.message ?? "Failed to create demo partner login.");
        uid = created.user.id;
        const { error: pErr } = await supabaseAdmin.from("profiles").insert({
          id: uid, email: p.email, full_name: p.fullName, role: "content_partner", is_active: true, updated_by: me,
        });
        if (pErr) throw new Error(pErr.message);
      } else {
        await supabaseAdmin.from("profiles")
          .update({ is_active: true, role: "content_partner", full_name: p.fullName, updated_by: me })
          .eq("id", uid);
      }
      // Ensure the profile is linked to its demo partner company.
      const { data: link } = await supabaseAdmin.from("partner_users")
        .select("profile_id").eq("profile_id", uid).eq("content_partner_id", p.partnerId).maybeSingle();
      if (!link) {
        const { error: lErr } = await supabaseAdmin.from("partner_users")
          .insert({ profile_id: uid, content_partner_id: p.partnerId, updated_by: me });
        if (lErr) throw new Error(lErr.message);
      }
    }

    // Contracts
    await supabaseAdmin.from("contracts").upsert([
      { id: DC[0], content_partner_id: DP[0], plan_type: "monthly", start_date: dateOnly(addDays(-20)), end_date: dateOnly(addDays(10)), status: "active", total_articles: 3, total_newsletters: 1, total_homepage_banners: 1, total_article_banners: 1, total_social_posts: 4, notes: "Demo contract", updated_by: me },
      { id: DC[1], content_partner_id: DP[0], plan_type: "quarterly", start_date: dateOnly(addDays(-60)), end_date: dateOnly(addDays(30)), status: "active", total_articles: 6, total_newsletters: 3, total_homepage_banners: 1, total_article_banners: 2, total_social_posts: 8, notes: "Demo contract", updated_by: me },
      { id: DC[2], content_partner_id: DP[1], plan_type: "six_month", start_date: dateOnly(addDays(-40)), end_date: dateOnly(addDays(140)), status: "active", total_articles: 12, total_newsletters: 6, total_homepage_banners: 2, total_article_banners: 4, total_social_posts: 18, notes: "Demo contract", updated_by: me },
    ], { onConflict: "id" });

    // Contract owners (managers)
    await supabaseAdmin.from("contract_owners").upsert([
      { id: DO[0], contract_id: DC[0], profile_id: mgr(0), updated_by: me },
      { id: DO[1], contract_id: DC[1], profile_id: mgr(1), updated_by: me },
      { id: DO[2], contract_id: DC[2], profile_id: mgr(0), updated_by: me },
    ], { onConflict: "id" });

    // Tasks across statuses
    const t = (id: string, contract: string, type: string, title: string, dueOffset: number, status: string, priority: string, assignee: string, brief = "Demo task.") => {
      const due = addDays(dueOffset);
      return { id, contract_id: contract, deliverable_type: type, title, brief, assigned_to: assignee, due_date: dateOnly(due), status, priority, is_extra: false, week_start: weekStartFor(due), week_label: isoWeekLabel(due), task_origin: "contract", updated_by: me };
    };
    await supabaseAdmin.from("tasks").upsert([
      t(DT[0], DC[0], "article", "[Demo] Spring care guide", -8, "completed", "normal", edi(0)),
      t(DT[1], DC[0], "social_post", "[Demo] Launch reel", -6, "completed", "high", edi(1)),
      t(DT[2], DC[1], "homepage_banner", "[Demo] Hero banner", 1, "submitted", "high", edi(0)),
      t(DT[3], DC[1], "article", "[Demo] Trend feature", 3, "in_progress", "normal", edi(1)),
      t(DT[4], DC[2], "article_banner", "[Demo] Inline banner", -1, "rework_requested", "normal", edi(0)),
      t(DT[5], DC[2], "newsletter", "[Demo] Monthly update", 4, "in_progress", "normal", edi(1)),
      t(DT[6], DC[0], "social_post", "[Demo] Behind the scenes", 6, "not_started", "high", edi(0)),
      t(DT[7], DC[2], "article", "[Demo] Autumn preview", 9, "not_started", "normal", edi(1)),
    ], { onConflict: "id" });

    // Submissions across statuses
    const nowIso = new Date().toISOString();
    const ago = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
    await supabaseAdmin.from("submissions").upsert([
      { id: DS[0], task_id: DT[0], submission_type: "url", url: "https://demo.test/spring-care", status: "approved", submitted_by: edi(0), submitted_at: ago(72), reviewed_by: mgr(0), reviewed_at: ago(60), review_comments: "Approved — demo.", updated_by: me },
      { id: DS[1], task_id: DT[1], submission_type: "social_link", url: "https://demo.test/launch-reel", status: "approved", submitted_by: edi(1), submitted_at: ago(70), reviewed_by: mgr(1), reviewed_at: ago(55), review_comments: null, updated_by: me },
      { id: DS[2], task_id: DT[2], submission_type: "url", url: "https://demo.test/hero-banner", status: "submitted", submitted_by: edi(0), submitted_at: ago(5), reviewed_by: null, reviewed_at: null, review_comments: null, updated_by: me },
      { id: DS[3], task_id: DT[4], submission_type: "screenshot", screenshot_url: "https://demo.test/banner-v1.png", status: "rework_requested", submitted_by: edi(0), submitted_at: ago(40), reviewed_by: mgr(0), reviewed_at: ago(28), review_comments: "Tighten the crop — demo.", updated_by: me },
      { id: DS[4], task_id: DT[3], submission_type: "text", text_content: "Draft in progress — demo.", status: "draft", submitted_by: edi(1), submitted_at: null, reviewed_by: null, reviewed_at: null, review_comments: null, updated_by: me },
    ], { onConflict: "id" });

    // KPI snapshots (one pending QC, one approved)
    await supabaseAdmin.from("kpi_snapshots").upsert([
      { id: DK[0], submission_id: DS[0], recorded_date: dateOnly(addDays(-2)), clicks: 820, impressions: 14200, engagement_rate: 0.058, notes: "Demo metrics", status: "pending_qc", entered_by: ops, updated_by: me },
      { id: DK[1], submission_id: DS[1], recorded_date: dateOnly(addDays(-3)), clicks: 2100, impressions: 30500, engagement_rate: 0.069, status: "qc_approved", qc_approved_by: mgr(0), qc_approved_at: ago(48), qc_comments: "Verified — demo.", entered_by: ops, updated_by: me },
    ], { onConflict: "id" });

    // Notifications for staff
    await supabaseAdmin.from("notifications").upsert([
      { id: DN[0], recipient_id: mgr(0), type: "submission_submitted", title: "[Demo] Submission needs review: Hero banner", body: "By demo editor · [Demo] Bloom & Co", link: `/manager/approvals/${DS[2]}`, created_at: nowIso },
      { id: DN[1], recipient_id: edi(0), type: "submission_rework_requested", title: "[Demo] Rework requested: Inline banner", body: "Tighten the crop — demo.", link: `/editor/tasks/${DT[4]}`, created_at: ago(28) },
      { id: DN[2], recipient_id: mgr(1), type: "submission_approved", title: "[Demo] Submission approved: Launch reel", body: "Demo activity", link: `/manager/approvals/${DS[1]}`, created_at: ago(55) },
    ], { onConflict: "id" });

    const status = await countAll();
    return { ok: true, total: status.total, byTable: status.byTable };
  });

async function countAll() {
  const byTable: { table: string; label: string; count: number; total: number }[] = [];
  let total = 0;
  for (const [table, ids] of Object.entries(IDS)) {
    const { count } = await supabaseAdmin.from(table).select("id", { count: "exact", head: true }).in("id", ids);
    const c = count ?? 0;
    total += c;
    byTable.push({ table, label: TABLE_LABEL[table] ?? table, count: c, total: ids.length });
  }
  return { total, byTable };
}

/** Disable or delete the demo dataset. */
export const clearDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ mode: z.enum(["disable", "delete"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    if (data.mode === "disable") {
      // Reversible: deactivate demo partners (drop out of active lists).
      const { error } = await supabaseAdmin
        .from("content_partners")
        .update({ is_active: false, updated_by: context.userId, updated_at: new Date().toISOString() })
        .in("id", DP);
      if (error) throw new Error(error.message);
      // Also deactivate their login accounts so they drop off /demo-login.
      const { data: links } = await supabaseAdmin.from("partner_users").select("profile_id").in("content_partner_id", DP);
      const ids = (links ?? []).map((l) => l.profile_id);
      if (ids.length) {
        await supabaseAdmin.from("profiles")
          .update({ is_active: false, updated_by: context.userId, updated_at: new Date().toISOString() })
          .in("id", ids);
      }
      return { ok: true, mode: "disable" as const };
    }

    // Remove demo partner login accounts first (auth users + profiles + links),
    // since partner_users references the demo partner companies deleted below.
    const { data: pLinks } = await supabaseAdmin.from("partner_users").select("profile_id").in("content_partner_id", DP);
    const pIds = (pLinks ?? []).map((l) => l.profile_id);
    if (pIds.length) {
      await supabaseAdmin.from("partner_users").delete().in("profile_id", pIds);
      await supabaseAdmin.from("profiles").delete().in("id", pIds);
      for (const id of pIds) {
        try { await supabaseAdmin.auth.admin.deleteUser(id); } catch { /* ignore missing */ }
      }
    }

    // delete: children first, only ever the hard-coded demo IDs.
    for (const table of DELETE_ORDER) {
      const ids = IDS[table];
      const { error } = await supabaseAdmin.from(table).delete().in("id", ids);
      if (error) throw new Error(`Failed clearing ${table}: ${error.message}`);
    }
    return { ok: true, mode: "delete" as const };
  });
