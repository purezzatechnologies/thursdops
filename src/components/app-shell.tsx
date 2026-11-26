import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Building2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  DatabaseBackup,
  FileText,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MessageSquare,
  Newspaper,
  Package,
  Send,
  Settings,
  ShieldCheck,
  TrendingUp,
  Upload,
  UserCog,
  Users,
} from "lucide-react";
import { useAuth, dashboardPathForRole, type UserRole } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChatPlaceholder } from "@/components/chat-placeholder";
import { NotificationsBell } from "@/components/notifications-bell";
import { HeaderSearch } from "@/components/header-search";
import { DemoModePill } from "@/components/demo-mode-pill";
import { SettingsSheet } from "@/components/settings-sheet";
import { UserAvatar } from "@/components/user-avatar";
import { BrandLogo } from "@/components/brand-logo";
import { toast } from "sonner";

interface NavItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  exact: boolean;
}

function navForRole(role: UserRole): NavItem[] {
  const dashboard: NavItem = {
    label: "Dashboard",
    path: dashboardPathForRole(role),
    icon: LayoutDashboard,
    exact: true,
  };
  const contracts: NavItem = { label: "Contracts", path: "/contracts", icon: FileText, exact: false };
  const partners: NavItem = { label: "Partners", path: "/partners", icon: Building2, exact: false };
  const myTasks: NavItem = { label: "My Tasks", path: "/editor/tasks", icon: ListChecks, exact: false };
  const mySubs: NavItem = { label: "My Submissions", path: "/editor/submissions", icon: Send, exact: false };
  const perf: NavItem = { label: "Performance", path: "/editor/performance", icon: TrendingUp, exact: false };
  const opsQueue: NavItem = { label: "URL Queue", path: "/ops/queue", icon: Inbox, exact: false };
  const opsAll: NavItem = { label: "All Newsletters & Socials", path: "/ops/all", icon: Newspaper, exact: false };
  const opsKpi: NavItem = { label: "KPI Entry", path: "/ops/kpi", icon: BarChart3, exact: false };
  const opsSubs: NavItem = { label: "My Submissions", path: "/ops/submissions", icon: Send, exact: false };
  // Manager / Admin
  const mgrMyTasks: NavItem = { label: "My Tasks", path: "/manager/my-tasks", icon: ListChecks, exact: false };
  const mgrAllTasks: NavItem = { label: "All Tasks", path: "/manager/all-tasks", icon: ClipboardList, exact: false };
  const mgrApprovals: NavItem = { label: "Approvals", path: "/manager/approvals", icon: CheckSquare, exact: false };
  const mgrKpiQc: NavItem = { label: "KPI QC", path: "/manager/kpi-qc", icon: ShieldCheck, exact: false };
  const mgrSubs: NavItem = { label: "All Submissions", path: "/manager/submissions", icon: Send, exact: false };
  const mgrTeam: NavItem = { label: "Team Performance", path: "/manager/team", icon: Users, exact: false };
  const mgrRequests: NavItem = { label: "Partner Requests", path: "/manager/requests", icon: MessageSquare, exact: false };
  const perfDash: NavItem = { label: "Performance", path: "/admin/performance", icon: TrendingUp, exact: false };
  const adminUsers: NavItem = { label: "Users", path: "/admin/users", icon: UserCog, exact: false };
  const adminActivity: NavItem = { label: "Activity", path: "/admin/activity", icon: Activity, exact: false };
  const adminBackups: NavItem = { label: "Backups", path: "/admin/backups", icon: DatabaseBackup, exact: false };
  const adminImport: NavItem = { label: "Bulk Import", path: "/admin/import", icon: Upload, exact: false };
  // Partner
  const partnerContracts: NavItem = { label: "My Contracts", path: "/partner/contracts", icon: FileText, exact: false };
  const partnerDeliverables: NavItem = { label: "All Deliverables", path: "/partner/deliverables", icon: Package, exact: false };
  const partnerReports: NavItem = { label: "Reports", path: "/partner/reports", icon: BarChart3, exact: false };
  const partnerRequests: NavItem = { label: "Requests", path: "/partner/requests", icon: MessageSquare, exact: false };
  const partnerSettings: NavItem = { label: "Settings", path: "/partner/settings", icon: Settings, exact: false };
  switch (role) {
    case "super_admin":
      return [dashboard, perfDash, mgrMyTasks, mgrAllTasks, mgrApprovals, opsKpi, mgrKpiQc, mgrSubs, mgrTeam, mgrRequests, contracts, partners, adminUsers, adminImport, adminActivity, adminBackups];
    case "manager":
      return [dashboard, mgrMyTasks, mgrAllTasks, mgrApprovals, opsKpi, mgrKpiQc, mgrSubs, perfDash, mgrTeam, mgrRequests, contracts, partners, adminActivity];
    case "editor":
      return [dashboard, myTasks, mySubs, perf, contracts, partners];
    case "ops_support":
      return [dashboard, opsQueue, opsAll, opsKpi, opsSubs, contracts, partners];
    case "content_partner":
      return [dashboard, partnerContracts, partnerDeliverables, partnerReports, partnerRequests, partnerSettings];
  }
}

const roleLabel: Record<UserRole, string> = {
  super_admin: "Super Admin",
  manager: "Manager",
  editor: "Editor",
  ops_support: "Ops Support",
  content_partner: "Content Partner",
};

const PREF_KEY = "sidebar_collapsed";

export function AppShell({
  allowed,
  children,
}: {
  allowed: UserRole | UserRole[];
  children: ReactNode;
}) {
  const { profile, loading, isDemo, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);
  const [prefLoaded, setPrefLoaded] = useState(false);

  const allowedList = Array.isArray(allowed) ? allowed : [allowed];
  const isAllowed = profile ? allowedList.includes(profile.role) : false;

  useEffect(() => {
    if (loading) return;
    if (!profile) {
      void navigate({ to: "/login" });
      return;
    }
    if (!allowedList.includes(profile.role)) {
      toast.error("Not available for your role.");
      void navigate({ to: dashboardPathForRole(profile.role) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, profile, navigate]);

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      const { data } = await supabase
        .from("user_preferences")
        .select("value")
        .eq("profile_id", profile.id)
        .eq("key", PREF_KEY)
        .maybeSingle();
      if (data?.value === true) setCollapsed(true);
      setPrefLoaded(true);
    })();
  }, [profile]);

  async function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    if (!profile) return;
    await supabase
      .from("user_preferences")
      .upsert(
        { profile_id: profile.id, key: PREF_KEY, value: next, updated_at: new Date().toISOString() },
        { onConflict: "profile_id,key" }
      );
  }

  async function handleLogout() {
    await signOut();
    void navigate({ to: "/login" });
  }

  if (loading || !profile || !isAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  const items = navForRole(profile.role);
  const sidebarW = collapsed ? "w-[68px]" : "w-[244px]";
  const initials = (profile.full_name || profile.email)
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen text-foreground">
      <aside
        className={cn(
          "sticky top-0 flex h-screen flex-col border-r border-sidebar-border bg-sidebar glass-strong transition-all duration-200",
          sidebarW
        )}
      >
        {/* Brand */}
        <div className={cn("flex h-16 items-center border-b border-sidebar-border px-4", collapsed && "justify-center px-2")}>
          <BrandLogo fullWidth size={40} className={cn(collapsed && "justify-center")} />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-5">
          {!collapsed && (
            <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
              Main navigation
            </div>
          )}
          <ul className="space-y-1">
            {items.map((item) => {
              const active = item.exact
                ? pathname === item.path
                : pathname.startsWith(item.path);
              const Icon = item.icon;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={cn(
                      "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                      active
                        ? "bg-card glass border border-border text-text-primary font-semibold shadow-sm"
                        : "text-text-secondary hover:bg-white/40 hover:text-text-primary dark:hover:bg-white/5",
                      collapsed && "justify-center px-0"
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer profile + collapse */}
        <div className="border-t border-sidebar-border p-3">
          <div className={cn("mb-2 flex items-center gap-2.5 rounded-lg p-2", collapsed && "justify-center p-0")}>
            <UserAvatar src={profile.avatar_url} name={profile.full_name ?? profile.email} size="md" />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold leading-tight">{profile.full_name}</div>
                <div className="truncate text-[11px] text-text-tertiary">{profile.email}</div>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={handleLogout}
                className="rounded-md p-1.5 text-text-tertiary hover:bg-secondary hover:text-text-primary"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            onClick={toggleCollapsed}
            disabled={!prefLoaded}
            className="flex w-full items-center justify-center gap-2 rounded-md py-1.5 text-[11px] font-medium text-text-tertiary hover:bg-secondary hover:text-text-primary"
            aria-label="Toggle sidebar"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : (
              <>
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex h-16 items-center gap-4 border-b border-border bg-sidebar glass-strong sticky top-0 z-10 px-6">
          <HeaderSearch />
          <div className="ml-auto flex items-center gap-2">
            {isDemo && <DemoModePill />}
            <SettingsSheet />
            <NotificationsBell />
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold leading-tight">{profile.full_name}</div>
              <div className="text-[11px] text-text-tertiary">{roleLabel[profile.role]}</div>
            </div>
            <UserAvatar src={profile.avatar_url} name={profile.full_name ?? profile.email} size="md" />
            <Button variant="ghost" size="sm" onClick={handleLogout} className="sm:hidden">
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Logout</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-8 bg-transparent">{children}</main>
      </div>

      <ChatPlaceholder />
    </div>
  );
}
