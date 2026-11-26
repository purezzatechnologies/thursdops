// Shared metadata for the super-admin Bulk Import screen. Pure data (no server
// imports) so both the UI route and the server function can use it.

export const IMPORT_ENTITIES = ["content_partners", "users", "contracts", "tasks", "partner_requests"] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

/** Entities that support lenient "import incomplete rows" + verification flagging. */
export const LENIENT_ENTITIES: ImportEntity[] = ["content_partners", "contracts", "tasks", "partner_requests"];

export const USER_ROLES = ["super_admin", "manager", "editor", "ops_support", "content_partner"] as const;
export const CONTRACT_PLANS = ["monthly", "quarterly", "six_month", "annual", "custom"] as const;
export const CONTRACT_STATUS = ["draft", "active", "completed", "expired", "cancelled"] as const;
export const TASK_STATUS = ["not_started", "in_progress", "submitted", "under_review", "rework_requested", "approved", "completed", "cancelled"] as const;
export const TASK_PRIORITY = ["low", "normal", "high"] as const;
export const DELIVERABLE_TYPES = [
  "article", "newsletter", "homepage_banner", "article_banner", "social_post",
  "extra_article", "banner_homepage", "banner_newsletter", "newsletter_mention",
  "top_reads", "most_read", "facebook", "instagram", "linkedin", "tiktok",
  "pinterest", "editorial_feature", "campaign_presence", "case_study",
  "intelligence_report", "event_coverage",
] as const;

export interface ColSpec {
  key: string;
  required?: boolean;
  type?: "text" | "bool" | "int" | "date";
  enumValues?: readonly string[];
  help?: string;
}

export interface EntitySpec {
  label: string;
  description: string;
  /** Natural key used to skip duplicates on re-import. */
  dedupeNote: string;
  /** References that can never be placeholdered, even in lenient mode. */
  hardRequired?: string;
  columns: ColSpec[];
  example: Record<string, string>;
}

export const IMPORT_SPEC: Record<ImportEntity, EntitySpec> = {
  content_partners: {
    label: "Content Partners",
    description: "Partner companies. Import these first — contracts, users and tasks reference them by name.",
    dedupeNote: "A partner whose name already exists is skipped.",
    columns: [
      { key: "name", required: true, help: "Partner / company name (used as the lookup key elsewhere)." },
      { key: "company_details" },
      { key: "contact_email" },
      { key: "contact_phone" },
      { key: "notes" },
      { key: "is_active", type: "bool", help: "true / false — default true." },
      { key: "show_kpi_data", type: "bool", help: "true / false — whether the partner can see KPI data. Default false." },
    ],
    example: {
      name: "Petal & Stem", company_details: "Boutique florist, Amsterdam",
      contact_email: "hello@petalstem.com", contact_phone: "+31 20 555 0101",
      notes: "Prefers morning posts", is_active: "true", show_kpi_data: "false",
    },
  },
  users: {
    label: "Users (staff & partner logins)",
    description: "Creates a login (auth account) + profile. Partner logins also get linked to their partner.",
    dedupeNote: "A user whose email already exists is skipped.",
    columns: [
      { key: "email", required: true },
      { key: "full_name" },
      { key: "role", required: true, enumValues: USER_ROLES, help: USER_ROLES.join(" | ") },
      { key: "password", help: "Login password — defaults to Demo2026! if blank." },
      { key: "is_active", type: "bool", help: "true / false — default true." },
      { key: "partner_name", help: "Required when role is content_partner — links the login to that partner." },
    ],
    example: {
      email: "jane@thursd.com", full_name: "Jane Doe", role: "editor",
      password: "Demo2026!", is_active: "true", partner_name: "",
    },
  },
  contracts: {
    label: "Contracts",
    description: "Agreements per partner, with deliverable totals. Reference the partner by name.",
    dedupeNote: "A contract with the same partner + start + end date is skipped.",
    hardRequired: "A valid partner_name is always required (a contract can't exist without a partner).",
    columns: [
      { key: "partner_name", required: true, help: "Must match an existing Content Partner name." },
      { key: "plan_type", enumValues: CONTRACT_PLANS, help: CONTRACT_PLANS.join(" | ") + " — default monthly." },
      { key: "start_date", required: true, type: "date", help: "YYYY-MM-DD" },
      { key: "end_date", required: true, type: "date", help: "YYYY-MM-DD" },
      { key: "status", enumValues: CONTRACT_STATUS, help: CONTRACT_STATUS.join(" | ") + " — default draft." },
      { key: "total_articles", type: "int" },
      { key: "total_newsletters", type: "int" },
      { key: "total_homepage_banners", type: "int" },
      { key: "total_article_banners", type: "int" },
      { key: "total_social_posts", type: "int" },
      { key: "owner_emails", help: "Comma-separated staff emails who own the contract." },
      { key: "notes" },
    ],
    example: {
      partner_name: "Petal & Stem", plan_type: "monthly",
      start_date: "2026-01-01", end_date: "2026-12-31", status: "active",
      total_articles: "4", total_newsletters: "2", total_homepage_banners: "1",
      total_article_banners: "0", total_social_posts: "8",
      owner_emails: "marcel@thursd.com", notes: "",
    },
  },
  tasks: {
    label: "Tasks / Deliverables",
    description: "Individual deliverables. Link to a partner's contract, or leave the partner blank for an editorial task.",
    dedupeNote: "A task with the same title + due date + contract is skipped.",
    columns: [
      { key: "title", required: true },
      { key: "deliverable_type", required: true, enumValues: DELIVERABLE_TYPES, help: "article, newsletter, social_post, … (see list)." },
      { key: "due_date", required: true, type: "date", help: "YYYY-MM-DD" },
      { key: "brief" },
      { key: "assignee_email", help: "Staff email to assign to." },
      { key: "status", enumValues: TASK_STATUS, help: TASK_STATUS.join(" | ") + " — default not_started." },
      { key: "priority", enumValues: TASK_PRIORITY, help: TASK_PRIORITY.join(" | ") + " — default normal." },
      { key: "is_extra", type: "bool", help: "true / false — default false." },
      { key: "partner_name", help: "Links the task to this partner's contract. Blank = editorial task." },
      { key: "contract_start_date", type: "date", help: "Only needed if the partner has more than one contract." },
      { key: "week_start", type: "date", help: "Planner bucket week (YYYY-MM-DD)." },
      { key: "week_label" },
      { key: "priority_bucket" },
      { key: "featured_image_url" },
    ],
    example: {
      title: "March spring-trends feature", deliverable_type: "article",
      due_date: "2026-03-15", brief: "Cover the top spring 2026 arrangements",
      assignee_email: "brian@thursd.com", status: "not_started", priority: "normal",
      is_extra: "false", partner_name: "Petal & Stem", contract_start_date: "",
      week_start: "", week_label: "", priority_bucket: "", featured_image_url: "",
    },
  },
  partner_requests: {
    label: "Partner Requests",
    description: "Queries/requests raised for a partner. Reference the partner by name and (optionally) the author by email.",
    dedupeNote: "No dedupe — every row is inserted.",
    hardRequired: "A valid partner_name is always required.",
    columns: [
      { key: "partner_name", required: true, help: "Must match an existing Content Partner name." },
      { key: "subject", required: true },
      { key: "message", required: true },
      { key: "kind", help: "query | change | issue … (free text, default query)." },
      { key: "status", help: "open | in_progress | resolved … (free text, default open)." },
      { key: "created_by_email", help: "Author's staff email — defaults to you (the importer) if blank." },
    ],
    example: {
      partner_name: "Petal & Stem", subject: "Shift April newsletter date",
      message: "Can we move the April newsletter to the 2nd week?", kind: "change",
      status: "open", created_by_email: "",
    },
  },
};

export type RowAction = "insert" | "incomplete" | "skip" | "error";
export interface RowResult {
  row: number;      // 1-based data row number
  action: RowAction;
  message?: string;
  summary?: string;    // short human description of the resolved record
  missing?: string[];  // fields that were blank/unresolved (lenient mode)
}
export interface ImportResult {
  entity: ImportEntity;
  committed: boolean;
  total: number;
  willInsert: number;    // includes incomplete
  incomplete: number;    // flagged for verification
  skipped: number;
  errors: number;
  results: RowResult[];
}

// ── Verification queue (incomplete imports awaiting completion) ────────────
export interface IncompleteRecord {
  entity: ImportEntity;
  id: string;
  label: string;
  note: string | null;
  created_at: string;
}
