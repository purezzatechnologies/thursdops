import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Role = "super_admin" | "manager" | "editor" | "ops_support" | "content_partner";

async function getRole(userId: string): Promise<{ role: Role; name: string }> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role,full_name,email")
    .eq("id", userId)
    .maybeSingle();
  if (!data) throw new Error("Profile not found.");
  return { role: data.role as Role, name: data.full_name ?? data.email };
}

function canWrite(role: Role) {
  return role === "ops_support" || role === "manager" || role === "super_admin";
}
function canQc(role: Role) {
  return role === "manager" || role === "super_admin";
}

async function notifyContractOwners(
  contractId: string,
  notif: { type: string; title: string; body: string | null; link: string },
) {
  const { data: owners } = await supabaseAdmin
    .from("contract_owners")
    .select("profile_id")
    .eq("contract_id", contractId);
  if (!owners?.length) return;
  await supabaseAdmin.from("notifications").insert(
    owners.map((o) => ({
      recipient_id: o.profile_id,
      type: notif.type,
      title: notif.title,
      body: notif.body,
      link: notif.link,
    })),
  );
}

/* ============================================================ */
/* KPI Entry queue — for ops_support, manager, super_admin       */
/* ============================================================ */

export const listKpiQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const { role } = await getRole(context.userId);
    if (!canWrite(role)) throw new Error("Forbidden");

    // All approved submissions
    const { data: subs } = await supabaseAdmin
      .from("submissions")
      .select("id,task_id,submission_type,url,reviewed_at,submitted_by,metadata")
      .eq("status", "approved")
      .order("reviewed_at", { ascending: false });
    const submissions = subs ?? [];
    if (submissions.length === 0) return { rows: [], stats: { awaitingFirst: 0, overdue: 0, myPending: 0, recentlyRejected: 0 } };

    const taskIds = [...new Set(submissions.map((s) => s.task_id))];
    const { data: tasks } = await supabaseAdmin
      .from("tasks")
      .select("id,title,deliverable_type,contract_id")
      .in("id", taskIds);
    const tMap = new Map((tasks ?? []).map((t) => [t.id, t]));

    const contractIds = [...new Set((tasks ?? []).map((t) => t.contract_id).filter((v): v is string => !!v))];
    const { data: contracts } = await supabaseAdmin
      .from("contracts")
      .select("id,content_partner_id")
      .in("id", contractIds);
    const cMap = new Map((contracts ?? []).map((c) => [c.id, c]));

    const partnerIds = [...new Set((contracts ?? []).map((c) => c.content_partner_id))];
    const { data: partners } = await supabaseAdmin
      .from("content_partners")
      .select("id,name")
      .in("id", partnerIds);
    const pMap = new Map((partners ?? []).map((p) => [p.id, p]));

    // Snapshots for these submissions
    const subIds = submissions.map((s) => s.id);
    const { data: snaps } = await supabaseAdmin
      .from("kpi_snapshots")
      .select("id,submission_id,recorded_date,clicks,impressions,engagement_rate,status,entered_by,created_at,updated_at")
      .in("submission_id", subIds)
      .order("recorded_date", { ascending: false });
    const latestBySub = new Map<string, NonNullable<typeof snaps>[number]>();
    for (const s of snaps ?? []) {
      if (!latestBySub.has(s.submission_id)) latestBySub.set(s.submission_id, s);
    }

    const now = Date.now();
    const rows = submissions.map((s) => {
      const task = tMap.get(s.task_id);
      const contract = task?.contract_id ? cMap.get(task.contract_id) : undefined;
      const partner = contract ? pMap.get(contract.content_partner_id) : undefined;
      const latest = latestBySub.get(s.id);
      const days = latest ? Math.floor((now - new Date(latest.recorded_date).getTime()) / 86400000) : null;
      return {
        submission_id: s.id,
        task_id: s.task_id,
        task_title: task?.title ?? "Untitled",
        contract_id: task?.contract_id ?? null,
        deliverable_type: task?.deliverable_type ?? "",
        submission_type: s.submission_type,
        url: s.url,
        partner_id: partner?.id ?? null,
        partner_name: partner?.name ?? "Unassigned partner",
        approved_at: s.reviewed_at,
        metadata: (s.metadata as Record<string, string> | null) ?? null,
        latest_snapshot: latest
          ? {
              id: latest.id,
              recorded_date: latest.recorded_date,
              clicks: latest.clicks,
              impressions: latest.impressions,
              engagement_rate: latest.engagement_rate,
              status: latest.status,
              days_since: days,
            }
          : null,
      };
    });

    // Stats
    const sevenDaysAgo = now - 7 * 86400000;
    const fourteenDaysAgo = now - 14 * 86400000;
    const awaitingFirst = rows.filter(
      (r) => !r.latest_snapshot && r.approved_at && new Date(r.approved_at).getTime() < sevenDaysAgo,
    ).length;
    const overdue = rows.filter(
      (r) => r.latest_snapshot && (r.latest_snapshot.days_since ?? 0) > 7,
    ).length;
    const myPending = (snaps ?? []).filter(
      (s) => s.entered_by === context.userId && s.status === "pending_qc",
    ).length;
    const recentlyRejected = (snaps ?? []).filter(
      (s) =>
        s.entered_by === context.userId &&
        s.status === "qc_rejected" &&
        new Date(s.updated_at).getTime() > fourteenDaysAgo,
    ).length;

    return { rows, stats: { awaitingFirst, overdue, myPending, recentlyRejected } };
  });

/* ============================================================ */
/* Snapshot save (create or edit)                                */
/* ============================================================ */

const SaveInput = z.object({
  snapshot_id: z.string().uuid().nullable().optional(),
  submission_id: z.string().uuid(),
  recorded_date: z.string(),
  clicks: z.number().int().min(0),
  impressions: z.number().int().min(0),
  engagement_rate: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const saveKpiSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SaveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { role, name } = await getRole(context.userId);
    if (!canWrite(role)) throw new Error("Forbidden");

    // Validate not future
    const today = new Date(); today.setHours(23, 59, 59, 999);
    if (new Date(data.recorded_date).getTime() > today.getTime()) {
      throw new Error("Recorded date cannot be in the future.");
    }

    const { data: sub } = await supabaseAdmin
      .from("submissions")
      .select("id,task_id")
      .eq("id", data.submission_id)
      .maybeSingle();
    if (!sub) throw new Error("Submission not found.");
    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select("id,title,contract_id")
      .eq("id", sub.task_id)
      .maybeSingle();
    if (!task) throw new Error("Task not found.");

    const now = new Date().toISOString();
    let originalEnteredBy: string | null = null;
    let wasApproved = false;

    if (data.snapshot_id) {
      const { data: existing } = await supabaseAdmin
        .from("kpi_snapshots")
        .select("id,entered_by,status,clicks,impressions,engagement_rate")
        .eq("id", data.snapshot_id)
        .maybeSingle();
      if (!existing) throw new Error("Snapshot not found.");
      originalEnteredBy = existing.entered_by;
      wasApproved = existing.status === "qc_approved";
      const { error } = await supabaseAdmin
        .from("kpi_snapshots")
        .update({
          recorded_date: data.recorded_date,
          clicks: data.clicks,
          impressions: data.impressions,
          engagement_rate: data.engagement_rate ?? null,
          notes: data.notes ?? null,
          updated_by: context.userId,
          updated_at: now,
        })
        .eq("id", data.snapshot_id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("kpi_snapshots")
        .insert({
          submission_id: data.submission_id,
          recorded_date: data.recorded_date,
          clicks: data.clicks,
          impressions: data.impressions,
          engagement_rate: data.engagement_rate ?? null,
          notes: data.notes ?? null,
          status: "pending_qc",
          entered_by: context.userId,
          updated_by: context.userId,
        });
      if (error) throw new Error(error.message);
    }

    // Notify contract owners that QC is needed
    if (task.contract_id) {
      await notifyContractOwners(task.contract_id, {
        type: "kpi_snapshot_pending_qc",
        title: `KPI snapshot needs QC — ${task.title}`,
        body: `Entered by ${name} on ${data.recorded_date}. Verify before partner sees.`,
        link: "/manager/kpi-qc",
      });
    }

    // If a manager edited someone else's snapshot, notify the entered_by
    if (
      data.snapshot_id &&
      originalEnteredBy &&
      originalEnteredBy !== context.userId
    ) {
      await supabaseAdmin.from("notifications").insert({
        recipient_id: originalEnteredBy,
        type: "kpi_snapshot_edited",
        title: `KPI snapshot edited — ${task.title}`,
        body: `${name} edited a snapshot you entered. Verify before re-approval.`,
        link: `/ops/kpi/submission/${data.submission_id}`,
      });
    }

    return { ok: true, was_qc_approved: wasApproved };
  });

/* ============================================================ */
/* QC actions                                                    */
/* ============================================================ */

export const approveKpiSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { role } = await getRole(context.userId);
    if (!canQc(role)) throw new Error("Forbidden");
    const now = new Date().toISOString();
    const { data: rows } = await supabaseAdmin
      .from("kpi_snapshots")
      .select("id,submission_id,entered_by,status")
      .in("id", data.ids);
    const targetable = (rows ?? []).filter((r) => r.status !== "qc_approved");
    if (!targetable.length) return { ok: true, updated: 0 };
    // Self-approval block: you cannot QC a KPI you entered yourself — another
    // manager must verify it (mirrors the submission approval rule).
    if (targetable.some((r) => r.entered_by === context.userId)) {
      const err = new Error("You entered one of these KPIs. Another manager must verify it.") as Error & { status?: number };
      err.status = 403;
      throw err;
    }
    const { error } = await supabaseAdmin
      .from("kpi_snapshots")
      .update({
        status: "qc_approved",
        qc_approved_by: context.userId,
        qc_approved_at: now,
        qc_comments: null,
        updated_by: context.userId,
        updated_at: now,
      })
      .in("id", targetable.map((r) => r.id));
    if (error) throw new Error(error.message);

    // Notifications
    const subIds = [...new Set(targetable.map((r) => r.submission_id))];
    const { data: subs } = await supabaseAdmin
      .from("submissions")
      .select("id,task_id")
      .in("id", subIds);
    const taskIds = [...new Set((subs ?? []).map((s) => s.task_id))];
    const { data: tasks } = await supabaseAdmin
      .from("tasks")
      .select("id,title")
      .in("id", taskIds);
    const tTitle = new Map((tasks ?? []).map((t) => [t.id, t.title]));
    const sToT = new Map((subs ?? []).map((s) => [s.id, s.task_id]));
    const notifs = targetable.map((r) => {
      const title = tTitle.get(sToT.get(r.submission_id) ?? "") ?? "snapshot";
      return {
        recipient_id: r.entered_by,
        type: "kpi_snapshot_approved",
        title: `KPI snapshot approved — ${title}`,
        body: null,
        link: `/ops/kpi/submission/${r.submission_id}`,
      };
    });
    if (notifs.length) await supabaseAdmin.from("notifications").insert(notifs);
    return { ok: true, updated: targetable.length };
  });

export const rejectKpiSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      comments: z.string().trim().min(1).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { role } = await getRole(context.userId);
    if (!canQc(role)) throw new Error("Forbidden");
    const { data: snap } = await supabaseAdmin
      .from("kpi_snapshots")
      .select("id,entered_by,submission_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!snap) throw new Error("Snapshot not found.");
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("kpi_snapshots")
      .update({
        status: "qc_rejected",
        qc_approved_by: null,
        qc_approved_at: null,
        qc_comments: data.comments,
        updated_by: context.userId,
        updated_at: now,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const { data: sub } = await supabaseAdmin
      .from("submissions").select("task_id").eq("id", snap.submission_id).maybeSingle();
    const { data: task } = sub ? await supabaseAdmin
      .from("tasks").select("title").eq("id", sub.task_id).maybeSingle() : { data: null };
    await supabaseAdmin.from("notifications").insert({
      recipient_id: snap.entered_by,
      type: "kpi_snapshot_rejected",
      title: `KPI snapshot needs correction — ${task?.title ?? "snapshot"}`,
      body: data.comments,
      link: `/ops/kpi/submission/${snap.submission_id}`,
    });
    return { ok: true };
  });

/* ============================================================ */
/* QC queue                                                      */
/* ============================================================ */

export const listKpiQcQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const { role } = await getRole(context.userId);
    if (!canQc(role)) throw new Error("Forbidden");

    const { data: pending } = await supabaseAdmin
      .from("kpi_snapshots")
      .select("id,submission_id,recorded_date,clicks,impressions,engagement_rate,notes,entered_by,created_at,status")
      .eq("status", "pending_qc")
      .order("created_at", { ascending: true });
    const rows = pending ?? [];

    const subIds = [...new Set(rows.map((r) => r.submission_id))];
    const { data: subs } = subIds.length ? await supabaseAdmin
      .from("submissions").select("id,task_id,submission_type,url,metadata").in("id", subIds) : { data: [] };
    const sMap = new Map((subs ?? []).map((s) => [s.id, s]));

    const taskIds = [...new Set((subs ?? []).map((s) => s.task_id))];
    const { data: tasks } = taskIds.length ? await supabaseAdmin
      .from("tasks").select("id,title,deliverable_type,contract_id").in("id", taskIds) : { data: [] };
    const tMap = new Map((tasks ?? []).map((t) => [t.id, t]));

    const cIds = [...new Set((tasks ?? []).map((t) => t.contract_id).filter((v): v is string => !!v))];
    const { data: contracts } = cIds.length ? await supabaseAdmin
      .from("contracts").select("id,content_partner_id").in("id", cIds) : { data: [] };
    const cMap = new Map((contracts ?? []).map((c) => [c.id, c]));

    const pIds = [...new Set((contracts ?? []).map((c) => c.content_partner_id))];
    const { data: parts } = pIds.length ? await supabaseAdmin
      .from("content_partners").select("id,name").in("id", pIds) : { data: [] };
    const pMap = new Map((parts ?? []).map((p) => [p.id, p]));

    const userIds = [...new Set(rows.map((r) => r.entered_by))];
    const { data: users } = userIds.length ? await supabaseAdmin
      .from("profiles").select("id,full_name,email,role").in("id", userIds) : { data: [] };
    const uMap = new Map((users ?? []).map((u) => [u.id, u]));

    // Previous snapshot values (for context)
    const allBySub = new Map<string, Array<{ id: string; recorded_date: string; clicks: number; impressions: number; engagement_rate: number | null }>>();
    if (subIds.length) {
      const { data: allSnaps } = await supabaseAdmin
        .from("kpi_snapshots")
        .select("id,submission_id,recorded_date,clicks,impressions,engagement_rate")
        .in("submission_id", subIds)
        .order("recorded_date", { ascending: false });
      for (const s of allSnaps ?? []) {
        const arr = allBySub.get(s.submission_id) ?? [];
        arr.push(s); allBySub.set(s.submission_id, arr);
      }
    }

    // Stats
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 86400000;
    const thirtyDaysAgo = now - 30 * 86400000;
    const { data: myActions } = await supabaseAdmin
      .from("kpi_snapshots")
      .select("id,status,qc_approved_by,qc_approved_at,updated_by,updated_at")
      .or(`and(qc_approved_by.eq.${context.userId},qc_approved_at.gte.${new Date(sevenDaysAgo).toISOString()}),and(status.eq.qc_rejected,updated_by.eq.${context.userId},updated_at.gte.${new Date(sevenDaysAgo).toISOString()})`);
    const { data: approvedRecent } = await supabaseAdmin
      .from("kpi_snapshots")
      .select("created_at,qc_approved_at")
      .eq("status", "qc_approved")
      .gte("qc_approved_at", new Date(thirtyDaysAgo).toISOString());
    let avgHours: number | null = null;
    if (approvedRecent && approvedRecent.length > 0) {
      const total = approvedRecent.reduce((acc, r) => acc + (new Date(r.qc_approved_at!).getTime() - new Date(r.created_at).getTime()) / 3600000, 0);
      avgHours = Math.round(total / approvedRecent.length);
    }

    const out = rows.map((r) => {
      const sub = sMap.get(r.submission_id);
      const task = sub ? tMap.get(sub.task_id) : undefined;
      const contract = task?.contract_id ? cMap.get(task.contract_id) : undefined;
      const partner = contract ? pMap.get(contract.content_partner_id) : undefined;
      const enterer = uMap.get(r.entered_by);
      const all = allBySub.get(r.submission_id) ?? [];
      const prev = all.find((s) => s.id !== r.id);
      const waitingHours = (now - new Date(r.created_at).getTime()) / 3600000;
      return {
        id: r.id,
        submission_id: r.submission_id,
        task_id: sub?.task_id,
        task_title: task?.title ?? "Untitled",
        deliverable_type: task?.deliverable_type ?? "",
        partner_id: partner?.id ?? null,
        partner_name: partner?.name ?? "—",
        submission_type: sub?.submission_type,
        url: sub?.url ?? null,
        metadata: (sub?.metadata as Record<string, string> | null) ?? null,
        recorded_date: r.recorded_date,
        clicks: r.clicks,
        impressions: r.impressions,
        engagement_rate: r.engagement_rate,
        previous: prev ? { clicks: prev.clicks, impressions: prev.impressions, engagement_rate: prev.engagement_rate } : null,
        notes: r.notes,
        entered_by_id: r.entered_by,
        entered_by_name: enterer?.full_name ?? enterer?.email ?? "Unknown",
        entered_by_role: enterer?.role ?? "",
        created_at: r.created_at,
        waiting_hours: waitingHours,
      };
    });

    return {
      rows: out,
      stats: {
        pending: rows.length,
        myActionsThisWeek: myActions?.length ?? 0,
        avgWaitingHours: avgHours,
      },
    };
  });

/* ============================================================ */
/* Submission KPI history                                        */
/* ============================================================ */

export const getKpiSubmissionDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ submission_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { role } = await getRole(context.userId);
    const { data: sub } = await supabaseAdmin
      .from("submissions")
      .select("id,task_id,submission_type,url,submitted_by,reviewed_at,metadata")
      .eq("id", data.submission_id)
      .maybeSingle();
    if (!sub) throw new Error("Submission not found.");

    // Editors can only view their own
    if (role === "editor" && sub.submitted_by !== context.userId) {
      throw new Error("Forbidden");
    }
    if (role === "content_partner") throw new Error("Forbidden");

    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select("id,title,deliverable_type,contract_id")
      .eq("id", sub.task_id)
      .maybeSingle();
    const { data: contract } = task?.contract_id ? await supabaseAdmin
      .from("contracts").select("id,content_partner_id").eq("id", task.contract_id).maybeSingle() : { data: null };
    const { data: partner } = contract ? await supabaseAdmin
      .from("content_partners").select("id,name").eq("id", contract.content_partner_id).maybeSingle() : { data: null };
    const { data: submitter } = await supabaseAdmin
      .from("profiles").select("id,full_name,email,role").eq("id", sub.submitted_by).maybeSingle();

    const { data: snaps } = await supabaseAdmin
      .from("kpi_snapshots")
      .select("*")
      .eq("submission_id", data.submission_id)
      .order("recorded_date", { ascending: false });

    const snapIds = (snaps ?? []).map((s) => s.id);
    const { data: edits } = snapIds.length ? await supabaseAdmin
      .from("kpi_snapshot_edits")
      .select("*")
      .in("snapshot_id", snapIds)
      .order("edited_at", { ascending: false }) : { data: [] };

    // Names for entered_by / qc_approved_by / edited_by
    const userIds = new Set<string>();
    for (const s of snaps ?? []) {
      if (s.entered_by) userIds.add(s.entered_by);
      if (s.qc_approved_by) userIds.add(s.qc_approved_by);
    }
    for (const e of edits ?? []) {
      if (e.edited_by) userIds.add(e.edited_by);
    }
    const { data: users } = userIds.size ? await supabaseAdmin
      .from("profiles").select("id,full_name,email").in("id", [...userIds]) : { data: [] };
    const uMap = new Map((users ?? []).map((u) => [u.id, u.full_name ?? u.email]));

    return {
      role,
      submission: {
        id: sub.id,
        task_id: sub.task_id,
        submission_type: sub.submission_type,
        url: sub.url,
        approved_at: sub.reviewed_at,
        metadata: (sub.metadata as Record<string, string> | null) ?? null,
      },
      task,
      partner,
      contract_id: contract?.id ?? null,
      submitter: submitter ? { id: submitter.id, name: submitter.full_name ?? submitter.email, role: submitter.role } : null,
      snapshots: (snaps ?? []).map((s) => ({
        ...s,
        entered_by_name: s.entered_by ? uMap.get(s.entered_by) ?? "Unknown" : "Unknown",
        qc_approved_by_name: s.qc_approved_by ? uMap.get(s.qc_approved_by) ?? null : null,
      })),
      edits: (edits ?? []).map((e) => ({
        ...e,
        edited_by_name: e.edited_by ? uMap.get(e.edited_by) ?? "Unknown" : "Unknown",
      })),
    };
  });

/* ============================================================ */
/* Editor performance — KPI section                              */
/* ============================================================ */

export const getEditorKpiPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const { role } = await getRole(context.userId);
    if (role !== "editor") throw new Error("Forbidden");

    const { data: subs } = await supabaseAdmin
      .from("submissions")
      .select("id,task_id")
      .eq("submitted_by", context.userId)
      .eq("status", "approved");
    if (!subs?.length) return { hasData: false };

    const subIds = subs.map((s) => s.id);
    const { data: snaps } = await supabaseAdmin
      .from("kpi_snapshots")
      .select("submission_id,recorded_date,clicks,impressions,engagement_rate,status")
      .in("submission_id", subIds)
      .eq("status", "qc_approved")
      .order("recorded_date", { ascending: false });
    const latest = new Map<string, NonNullable<typeof snaps>[number]>();
    for (const s of snaps ?? []) {
      if (!latest.has(s.submission_id)) latest.set(s.submission_id, s);
    }
    if (latest.size === 0) return { hasData: false };

    const taskIds = [...new Set(subs.map((s) => s.task_id))];
    const { data: tasks } = await supabaseAdmin
      .from("tasks")
      .select("id,title,deliverable_type,contract_id")
      .in("id", taskIds);
    const tMap = new Map((tasks ?? []).map((t) => [t.id, t]));
    const cIds = [...new Set((tasks ?? []).map((t) => t.contract_id).filter((v): v is string => !!v))];
    const { data: contracts } = await supabaseAdmin
      .from("contracts").select("id,content_partner_id").in("id", cIds);
    const cMap = new Map((contracts ?? []).map((c) => [c.id, c]));
    const pIds = [...new Set((contracts ?? []).map((c) => c.content_partner_id))];
    const { data: partners } = await supabaseAdmin
      .from("content_partners").select("id,name").in("id", pIds);
    const pMap = new Map((partners ?? []).map((p) => [p.id, p]));

    const rows = subs
      .filter((s) => latest.has(s.id))
      .map((s) => {
        const l = latest.get(s.id)!;
        const t = tMap.get(s.task_id);
        const c = t?.contract_id ? cMap.get(t.contract_id) : undefined;
        const p = c ? pMap.get(c.content_partner_id) : undefined;
        return {
          submission_id: s.id,
          task_id: s.task_id,
          task_title: t?.title ?? "Untitled",
          deliverable_type: t?.deliverable_type ?? "",
          partner_name: p?.name ?? "—",
          clicks: l.clicks,
          impressions: l.impressions,
          engagement_rate: l.engagement_rate,
        };
      });

    const totalClicks = rows.reduce((a, r) => a + r.clicks, 0);
    const totalImpressions = rows.reduce((a, r) => a + r.impressions, 0);
    const erList = rows.map((r) => r.engagement_rate).filter((v): v is number => v != null);
    const avgEngagement = erList.length ? erList.reduce((a, b) => a + b, 0) / erList.length : null;

    const sorted = [...rows].sort((a, b) => b.clicks - a.clicks);
    return {
      hasData: true,
      totals: { clicks: totalClicks, impressions: totalImpressions, avgEngagement },
      top: sorted.slice(0, 5),
      bottom: sorted.slice(-5).reverse(),
    };
  });

/* ============================================================ */
/* Submission review — similar work performance widget           */
/* ============================================================ */

export const getSimilarSubmissionsPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ submission_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { role } = await getRole(context.userId);
    if (!canQc(role)) throw new Error("Forbidden");

    const { data: sub } = await supabaseAdmin
      .from("submissions").select("task_id").eq("id", data.submission_id).maybeSingle();
    if (!sub) return { rows: [], partnerName: null, deliverableType: null };
    const { data: task } = await supabaseAdmin
      .from("tasks").select("id,deliverable_type,contract_id").eq("id", sub.task_id).maybeSingle();
    if (!task) return { rows: [], partnerName: null, deliverableType: null };
    if (!task.contract_id) return { rows: [], partnerName: null, deliverableType: task.deliverable_type };
    const { data: contract } = await supabaseAdmin
      .from("contracts").select("content_partner_id").eq("id", task.contract_id).maybeSingle();
    if (!contract) return { rows: [], partnerName: null, deliverableType: task.deliverable_type };
    const { data: partner } = await supabaseAdmin
      .from("content_partners").select("name").eq("id", contract.content_partner_id).maybeSingle();

    // Find peer tasks for same partner+type
    const { data: peerContracts } = await supabaseAdmin
      .from("contracts").select("id").eq("content_partner_id", contract.content_partner_id);
    const peerContractIds = (peerContracts ?? []).map((c) => c.id);
    if (!peerContractIds.length) return { rows: [], partnerName: partner?.name ?? null, deliverableType: task.deliverable_type };
    const { data: peerTasks } = await supabaseAdmin
      .from("tasks").select("id,title").eq("deliverable_type", task.deliverable_type).in("contract_id", peerContractIds);
    const peerTaskIds = (peerTasks ?? []).map((t) => t.id);
    if (!peerTaskIds.length) return { rows: [], partnerName: partner?.name ?? null, deliverableType: task.deliverable_type };
    const taskTitles = new Map((peerTasks ?? []).map((t) => [t.id, t.title]));

    const { data: peerSubs } = await supabaseAdmin
      .from("submissions")
      .select("id,task_id,submitted_at")
      .in("task_id", peerTaskIds)
      .eq("status", "approved")
      .neq("id", data.submission_id)
      .order("submitted_at", { ascending: false })
      .limit(50);

    const peerSubIds = (peerSubs ?? []).map((s) => s.id);
    if (!peerSubIds.length) return { rows: [], partnerName: partner?.name ?? null, deliverableType: task.deliverable_type };
    const { data: snaps } = await supabaseAdmin
      .from("kpi_snapshots")
      .select("submission_id,recorded_date,clicks,impressions,engagement_rate")
      .in("submission_id", peerSubIds)
      .eq("status", "qc_approved")
      .order("recorded_date", { ascending: false });
    const latest = new Map<string, NonNullable<typeof snaps>[number]>();
    for (const s of snaps ?? []) {
      if (!latest.has(s.submission_id)) latest.set(s.submission_id, s);
    }
    const rows = (peerSubs ?? [])
      .filter((s) => latest.has(s.id))
      .slice(0, 3)
      .map((s) => {
        const l = latest.get(s.id)!;
        return {
          submission_id: s.id,
          task_id: s.task_id,
          title: taskTitles.get(s.task_id) ?? "Submission",
          submitted_at: s.submitted_at,
          clicks: l.clicks,
          impressions: l.impressions,
          engagement_rate: l.engagement_rate,
        };
      });
    return { rows, partnerName: partner?.name ?? null, deliverableType: task.deliverable_type };
  });

/* ============================================================ */
/* Contract performance tab                                      */
/* ============================================================ */

export const getContractPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ contract_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { role } = await getRole(context.userId);

    const { data: contract } = await supabaseAdmin
      .from("contracts").select("id,start_date,end_date,content_partner_id").eq("id", data.contract_id).maybeSingle();
    if (!contract) throw new Error("Contract not found.");

    // Editor can see only if they have a task on this contract
    if (role === "editor") {
      const { count } = await supabaseAdmin
        .from("tasks").select("id", { count: "exact", head: true })
        .eq("contract_id", data.contract_id).eq("assigned_to", context.userId);
      if (!count) throw new Error("Forbidden");
    }
    if (role === "content_partner") throw new Error("Forbidden");

    const { data: tasks } = await supabaseAdmin
      .from("tasks").select("id,title,deliverable_type").eq("contract_id", data.contract_id);
    const taskIds = (tasks ?? []).map((t) => t.id);
    if (!taskIds.length) return { rows: [], totals: { clicks: 0, impressions: 0, avgEngagement: null }, weekly: [] };
    const tMap = new Map((tasks ?? []).map((t) => [t.id, t]));

    const { data: subs } = await supabaseAdmin
      .from("submissions")
      .select("id,task_id,submitted_at,submitted_by,reviewed_at,status")
      .in("task_id", taskIds)
      .eq("status", "approved");
    const subIds = (subs ?? []).map((s) => s.id);
    const submitterIds = [...new Set((subs ?? []).map((s) => s.submitted_by))];
    const { data: submitters } = submitterIds.length ? await supabaseAdmin
      .from("profiles").select("id,full_name,email").in("id", submitterIds) : { data: [] };
    const uMap = new Map((submitters ?? []).map((u) => [u.id, u.full_name ?? u.email]));

    const { data: snaps } = subIds.length ? await supabaseAdmin
      .from("kpi_snapshots")
      .select("submission_id,recorded_date,clicks,impressions,engagement_rate,status")
      .in("submission_id", subIds) : { data: [] };

    const latest = new Map<string, NonNullable<typeof snaps>[number]>();
    for (const s of snaps ?? []) {
      if (s.status !== "qc_approved") continue;
      const prev = latest.get(s.submission_id);
      if (!prev || new Date(s.recorded_date).getTime() > new Date(prev.recorded_date).getTime()) {
        latest.set(s.submission_id, s);
      }
    }

    const rows = (subs ?? []).map((s) => {
      const t = tMap.get(s.task_id);
      const l = latest.get(s.id);
      return {
        submission_id: s.id,
        task_id: s.task_id,
        task_title: t?.title ?? "Untitled",
        deliverable_type: t?.deliverable_type ?? "",
        submitter_name: uMap.get(s.submitted_by) ?? "—",
        approved_at: s.reviewed_at,
        clicks: l?.clicks ?? null,
        impressions: l?.impressions ?? null,
        engagement_rate: l?.engagement_rate ?? null,
        has_data: !!l,
      };
    });

    const totalClicks = rows.reduce((a, r) => a + (r.clicks ?? 0), 0);
    const totalImpressions = rows.reduce((a, r) => a + (r.impressions ?? 0), 0);
    const erList = rows.map((r) => r.engagement_rate).filter((v): v is number => v != null);
    const avgEngagement = erList.length ? erList.reduce((a, b) => a + b, 0) / erList.length : null;

    // Weekly buckets using qc_approved snapshots
    const start = new Date(contract.start_date).getTime();
    const end = Math.min(new Date(contract.end_date).getTime(), Date.now());
    const weekMs = 7 * 86400000;
    const weekly: { weekLabel: string; clicks: number; impressions: number }[] = [];
    for (let t = start; t <= end; t += weekMs) {
      const weekEnd = t + weekMs;
      const inWeek = (snaps ?? []).filter((s) => {
        if (s.status !== "qc_approved") return false;
        const d = new Date(s.recorded_date).getTime();
        return d >= t && d < weekEnd;
      });
      weekly.push({
        weekLabel: new Date(t).toISOString().slice(5, 10),
        clicks: inWeek.reduce((a, s) => a + s.clicks, 0),
        impressions: inWeek.reduce((a, s) => a + s.impressions, 0),
      });
    }

    return { rows, totals: { clicks: totalClicks, impressions: totalImpressions, avgEngagement }, weekly };
  });
