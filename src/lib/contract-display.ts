import type { StatusTone } from "@/components/status-badge";

export function contractStatusTone(status: string): StatusTone {
  switch (status) {
    case "active":
      return "success";
    case "draft":
      return "neutral";
    case "completed":
      return "info";
    case "expired":
      return "warning";
    case "cancelled":
      return "muted";
    default:
      return "neutral";
  }
}

export function taskStatusTone(status: string): StatusTone {
  switch (status) {
    case "not_started":
      return "neutral";
    case "in_progress":
      return "info";
    case "submitted":
    case "under_review":
      return "info";
    case "rework_requested":
      return "warning";
    case "approved":
      return "info";
    case "completed":
      return "success";
    case "cancelled":
      return "muted";
    default:
      return "neutral";
  }
}

// Delivery vocabulary (Marcel's reporting sheet). The original 5 keys are the
// contract-planner buckets; they're kept (they back the promised/delivered math)
// but relabelled to the new nomenclature. The rest are additive.
export const DELIVERABLE_LABELS: Record<string, string> = {
  // Contract-planner buckets (legacy keys), relabelled:
  article: "Article",
  newsletter: "Newsletter Mention",
  homepage_banner: "Banner Homepage",
  article_banner: "Banner Newsletter",
  social_post: "Social",
  // Full vocabulary:
  extra_article: "Extra Article",
  banner_homepage: "Banner Homepage",
  banner_newsletter: "Banner Newsletter",
  newsletter_mention: "Newsletter Mention",
  top_reads: "Top Reads",
  most_read: "Most Read",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  editorial_feature: "Editorial Feature",
  campaign_presence: "Campaign Presence",
  case_study: "Case Study",
  intelligence_report: "Intelligence Report",
  event_coverage: "Event Coverage",
};

// Singular badge labels — same terms (the new vocabulary is already singular).
export const DELIVERABLE_LABEL_SINGULAR: Record<string, string> = { ...DELIVERABLE_LABELS };

/** The 5 contract-planner buckets, in order. These drive promised/delivered and
 * must stay in sync with the contract's total_* columns + the summary function. */
export const CONTRACT_BUCKET_TYPES = [
  "article",
  "newsletter",
  "homepage_banner",
  "article_banner",
  "social_post",
] as const;

/** Full delivery vocabulary grouped by channel — for tagging editorial deliverables. */
export const DELIVERABLE_CHANNELS: { channel: string; types: string[] }[] = [
  { channel: "Website", types: ["article", "most_read", "banner_homepage", "extra_article", "event_coverage", "case_study", "intelligence_report", "editorial_feature", "campaign_presence"] },
  { channel: "Newsletter", types: ["banner_newsletter", "newsletter_mention", "top_reads", "editorial_feature"] },
  { channel: "Social", types: ["facebook", "instagram", "linkedin", "tiktok", "pinterest"] },
];

export const PLAN_TYPE_LABELS: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  six_month: "6-Month",
  annual: "Annual",
  custom: "Custom",
};

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function shortId(uuid: string): string {
  return uuid.slice(-8);
}
