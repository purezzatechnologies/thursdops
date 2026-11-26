import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const KINDS = ["query", "change_request", "new_deliverable", "issue", "other"] as const;
const STATUSES = ["open", "in_progress", "resolved", "declined"] as const;

/**
 * A content partner raises a query / request. Runs as the partner, records the
 * request against their own partner, then notifies the managers who own that
 * partner's contracts (partners can't write notifications themselves).
 */
export const submitPartnerRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      kind: z.enum(KINDS),
      subject: z.string().trim().min(1).max(200),
      message: z.string().trim().min(1).max(4000),
      related_contract_id: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("role,full_name,email")
      .eq("id", context.userId)
      .maybeSingle();
    if (!me || me.role !== "content_partner") {
      throw new Error("Only content partners can raise requests.");
    }

    const { data: link } = await supabaseAdmin
      .from("partner_users")
      .select("content_partner_id")
      .eq("profile_id", context.userId)
      .maybeSingle();
    if (!link) throw new Error("Your account isn't linked to a partner.");
    const partnerId = link.content_partner_id;

    const { data: partner } = await supabaseAdmin
      .from("content_partners")
      .select("name")
      .eq("id", partnerId)
      .maybeSingle();

    const { data: inserted, error } = await supabaseAdmin
      .from("partner_requests")
      .insert({
        content_partner_id: partnerId,
        created_by: context.userId,
        kind: data.kind,
        subject: data.subject.trim(),
        message: data.message.trim(),
        related_contract_id: data.related_contract_id ?? null,
        status: "open",
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Could not submit request.");

    // Notify the managers who own this partner's contracts (fall back to all managers).
    const { data: contracts } = await supabaseAdmin
      .from("contracts")
      .select("id")
      .eq("content_partner_id", partnerId);
    const contractIds = (contracts ?? []).map((c) => c.id);

    const recipients = new Set<string>();
    if (contractIds.length) {
      const { data: owners } = await supabaseAdmin
        .from("contract_owners")
        .select("profile_id")
        .in("contract_id", contractIds);
      for (const o of owners ?? []) recipients.add(o.profile_id);
    }
    if (recipients.size === 0) {
      const { data: mgrs } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .in("role", ["manager", "super_admin"]);
      for (const m of mgrs ?? []) recipients.add(m.id);
    }

    const actorName = me.full_name ?? me.email ?? "A partner";
    const partnerName = partner?.name ?? "partner";
    for (const rid of recipients) {
      await supabaseAdmin.from("notifications").insert({
        recipient_id: rid,
        type: "partner_request_new",
        title: `Partner request: ${data.subject.trim()}`,
        body: `${actorName} · ${partnerName} · ${data.kind.replace(/_/g, " ")}`,
        link: `/manager/requests`,
      });
    }

    return { id: inserted.id };
  });

/**
 * A manager / super admin responds to a partner request and/or moves its status.
 * Notifies the partner user who raised it.
 */
export const respondToPartnerRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      request_id: z.string().uuid(),
      status: z.enum(STATUSES),
      response: z.string().trim().max(4000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("role,full_name,email")
      .eq("id", context.userId)
      .maybeSingle();
    if (!me || (me.role !== "manager" && me.role !== "super_admin")) {
      throw new Error("Only managers can respond to partner requests.");
    }

    const { data: req } = await supabaseAdmin
      .from("partner_requests")
      .select("id, subject, created_by, response")
      .eq("id", data.request_id)
      .maybeSingle();
    if (!req) throw new Error("Request not found.");

    const now = new Date().toISOString();
    const hasNewResponse = data.response != null && data.response.trim() !== "";

    const { error } = await supabaseAdmin
      .from("partner_requests")
      .update({
        status: data.status,
        response: hasNewResponse ? data.response!.trim() : req.response,
        responded_by: hasNewResponse ? context.userId : undefined,
        responded_at: hasNewResponse ? now : undefined,
        updated_by: context.userId,
        updated_at: now,
      })
      .eq("id", data.request_id);
    if (error) throw new Error(error.message);

    const actorName = me.full_name ?? me.email ?? "The team";
    if (req.created_by) {
      await supabaseAdmin.from("notifications").insert({
        recipient_id: req.created_by,
        type: "partner_request_update",
        title: `Update on your request: ${req.subject}`,
        body: hasNewResponse ? `${actorName}: "${data.response!.trim()}"` : `Status: ${data.status.replace(/_/g, " ")}`,
        link: `/partner/requests`,
      });
    }

    return { ok: true, status: data.status };
  });
