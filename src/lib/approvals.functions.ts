import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertManagerOrAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role,full_name,email")
    .eq("id", userId)
    .maybeSingle();
  if (!data || (data.role !== "super_admin" && data.role !== "manager")) {
    throw new Error("Forbidden: managers or admins only.");
  }
  return data;
}

async function linkForUser(userId: string, taskId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (data?.role === "ops_support") return `/ops/tasks/${taskId}`;
  if (data?.role === "manager" || data?.role === "super_admin") return `/manager/all-tasks/${taskId}`;
  return `/editor/tasks/${taskId}`;
}

/** Open a submission for review — flip submitted → under_review and grab a soft lock. */
export const openSubmissionForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ submission_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertManagerOrAdmin(context.userId);
    const { data: sub } = await supabaseAdmin
      .from("submissions")
      .select("id,status,reviewing_by,reviewing_since,submitted_by")
      .eq("id", data.submission_id)
      .maybeSingle();
    if (!sub) throw new Error("Submission not found.");
    if (sub.submitted_by === context.userId) {
      // Author can view but not lock
      return { locked: false };
    }
    const now = new Date();
    const staleMs = 30 * 60 * 1000;
    const lockStale =
      !sub.reviewing_since ||
      now.getTime() - new Date(sub.reviewing_since).getTime() > staleMs;
    const shouldLock =
      sub.status === "submitted" ||
      sub.status === "under_review" && (lockStale || sub.reviewing_by === context.userId);
    if (!shouldLock) return { locked: false };
    await supabaseAdmin
      .from("submissions")
      .update({
        status: sub.status === "submitted" ? "under_review" : sub.status,
        reviewing_by: context.userId,
        reviewing_since: now.toISOString(),
        updated_by: context.userId,
        updated_at: now.toISOString(),
      })
      .eq("id", data.submission_id);
    return { locked: true };
  });

const ActionInput = z.object({
  submission_id: z.string().uuid(),
  action: z.enum(["approve", "reject", "request_rework", "send_to_partner"]),
  comments: z.string().max(2000).nullable().optional(),
  expected_updated_at: z.string(),
});

export const actOnSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ActionInput.parse(d))
  .handler(async ({ data, context }) => {
    const reviewer = await assertManagerOrAdmin(context.userId);

    const { data: sub } = await supabaseAdmin
      .from("submissions")
      .select("id,task_id,status,submitted_by,updated_at")
      .eq("id", data.submission_id)
      .maybeSingle();
    if (!sub) throw new Error("Submission not found.");

    // Self-approval block — hard backend enforcement
    if (sub.submitted_by === context.userId) {
      const err = new Error("You authored this submission. Another manager must review it.") as Error & { status?: number };
      err.status = 403;
      throw err;
    }

    // Already actioned — can't action terminal states (incl. handed to partner)
    if (sub.status === "approved" || sub.status === "rejected" || sub.status === "rework_requested" || sub.status === "sent_to_partner") {
      // Look up who reviewed for a clearer message
      const { data: full } = await supabaseAdmin
        .from("submissions")
        .select("reviewed_by")
        .eq("id", sub.id)
        .maybeSingle();
      let by = "another manager";
      if (full?.reviewed_by) {
        const { data: p } = await supabaseAdmin
          .from("profiles")
          .select("full_name,email")
          .eq("id", full.reviewed_by)
          .maybeSingle();
        by = p?.full_name ?? p?.email ?? by;
      }
      throw new Error(`This submission has already been reviewed by ${by}.`);
    }

    // Optimistic concurrency
    if (new Date(sub.updated_at).getTime() !== new Date(data.expected_updated_at).getTime()) {
      throw new Error("This submission was changed by someone else. Refresh to see the latest state.");
    }

    if (data.action !== "approve" && data.action !== "send_to_partner" && !(data.comments && data.comments.trim())) {
      throw new Error("Comments are required to reject or send back to the manager.");
    }

    const now = new Date().toISOString();
    const subStatus =
      data.action === "approve" ? "manager_approved"
      : data.action === "send_to_partner" ? "sent_to_partner"
      : data.action === "reject" ? "rejected"
      : "rework_requested";
    const taskStatus =
      // Manager approval and the partner hand-off keep the task in the pipeline;
      // it only completes once the partner gives final approval.
      data.action === "approve" ? "under_review"
      : data.action === "send_to_partner" ? "under_review"
      : data.action === "reject" ? "not_started"
      : "rework_requested";

    const { error: subErr } = await supabaseAdmin
      .from("submissions")
      .update({
        status: subStatus,
        reviewed_by: context.userId,
        reviewed_at: now,
        review_comments: data.comments ?? null,
        reviewing_by: null,
        reviewing_since: null,
        updated_by: context.userId,
        updated_at: now,
      })
      .eq("id", data.submission_id)
      .eq("updated_at", sub.updated_at);
    if (subErr) throw new Error(subErr.message);

    const { error: tErr } = await supabaseAdmin
      .from("tasks")
      .update({ status: taskStatus, updated_by: context.userId, updated_at: now })
      .eq("id", sub.task_id);
    if (tErr) throw new Error(tErr.message);

    // Fetch task title for the notification body
    const { data: t } = await supabaseAdmin
      .from("tasks")
      .select("title")
      .eq("id", sub.task_id)
      .maybeSingle();
    const taskTitle = t?.title ?? "task";
    const reviewerName = reviewer.full_name ?? reviewer.email ?? "Reviewer";

    if (data.action === "send_to_partner") {
      // Notify the partner's users that work awaits their final approval, and
      // let the submitter know it advanced.
      const { data: tc } = await supabaseAdmin.from("tasks").select("contract_id").eq("id", sub.task_id).maybeSingle();
      const { data: c } = tc?.contract_id
        ? await supabaseAdmin.from("contracts").select("content_partner_id").eq("id", tc.contract_id).maybeSingle()
        : { data: null };
      const partnerRows: { recipient_id: string; type: string; title: string; body: string; link: string }[] = [];
      if (c?.content_partner_id) {
        const { data: pu } = await supabaseAdmin.from("partner_users").select("profile_id").eq("content_partner_id", c.content_partner_id);
        for (const p of pu ?? []) {
          partnerRows.push({
            recipient_id: p.profile_id,
            type: "submission_submitted",
            title: `Awaiting your approval: ${taskTitle}`,
            body: `${reviewerName} sent this for your final approval.`,
            link: "/partner",
          });
        }
      }
      partnerRows.push({
        recipient_id: sub.submitted_by,
        type: "submission_approved",
        title: `Sent to partner: ${taskTitle}`,
        body: `${reviewerName} approved it and sent it to the partner for final approval.`,
        link: await linkForUser(sub.submitted_by, sub.task_id),
      });
      if (partnerRows.length) await supabaseAdmin.from("notifications").insert(partnerRows);
    } else {
      const notifType =
        data.action === "approve"
          ? "submission_approved"
          : data.action === "reject"
          ? "submission_rejected"
          : "submission_rework_requested";
      const verb = data.action === "approve" ? "approved" : data.action === "reject" ? "rejected" : "needs rework";
      const link = await linkForUser(sub.submitted_by, sub.task_id);

      await supabaseAdmin.from("notifications").insert({
        recipient_id: sub.submitted_by,
        type: notifType,
        title: `Submission ${verb}: ${taskTitle}`,
        body: data.comments ? `${reviewerName}: "${data.comments}"` : `By ${reviewerName}`,
        link,
      });
    }

    return { ok: true, status: subStatus };
  });

/**
 * Request a RE-CHECK (appeal) of a reject / rework decision.
 *
 * When a super admin or manager rejects a submission or requests rework,
 * that call might be a mistake. This lets the work's author (an editor, ops
 * user, or a manager who submitted) — or any manager / super admin who spots
 * a likely error — ask for the decision to be looked at again.
 *
 * Only `rejected` and `rework_requested` submissions are eligible. The
 * submission is sent back to `submitted` (task → `submitted`) so it re-enters
 * the approval queue, and the original reviewer + contract owners are notified
 * with the appeal reason. The prior reviewer's comment is preserved for
 * context.
 */
export const requestRecheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      submission_id: z.string().uuid(),
      reason: z.string().max(2000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("role,full_name,email")
      .eq("id", context.userId)
      .maybeSingle();
    if (!me) throw new Error("Profile not found.");
    const isManager = me.role === "super_admin" || me.role === "manager";

    const { data: sub } = await supabaseAdmin
      .from("submissions")
      .select("id,task_id,status,submitted_by,reviewed_by,updated_at")
      .eq("id", data.submission_id)
      .maybeSingle();
    if (!sub) throw new Error("Submission not found.");

    const isAuthor = sub.submitted_by === context.userId;
    const eligible = sub.status === "rejected" || sub.status === "rework_requested";

    // Only a negative decision can be appealed…
    if (!eligible) {
      throw new Error("Only a rejected or rework-requested submission can be sent for re-check.");
    }
    // …and only by its author or a manager / super admin.
    if (!isAuthor && !isManager) {
      throw new Error("Forbidden: only the author or a manager can request a re-check.");
    }

    const now = new Date().toISOString();
    const originalReviewer = sub.reviewed_by;

    // Send it back into the queue. Keep review_comments (the reviewer's
    // original reason) for context; clear the decision + lock. Optimistic
    // concurrency guard on updated_at.
    const { error: subErr } = await supabaseAdmin
      .from("submissions")
      .update({
        status: "submitted",
        reviewed_by: null,
        reviewed_at: null,
        reviewing_by: null,
        reviewing_since: null,
        submitted_at: now,
        updated_by: context.userId,
        updated_at: now,
      })
      .eq("id", sub.id)
      .eq("updated_at", sub.updated_at);
    if (subErr) throw new Error(subErr.message);

    const { data: t } = await supabaseAdmin
      .from("tasks")
      .select("id,title,contract_id")
      .eq("id", sub.task_id)
      .maybeSingle();

    const { error: tErr } = await supabaseAdmin
      .from("tasks")
      .update({ status: "submitted", updated_by: context.userId, updated_at: now })
      .eq("id", sub.task_id);
    if (tErr) throw new Error(tErr.message);

    const actorName = me.full_name ?? me.email ?? "Someone";
    const taskTitle = t?.title ?? "task";
    const body = data.reason ? `${actorName}: "${data.reason}"` : `${actorName} asked for another look`;

    // Notify the original reviewer + all contract owners (deduped, minus actor).
    const recipients = new Set<string>();
    if (originalReviewer) recipients.add(originalReviewer);
    if (t?.contract_id) {
      const { data: owners } = await supabaseAdmin
        .from("contract_owners")
        .select("profile_id")
        .eq("contract_id", t.contract_id);
      for (const o of owners ?? []) recipients.add(o.profile_id);
    }
    recipients.delete(context.userId);
    for (const rid of recipients) {
      await supabaseAdmin.from("notifications").insert({
        recipient_id: rid,
        type: "submission_recheck_requested",
        title: `Re-check requested: ${taskTitle}`,
        body,
        link: `/manager/approvals/${sub.id}`,
      });
    }

    return { ok: true, status: "submitted" as const };
  });

/**
 * Partner FINAL approval. A content partner either approves work that a manager
 * sent to them (task → completed) or sends it back to the managers with a note
 * (submission → submitted, re-entering the manager queue).
 */
export const partnerActOnSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      submission_id: z.string().uuid(),
      action: z.enum(["approve", "send_back"]),
      comments: z.string().max(2000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: me } = await supabaseAdmin
      .from("profiles").select("role,full_name,email").eq("id", context.userId).maybeSingle();
    if (!me || me.role !== "content_partner") throw new Error("Forbidden: content partners only.");

    const { data: link } = await supabaseAdmin
      .from("partner_users").select("content_partner_id").eq("profile_id", context.userId).maybeSingle();
    if (!link) throw new Error("No partner account is linked to you.");

    const { data: sub } = await supabaseAdmin
      .from("submissions").select("id,task_id,status,submitted_by").eq("id", data.submission_id).maybeSingle();
    if (!sub) throw new Error("Submission not found.");
    if (sub.status !== "sent_to_partner") throw new Error("This submission is not awaiting your approval.");

    const { data: t } = await supabaseAdmin
      .from("tasks").select("title,contract_id").eq("id", sub.task_id).maybeSingle();
    if (!t?.contract_id) throw new Error("Task not found.");
    const { data: c } = await supabaseAdmin
      .from("contracts").select("content_partner_id").eq("id", t.contract_id).maybeSingle();
    if (!c || c.content_partner_id !== link.content_partner_id) {
      throw new Error("This submission is not for one of your contracts.");
    }

    if (data.action === "send_back" && !(data.comments && data.comments.trim())) {
      throw new Error("Please add a note so the team knows what to change.");
    }

    const now = new Date().toISOString();
    const subStatus = data.action === "approve" ? "approved" : "submitted";
    const taskStatus = data.action === "approve" ? "completed" : "submitted";

    const { error: subErr } = await supabaseAdmin
      .from("submissions")
      .update({
        status: subStatus,
        reviewed_by: context.userId,
        reviewed_at: now,
        review_comments: data.comments ?? null,
        submitted_at: data.action === "send_back" ? now : undefined,
        updated_by: context.userId,
        updated_at: now,
      })
      .eq("id", sub.id);
    if (subErr) throw new Error(subErr.message);

    const { error: tErr } = await supabaseAdmin
      .from("tasks").update({ status: taskStatus, updated_by: context.userId, updated_at: now }).eq("id", sub.task_id);
    if (tErr) throw new Error(tErr.message);

    // Notify the submitter + all contract owners.
    const partnerName = me.full_name ?? me.email ?? "The partner";
    const recipients = new Set<string>([sub.submitted_by]);
    const { data: owners } = await supabaseAdmin
      .from("contract_owners").select("profile_id").eq("contract_id", t.contract_id);
    for (const o of owners ?? []) recipients.add(o.profile_id);
    recipients.delete(context.userId);
    const verb = data.action === "approve" ? "approved by the partner" : "sent back by the partner";
    const rows = Array.from(recipients).map((rid) => ({
      recipient_id: rid,
      type: data.action === "approve" ? "submission_approved" : "submission_rework_requested",
      title: `${t.title}: ${verb}`,
      body: data.comments ? `${partnerName}: "${data.comments}"` : `By ${partnerName}`,
      link: `/manager/all-tasks/${sub.task_id}`,
    }));
    if (rows.length) await supabaseAdmin.from("notifications").insert(rows);

    return { ok: true, status: subStatus };
  });

/**
 * Manager drag-to-reschedule on calendar.
 * Limited to not_started or in_progress tasks.
 */
export const rescheduleTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ task_id: z.string().uuid(), new_due_date: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManagerOrAdmin(context.userId);
    const { data: t } = await supabaseAdmin
      .from("tasks")
      .select("id,title,assigned_to,status,due_date")
      .eq("id", data.task_id)
      .maybeSingle();
    if (!t) throw new Error("Task not found.");
    if (t.status !== "not_started" && t.status !== "in_progress") {
      throw new Error("Only Not Started or In Progress tasks can be rescheduled.");
    }
    const { error } = await supabaseAdmin
      .from("tasks")
      .update({
        due_date: data.new_due_date,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.task_id);
    if (error) throw new Error(error.message);
    if (t.assigned_to) {
      const link = await linkForUser(t.assigned_to, t.id);
      await supabaseAdmin.from("notifications").insert({
        recipient_id: t.assigned_to,
        type: "task_due_date_changed",
        title: `Due date changed: ${t.title}`,
        body: `Moved from ${t.due_date} to ${data.new_due_date}`,
        link,
      });
    }
    return { ok: true };
  });

/** Manager kanban drag-to-cancel. */
export const managerCancelTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ task_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertManagerOrAdmin(context.userId);
    const { data: t } = await supabaseAdmin
      .from("tasks")
      .select("id,title,status,assigned_to")
      .eq("id", data.task_id)
      .maybeSingle();
    if (!t) throw new Error("Task not found.");
    if (t.status === "completed" || t.status === "cancelled") {
      throw new Error("Task cannot be cancelled from its current status.");
    }
    const { error } = await supabaseAdmin
      .from("tasks")
      .update({ status: "cancelled", updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("id", data.task_id);
    if (error) throw new Error(error.message);
    if (t.assigned_to) {
      const link = await linkForUser(t.assigned_to, t.id);
      await supabaseAdmin.from("notifications").insert({
        recipient_id: t.assigned_to,
        type: "task_cancelled",
        title: `Task cancelled: ${t.title}`,
        body: null,
        link,
      });
    }
    return { ok: true };
  });
