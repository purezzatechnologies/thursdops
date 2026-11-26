import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  IMPORT_ENTITIES, LENIENT_ENTITIES, USER_ROLES, CONTRACT_PLANS, CONTRACT_STATUS,
  TASK_STATUS, TASK_PRIORITY, DELIVERABLE_TYPES,
  type ImportEntity, type RowResult, type ImportResult, type IncompleteRecord,
} from "@/lib/bulk-import-spec";

const InputZ = z.object({
  entity: z.enum(IMPORT_ENTITIES),
  rows: z.array(z.record(z.string(), z.string())).max(2000),
  commit: z.boolean().default(false),
  /** Lenient mode: import rows with missing/unresolved data, flagged for verification. */
  allowIncomplete: z.boolean().default(false),
});

const DEFAULT_PASSWORD = "Demo2026!";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PH_TEXT = "(to verify)";
const today = () => new Date().toISOString().slice(0, 10);

class RowError extends Error {}
/** Per-row coercion context — collects missing/unresolved fields in lenient mode. */
interface Ctx { lenient: boolean; missing: string[] }

const txt = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};

// ── strict coercions (used when a sensible default exists) ─────────────────
function boolOf(v: unknown, def: boolean, field: string, ctx: Ctx): boolean {
  const s = txt(v);
  if (s == null) return def;
  if (/^(true|yes|y|1)$/i.test(s)) return true;
  if (/^(false|no|n|0)$/i.test(s)) return false;
  if (ctx.lenient) { ctx.missing.push(`${field} (invalid)`); return def; }
  throw new RowError(`${field} "${s}" is not a valid true/false value`);
}
function intOf(v: unknown, field: string, ctx: Ctx, def = 0): number {
  const s = txt(v);
  if (s == null) return def;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) {
    if (ctx.lenient) { ctx.missing.push(`${field} (invalid)`); return def; }
    throw new RowError(`${field} "${s}" is not a non-negative whole number`);
  }
  return n;
}
function optDate(v: unknown, field: string, ctx: Ctx): string | null {
  const s = txt(v);
  if (s == null) return null;
  if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) {
    if (ctx.lenient) { ctx.missing.push(`${field} (invalid)`); return null; }
    throw new RowError(`${field} "${s}" must be a valid date (YYYY-MM-DD)`);
  }
  return s;
}

// ── required coercions (lenient → placeholder + flag, strict → throw) ──────
function reqText(v: unknown, field: string, ctx: Ctx, ph = PH_TEXT): string {
  const s = txt(v);
  if (s != null) return s;
  if (ctx.lenient) { ctx.missing.push(field); return ph; }
  throw new RowError(`${field} is required`);
}
function reqDate(v: unknown, field: string, ctx: Ctx): string {
  const s = txt(v);
  if (s == null) { if (ctx.lenient) { ctx.missing.push(field); return today(); } throw new RowError(`${field} is required`); }
  if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) {
    if (ctx.lenient) { ctx.missing.push(`${field} (invalid)`); return today(); }
    throw new RowError(`${field} "${s}" must be a valid date (YYYY-MM-DD)`);
  }
  return s;
}
function enumOf(v: unknown, list: readonly string[], field: string, ctx: Ctx, def?: string): string {
  const s = txt(v);
  if (s == null) {
    if (def != null) return def;
    if (ctx.lenient) { ctx.missing.push(field); return list[0]; }
    throw new RowError(`${field} is required`);
  }
  if (!list.includes(s)) {
    if (ctx.lenient) { ctx.missing.push(`${field} (invalid)`); return def ?? list[0]; }
    throw new RowError(`${field} "${s}" is invalid — allowed: ${list.join(", ")}`);
  }
  return s;
}

async function assertSuperAdmin(admin: any, userId: string) {
  const { data } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!data || data.role !== "super_admin") throw new Error("Forbidden: super admins only.");
}

export const bulkImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => InputZ.parse(d))
  .handler(async ({ data, context }): Promise<ImportResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = supabaseAdmin;
    await assertSuperAdmin(admin, context.userId);

    const entity = data.entity as ImportEntity;
    const commit = data.commit;
    const lenientAllowed = data.allowIncomplete && LENIENT_ENTITIES.includes(entity);
    const results: RowResult[] = [];

    // ── Prefetch lookup tables ─────────────────────────────────────────────
    const partnersByName = new Map<string, string>();
    { const { data: ps } = await admin.from("content_partners").select("id,name"); for (const p of ps ?? []) partnersByName.set(p.name.trim().toLowerCase(), p.id); }
    const profilesByEmail = new Map<string, string>();
    { const { data: us } = await admin.from("profiles").select("id,email"); for (const u of us ?? []) if (u.email) profilesByEmail.set(u.email.trim().toLowerCase(), u.id); }

    const contractsByPartner = new Map<string, { id: string; start_date: string }[]>();
    const existingContractKeys = new Set<string>();
    const existingTaskKeys = new Set<string>();
    if (entity === "contracts" || entity === "tasks") {
      const { data: cs } = await admin.from("contracts").select("id,content_partner_id,start_date,end_date");
      for (const c of cs ?? []) {
        const arr = contractsByPartner.get(c.content_partner_id) ?? [];
        arr.push({ id: c.id, start_date: c.start_date });
        contractsByPartner.set(c.content_partner_id, arr);
        existingContractKeys.add(`${c.content_partner_id}|${c.start_date}|${c.end_date}`);
      }
    }
    if (entity === "tasks") {
      const { data: ts } = await admin.from("tasks").select("contract_id,title,due_date");
      for (const t of ts ?? []) existingTaskKeys.add(`${t.contract_id ?? "editorial"}|${t.title.trim().toLowerCase()}|${t.due_date}`);
    }

    const seenPartnerNames = new Set<string>([...partnersByName.keys()]);
    const seenEmails = new Set<string>([...profilesByEmail.keys()]);

    const resolvePartnerHard = (name: string): string => {
      const id = partnersByName.get(name.toLowerCase());
      if (!id) throw new RowError(`partner "${name}" not found — import it first (Content Partners)`);
      return id;
    };
    const resolveUser = (email: string, field: string, ctx: Ctx): string | null => {
      const id = profilesByEmail.get(email.toLowerCase());
      if (id) return id;
      if (ctx.lenient) { ctx.missing.push(`${field} (unknown)`); return null; }
      throw new RowError(`${field} "${email}" is not an existing user`);
    };

    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      const rowNo = i + 1;
      const ctx: Ctx = { lenient: lenientAllowed, missing: [] };
      try {
        if (entity === "content_partners") {
          const name = reqText(r.name, "name", ctx, "(unnamed partner)");
          if (seenPartnerNames.has(name.toLowerCase()) && name !== "(unnamed partner)") { results.push({ row: rowNo, action: "skip", message: "partner with this name already exists", summary: name }); continue; }
          const flagged = ctx.lenient && ctx.missing.length > 0;
          const rec = {
            name, company_details: txt(r.company_details), contact_email: txt(r.contact_email),
            contact_phone: txt(r.contact_phone), notes: txt(r.notes),
            is_active: boolOf(r.is_active, true, "is_active", ctx),
            show_kpi_data: boolOf(r.show_kpi_data, false, "show_kpi_data", ctx),
            needs_verification: flagged, verification_note: flagged ? ctx.missing.join(", ") : null,
            updated_by: context.userId,
          };
          if (commit) { const { data: ins, error } = await admin.from("content_partners").insert(rec).select("id").single(); if (error) throw new RowError(error.message); partnersByName.set(name.toLowerCase(), ins.id); }
          seenPartnerNames.add(name.toLowerCase());
          results.push({ row: rowNo, action: flagged ? "incomplete" : "insert", summary: name, missing: flagged ? ctx.missing : undefined });

        } else if (entity === "users") {
          // Users are strict — a login can't exist without a real email + role.
          const email = reqText(r.email, "email", { lenient: false, missing: [] }).toLowerCase();
          const role = enumOf(r.role, USER_ROLES, "role", { lenient: false, missing: [] });
          const fullName = txt(r.full_name);
          const isActive = boolOf(r.is_active, true, "is_active", { lenient: false, missing: [] });
          const partnerName = txt(r.partner_name);
          let partnerId: string | null = null;
          if (role === "content_partner") { if (!partnerName) throw new RowError("partner_name is required for content_partner users"); partnerId = resolvePartnerHard(partnerName); }
          if (seenEmails.has(email)) { results.push({ row: rowNo, action: "skip", message: "a user with this email already exists", summary: `${email} (${role})` }); continue; }
          if (commit) {
            const pw = txt(r.password) ?? DEFAULT_PASSWORD;
            const { data: created, error: authErr } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: fullName ? { full_name: fullName } : {} });
            if (authErr || !created?.user) throw new RowError(authErr?.message ?? "could not create login");
            const uid = created.user.id;
            const { error: profErr } = await admin.from("profiles").insert({ id: uid, email, full_name: fullName, role, is_active: isActive });
            if (profErr) { await admin.auth.admin.deleteUser(uid).catch(() => {}); throw new RowError(profErr.message); }
            if (partnerId) { const { error: linkErr } = await admin.from("partner_users").insert({ profile_id: uid, content_partner_id: partnerId }); if (linkErr) throw new RowError(`login created but partner link failed: ${linkErr.message}`); }
            profilesByEmail.set(email, uid);
          }
          seenEmails.add(email);
          results.push({ row: rowNo, action: "insert", summary: `${email} (${role})${partnerName ? ` → ${partnerName}` : ""}` });

        } else if (entity === "contracts") {
          const partnerName = reqText(r.partner_name, "partner_name", { lenient: false, missing: [] });
          const partnerId = resolvePartnerHard(partnerName); // hard: FK NOT NULL
          const start = reqDate(r.start_date, "start_date", ctx);
          const end = reqDate(r.end_date, "end_date", ctx);
          if (!ctx.missing.includes("start_date") && !ctx.missing.includes("end_date") && Date.parse(end) <= Date.parse(start)) {
            if (ctx.lenient) ctx.missing.push("end_date (before start)"); else throw new RowError("end_date must be after start_date");
          }
          const key = `${partnerId}|${start}|${end}`;
          if (existingContractKeys.has(key) && ctx.missing.length === 0) { results.push({ row: rowNo, action: "skip", message: "a contract with this partner + dates already exists", summary: `${partnerName} ${start}→${end}` }); continue; }
          const ownerEmails = (txt(r.owner_emails) ?? "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
          const ownerIds = ownerEmails.map((e) => resolveUser(e, "owner_emails", ctx)).filter((x): x is string => !!x);
          const flagged = ctx.lenient && ctx.missing.length > 0;
          const rec = {
            content_partner_id: partnerId,
            plan_type: enumOf(r.plan_type, CONTRACT_PLANS, "plan_type", ctx, "monthly"),
            start_date: start, end_date: end,
            status: enumOf(r.status, CONTRACT_STATUS, "status", ctx, "draft"),
            total_articles: intOf(r.total_articles, "total_articles", ctx),
            total_newsletters: intOf(r.total_newsletters, "total_newsletters", ctx),
            total_homepage_banners: intOf(r.total_homepage_banners, "total_homepage_banners", ctx),
            total_article_banners: intOf(r.total_article_banners, "total_article_banners", ctx),
            total_social_posts: intOf(r.total_social_posts, "total_social_posts", ctx),
            notes: txt(r.notes),
            needs_verification: flagged, verification_note: flagged ? ctx.missing.join(", ") : null,
            updated_by: context.userId,
          };
          if (commit) {
            const { data: ins, error } = await admin.from("contracts").insert(rec).select("id").single(); if (error) throw new RowError(error.message);
            if (ownerIds.length) { const { error: oErr } = await admin.from("contract_owners").insert(ownerIds.map((pid) => ({ contract_id: ins.id, profile_id: pid }))); if (oErr) throw new RowError(`contract created but owners failed: ${oErr.message}`); }
            const arr = contractsByPartner.get(partnerId) ?? []; arr.push({ id: ins.id, start_date: start }); contractsByPartner.set(partnerId, arr);
          }
          existingContractKeys.add(key);
          results.push({ row: rowNo, action: flagged ? "incomplete" : "insert", summary: `${partnerName} ${start}→${end}`, missing: flagged ? ctx.missing : undefined });

        } else if (entity === "tasks") {
          const title = reqText(r.title, "title", ctx, "(untitled import)");
          const deliverableType = enumOf(r.deliverable_type, DELIVERABLE_TYPES, "deliverable_type", ctx, "article");
          const due = reqDate(r.due_date, "due_date", ctx);
          const partnerName = txt(r.partner_name);
          let contractId: string | null = null;
          let origin = "editorial";
          if (partnerName) {
            const partnerId = partnersByName.get(partnerName.toLowerCase());
            if (!partnerId) {
              if (ctx.lenient) { ctx.missing.push("partner_name (not found → editorial)"); }
              else throw new RowError(`partner "${partnerName}" not found — import it first, or leave partner_name blank`);
            } else {
              const contracts = contractsByPartner.get(partnerId) ?? [];
              const wantStart = optDate(r.contract_start_date, "contract_start_date", ctx);
              if (contracts.length === 0) {
                if (ctx.lenient) ctx.missing.push("partner_name (no contract → editorial)");
                else throw new RowError(`partner "${partnerName}" has no contracts — import one first, or leave partner_name blank`);
              } else if (wantStart) {
                const m = contracts.find((c) => c.start_date === wantStart);
                if (m) { contractId = m.id; origin = "contract"; }
                else if (ctx.lenient) ctx.missing.push("contract_start_date (no match → editorial)");
                else throw new RowError(`no contract for "${partnerName}" starting ${wantStart}`);
              } else if (contracts.length === 1) { contractId = contracts[0].id; origin = "contract"; }
              else if (ctx.lenient) ctx.missing.push(`partner has ${contracts.length} contracts (→ editorial; add contract_start_date)`);
              else throw new RowError(`"${partnerName}" has ${contracts.length} contracts — add contract_start_date to pick one`);
            }
          }
          const key = `${contractId ?? "editorial"}|${title.toLowerCase()}|${due}`;
          if (existingTaskKeys.has(key) && ctx.missing.length === 0) { results.push({ row: rowNo, action: "skip", message: "a task with this title + due date already exists", summary: title }); continue; }
          const flagged = ctx.lenient && ctx.missing.length > 0;
          const rec = {
            contract_id: contractId, deliverable_type: deliverableType, title, brief: txt(r.brief),
            assigned_to: (() => { const e = txt(r.assignee_email); return e ? resolveUser(e, "assignee_email", ctx) : null; })(),
            due_date: due,
            status: enumOf(r.status, TASK_STATUS, "status", ctx, "not_started"),
            priority: enumOf(r.priority, TASK_PRIORITY, "priority", ctx, "normal"),
            is_extra: boolOf(r.is_extra, false, "is_extra", ctx), task_origin: origin,
            week_start: optDate(r.week_start, "week_start", ctx), week_label: txt(r.week_label),
            priority_bucket: txt(r.priority_bucket), featured_image_url: txt(r.featured_image_url),
            needs_verification: flagged, verification_note: flagged ? ctx.missing.join(", ") : null,
            updated_by: context.userId,
          };
          if (commit) { const { error } = await admin.from("tasks").insert(rec); if (error) throw new RowError(error.message); }
          existingTaskKeys.add(key);
          results.push({ row: rowNo, action: flagged ? "incomplete" : "insert", summary: `${title} · ${deliverableType}${origin === "contract" ? ` · ${partnerName}` : " · editorial"}`, missing: flagged ? ctx.missing : undefined });

        } else if (entity === "partner_requests") {
          const partnerName = reqText(r.partner_name, "partner_name", { lenient: false, missing: [] });
          const partnerId = resolvePartnerHard(partnerName); // hard: FK NOT NULL
          const subject = reqText(r.subject, "subject", ctx, "(no subject)");
          const message = reqText(r.message, "message", ctx, "(no message)");
          const createdByEmail = txt(r.created_by_email);
          const createdBy = createdByEmail ? (resolveUser(createdByEmail, "created_by_email", ctx) ?? context.userId) : context.userId;
          const flagged = ctx.lenient && ctx.missing.length > 0;
          const rec = {
            content_partner_id: partnerId, created_by: createdBy, subject, message,
            kind: txt(r.kind) ?? "query", status: txt(r.status) ?? "open",
            needs_verification: flagged, verification_note: flagged ? ctx.missing.join(", ") : null,
            updated_by: context.userId,
          };
          if (commit) { const { error } = await admin.from("partner_requests").insert(rec); if (error) throw new RowError(error.message); }
          results.push({ row: rowNo, action: flagged ? "incomplete" : "insert", summary: `${partnerName}: ${subject}`, missing: flagged ? ctx.missing : undefined });
        }
      } catch (e) {
        results.push({ row: rowNo, action: "error", message: e instanceof Error ? e.message : "unknown error" });
      }
    }

    return {
      entity, committed: commit, total: results.length,
      willInsert: results.filter((r) => r.action === "insert" || r.action === "incomplete").length,
      incomplete: results.filter((r) => r.action === "incomplete").length,
      skipped: results.filter((r) => r.action === "skip").length,
      errors: results.filter((r) => r.action === "error").length,
      results,
    };
  });

// ── Verification queue: list incomplete imports, and promote (clear flag) ──
export const listIncompleteImports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IncompleteRecord[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = supabaseAdmin;
    await assertSuperAdmin(admin, context.userId);
    const out: IncompleteRecord[] = [];

    const partnerNames = new Map<string, string>();
    { const { data } = await admin.from("content_partners").select("id,name"); for (const p of data ?? []) partnerNames.set(p.id, p.name); }

    const [{ data: ps }, { data: cs }, { data: ts }, { data: prq }] = await Promise.all([
      admin.from("content_partners").select("id,name,verification_note,created_at").eq("needs_verification", true),
      admin.from("contracts").select("id,content_partner_id,start_date,end_date,verification_note,created_at").eq("needs_verification", true),
      admin.from("tasks").select("id,title,verification_note,created_at").eq("needs_verification", true),
      admin.from("partner_requests").select("id,subject,verification_note,created_at").eq("needs_verification", true),
    ]);
    for (const p of ps ?? []) out.push({ entity: "content_partners", id: p.id, label: p.name, note: p.verification_note, created_at: p.created_at });
    for (const c of cs ?? []) out.push({ entity: "contracts", id: c.id, label: `${partnerNames.get(c.content_partner_id) ?? "?"} · ${c.start_date}→${c.end_date}`, note: c.verification_note, created_at: c.created_at });
    for (const t of ts ?? []) out.push({ entity: "tasks", id: t.id, label: t.title, note: t.verification_note, created_at: t.created_at });
    for (const q of prq ?? []) out.push({ entity: "partner_requests", id: q.id, label: q.subject, note: q.verification_note, created_at: q.created_at });

    out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return out;
  });

export const markImportVerified = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ entity: z.enum(LENIENT_ENTITIES as [ImportEntity, ...ImportEntity[]]), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = supabaseAdmin;
    await assertSuperAdmin(admin, context.userId);
    const { error } = await admin.from(data.entity).update({ needs_verification: false, verification_note: null, updated_by: context.userId }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
