import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FileText,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth, type UserRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

const roleLabel: Record<UserRole, string> = {
  super_admin: "Super Admin",
  manager: "Manager",
  editor: "Editor",
  ops_support: "Ops Support",
  content_partner: "Content Partner",
};

const roleHeadline: Record<UserRole, string> = {
  super_admin: "Admin overview",
  manager: "Manager dashboard",
  editor: "Editor workspace",
  ops_support: "Operations control",
  content_partner: "Partner portal",
};

interface Kpi {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "flat";
  icon: typeof Users;
  hint: string;
}

const kpisByRole: Record<UserRole, Kpi[]> = {
  super_admin: [
    { label: "Active partners", value: "—", delta: "Coming in P2", trend: "flat", icon: Users, hint: "Tracked once partners are seeded" },
    { label: "Live contracts", value: "—", delta: "Coming in P2", trend: "flat", icon: FileText, hint: "Contracts module ships next" },
    { label: "Open tasks", value: "—", delta: "Coming in P4", trend: "flat", icon: Activity, hint: "Task pipeline arrives in P4" },
    { label: "KPI snapshots", value: "—", delta: "Coming in P6", trend: "flat", icon: TrendingUp, hint: "Reporting in P6" },
  ],
  manager: [
    { label: "My partners", value: "—", delta: "Coming in P2", trend: "flat", icon: Users, hint: "Partner roster" },
    { label: "Contracts owned", value: "—", delta: "Coming in P2", trend: "flat", icon: FileText, hint: "Owned by you" },
    { label: "Awaiting QC", value: "—", delta: "Coming in P6", trend: "flat", icon: Clock, hint: "Snapshots needing review" },
    { label: "Completed this month", value: "—", delta: "Coming in P4", trend: "flat", icon: CheckCircle2, hint: "Tasks finished" },
  ],
  editor: [
    { label: "Assigned tasks", value: "—", delta: "Coming in P4", trend: "flat", icon: Activity, hint: "Your queue" },
    { label: "Due this week", value: "—", delta: "Coming in P4", trend: "flat", icon: Clock, hint: "Upcoming deadlines" },
    { label: "Submitted", value: "—", delta: "Coming in P5", trend: "flat", icon: FileText, hint: "Awaiting partner review" },
    { label: "Approved", value: "—", delta: "Coming in P5", trend: "flat", icon: CheckCircle2, hint: "Completed work" },
  ],
  ops_support: [
    { label: "Open issues", value: "—", delta: "Coming soon", trend: "flat", icon: Activity, hint: "Triage queue" },
    { label: "Pending reviews", value: "—", delta: "Coming in P6", trend: "flat", icon: Clock, hint: "Review backlog" },
    { label: "Resolved today", value: "—", delta: "Coming soon", trend: "flat", icon: CheckCircle2, hint: "Closed items" },
    { label: "Partners onboarded", value: "—", delta: "Coming in P2", trend: "flat", icon: Users, hint: "This month" },
  ],
  content_partner: [
    { label: "My contracts", value: "—", delta: "Coming in P2", trend: "flat", icon: FileText, hint: "Active agreements" },
    { label: "Open tasks", value: "—", delta: "Coming in P5", trend: "flat", icon: Activity, hint: "Action required" },
    { label: "Submitted", value: "—", delta: "Coming in P5", trend: "flat", icon: Clock, hint: "Under review" },
    { label: "Approved KPIs", value: "—", delta: "Coming in P6", trend: "flat", icon: TrendingUp, hint: "Validated reports" },
  ],
};

export function StubDashboard({ role }: { role: UserRole }) {
  const { profile, isDemo } = useAuth();
  if (!profile) return null;

  const kpis = kpisByRole[role];
  const firstName = (profile.full_name || profile.email).split(" ")[0];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
            {roleHeadline[role]}
          </div>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight">
            Welcome back, {firstName}.
          </h1>
          <p className="mt-1.5 text-sm text-text-secondary">
            Foundation is live. Feature screens roll out across Prompts 2–9.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDemo && (
            <Badge className="border border-primary/30 bg-primary-light text-primary hover:bg-primary-light">
              Demo session
            </Badge>
          )}
          <Badge variant="secondary" className="bg-secondary text-text-secondary">
            {roleLabel[role]}
          </Badge>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card
              key={k.label}
              className="group border-border bg-card transition-shadow hover:shadow-md"
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="text-sm font-medium text-text-secondary">{k.label}</div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4 text-3xl font-bold tracking-tight text-text-primary">
                  {k.value}
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-xs">
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium",
                    k.trend === "up" && "bg-success-light text-success",
                    k.trend === "down" && "bg-danger-light text-danger",
                    k.trend === "flat" && "bg-secondary text-text-tertiary",
                  )}>
                    {k.trend === "up" && <ArrowUpRight className="h-3 w-3" />}
                    {k.delta}
                  </span>
                  <span className="text-text-tertiary">{k.hint}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Two-column status + session */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Build progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { p: "Prompt 1", t: "Foundation — schema, auth, app shell", done: true },
              { p: "Prompt 2", t: "Content partners & contracts", done: false },
              { p: "Prompt 3", t: "Contract owners & access control", done: false },
              { p: "Prompt 4", t: "Tasks & Kanban pipeline", done: false },
              { p: "Prompt 5", t: "Submissions & partner review", done: false },
              { p: "Prompt 6", t: "KPI snapshots & QC", done: false },
            ].map((s) => (
              <div
                key={s.p}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold",
                    s.done
                      ? "bg-success-light text-success"
                      : "bg-secondary text-text-tertiary",
                  )}>
                    {s.done ? <CheckCircle2 className="h-4 w-4" /> : s.p.split(" ")[1]}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{s.p}</div>
                    <div className="text-xs text-text-tertiary">{s.t}</div>
                  </div>
                </div>
                <Badge
                  className={cn(
                    "border",
                    s.done
                      ? "border-success/30 bg-success-light text-success hover:bg-success-light"
                      : "border-border bg-secondary text-text-secondary hover:bg-secondary",
                  )}
                >
                  {s.done ? "Completed" : "Not started"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <Row label="Name" value={profile.full_name ?? "—"} />
            <Row label="Email" value={profile.email} mono />
            <Row label="Role" value={roleLabel[role]} />
            <Row
              label="Mode"
              value={isDemo ? "Demo" : "Production"}
              accent={isDemo}
            />
            <Row label="Signed in" value={new Date().toLocaleString()} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-text-tertiary">{label}</span>
      <span className={cn(
        "truncate text-right font-medium",
        mono && "font-mono text-[13px]",
        accent && "rounded-md bg-primary-light px-2 py-0.5 text-primary",
      )}>
        {value}
      </span>
    </div>
  );
}
