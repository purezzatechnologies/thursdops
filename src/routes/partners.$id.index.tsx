import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import {
  Building2,
  Edit,
  ExternalLink,
  FileText,
  Mail,
  Phone,
  Plus,
  Power,
  PowerOff,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { setPartnerActive, setPartnerUserActive } from "@/lib/partner-users.functions";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ActiveBadge, StatusBadge } from "@/components/status-badge";
import { AddPartnerUserDialog } from "@/components/add-partner-user-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/partners/$id/")({
  component: () => (
    <AppShell allowed={["super_admin", "manager", "editor", "ops_support"]}>
      <PartnerDetail />
    </AppShell>
  ),
});

interface Partner {
  id: string;
  name: string;
  company_details: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface PartnerUserRow {
  link_id: string;
  profile_id: string;
  full_name: string | null;
  email: string;
  is_active: boolean;
  created_at: string;
}

interface ContractRow {
  id: string;
  plan_type: string;
  status: string;
  start_date: string;
  end_date: string;
}

function PartnerDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const callSetPartnerActive = useServerFn(setPartnerActive);
  const callSetUserActive = useServerFn(setPartnerUserActive);

  const canEdit = profile?.role === "super_admin" || profile?.role === "manager";

  const [partner, setPartner] = useState<Partner | null>(null);
  const [users, setUsers] = useState<PartnerUserRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [userBusyId, setUserBusyId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    const { data: p, error } = await supabase
      .from("content_partners")
      .select("id,name,company_details,contact_email,contact_phone,notes,is_active,created_at,updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error || !p) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setPartner(p);

    const { data: links } = await supabase
      .from("partner_users")
      .select("id, profile_id, created_at")
      .eq("content_partner_id", id);
    const profileIds = (links ?? []).map((l) => l.profile_id);
    let profMap = new Map<string, { full_name: string | null; email: string; is_active: boolean }>();
    if (profileIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,full_name,email,is_active")
        .in("id", profileIds);
      profMap = new Map((profs ?? []).map((pr) => [pr.id, pr]));
    }
    setUsers(
      (links ?? [])
        .map((l) => {
          const pr = profMap.get(l.profile_id);
          return {
            link_id: l.id,
            profile_id: l.profile_id,
            full_name: pr?.full_name ?? null,
            email: pr?.email ?? "—",
            is_active: pr?.is_active ?? false,
            created_at: l.created_at,
          };
        })
        .sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email)),
    );

    const { data: cs } = await supabase
      .from("contracts")
      .select("id,plan_type,status,start_date,end_date")
      .eq("content_partner_id", id)
      .order("start_date", { ascending: false });
    setContracts(cs ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center">
        <h1 className="text-xl font-semibold">Partner not found</h1>
        <Link to="/partners" className="mt-3 inline-block text-sm text-primary hover:underline">
          ← Back to partners
        </Link>
      </div>
    );
  }

  if (loading || !partner) {
    return <div className="mx-auto max-w-7xl py-20 text-center text-sm text-text-tertiary">Loading…</div>;
  }

  const activeUserCount = users.filter((u) => u.is_active).length;

  async function handleToggleActive(active: boolean) {
    if (!active) {
      setDeactivateOpen(true);
      return;
    }
    setBusyAction(true);
    try {
      await callSetPartnerActive({ data: { partnerId: id, active: true } });
      toast.success("Partner reactivated.");
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusyAction(false);
    }
  }

  async function confirmDeactivate() {
    setBusyAction(true);
    try {
      const res = await callSetPartnerActive({ data: { partnerId: id, active: false } });
      const n = res.deactivatedUserCount;
      toast.success(
        n > 0
          ? `Partner deactivated. ${n} user account${n === 1 ? "" : "s"} also disabled.`
          : "Partner deactivated.",
      );
      setDeactivateOpen(false);
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusyAction(false);
    }
  }

  async function toggleUser(u: PartnerUserRow) {
    setUserBusyId(u.profile_id);
    try {
      await callSetUserActive({ data: { profileId: u.profile_id, active: !u.is_active } });
      toast.success(u.is_active ? "User account disabled." : "User account enabled.");
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed.");
    } finally {
      setUserBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        crumbs={[{ label: "Partners", to: "/partners" }, { label: partner.name }]}
        title={partner.name}
        badge={<ActiveBadge active={partner.is_active} />}
        subtitle={partner.company_details ?? "Content partner profile and contracts."}
        actions={
          canEdit && (
            <>
              <Button
                variant="outline"
                onClick={() => handleToggleActive(!partner.is_active)}
                disabled={busyAction}
              >
                {partner.is_active ? (
                  <><PowerOff className="mr-1.5 h-4 w-4" /> Deactivate</>
                ) : (
                  <><Power className="mr-1.5 h-4 w-4" /> Reactivate</>
                )}
              </Button>
              <Button onClick={() => navigate({ to: "/partners/$id/edit", params: { id } })}>
                <Edit className="mr-1.5 h-4 w-4" /> Edit
              </Button>
            </>
          )
        }
      />

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-6 bg-secondary">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">
            Partner Users <span className="ml-1.5 text-xs text-text-tertiary">({activeUserCount})</span>
          </TabsTrigger>
          <TabsTrigger value="contracts">
            Contracts <span className="ml-1.5 text-xs text-text-tertiary">({contracts.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card className="border-border lg:col-span-2">
              <CardContent className="space-y-5 p-6">
                <Section title="Company">
                  <p className="whitespace-pre-wrap text-sm text-text-secondary">
                    {partner.company_details || <span className="text-text-tertiary">Not set</span>}
                  </p>
                </Section>
                <Section title="Contact">
                  <div className="space-y-2 text-sm">
                    <ContactLine icon={<Mail className="h-4 w-4" />} value={partner.contact_email} href={partner.contact_email ? `mailto:${partner.contact_email}` : undefined} />
                    <ContactLine icon={<Phone className="h-4 w-4" />} value={partner.contact_phone} />
                  </div>
                </Section>
                {canEdit && (
                  <Section title="Internal notes">
                    <p className="whitespace-pre-wrap rounded-md border border-dashed border-border bg-secondary/40 p-3 text-sm text-text-secondary">
                      {partner.notes || <span className="text-text-tertiary">No notes.</span>}
                    </p>
                  </Section>
                )}
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="space-y-4 p-6">
                <Stat label="Active users" value={activeUserCount} icon={<Users className="h-4 w-4" />} />
                <Stat label="Contracts" value={contracts.length} icon={<FileText className="h-4 w-4" />} />
                <div className="border-t border-border pt-4 text-xs text-text-tertiary">
                  <div>Created {new Date(partner.created_at).toLocaleDateString()}</div>
                  <div>Updated {new Date(partner.updated_at).toLocaleDateString()}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <Card className="border-border">
            <CardContent className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Login accounts</h3>
                  <p className="text-xs text-text-tertiary">
                    Each user can sign in and see this partner's approved content.
                  </p>
                </div>
                {canEdit && partner.is_active && (
                  <Button onClick={() => setAddOpen(true)} size="sm">
                    <Plus className="mr-1.5 h-4 w-4" /> Add user
                  </Button>
                )}
              </div>

              {users.length === 0 ? (
                <EmptyBlock
                  icon={<Users className="h-6 w-6" />}
                  title="No users yet"
                  description={
                    canEdit
                      ? partner.is_active
                        ? "Add a partner user to give them login access."
                        : "Reactivate the partner before adding users."
                      : "No partner accounts have been created."
                  }
                />
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Added</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.profile_id} className="h-14 hover:bg-secondary/40">
                          <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                          <TableCell className="text-sm text-text-secondary">{u.email}</TableCell>
                          <TableCell><ActiveBadge active={u.is_active} /></TableCell>
                          <TableCell className="text-sm text-text-secondary">
                            {new Date(u.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleUser(u)}
                                disabled={userBusyId === u.profile_id || (!partner.is_active && !u.is_active)}
                              >
                                {u.is_active ? "Disable" : "Enable"}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contracts">
          <Card className="border-border">
            <CardContent className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Contracts</h3>
                  <p className="text-xs text-text-tertiary">
                    All contracts for this partner with delivery progress.
                  </p>
                </div>
                {canEdit && (
                  <Button
                    onClick={() =>
                      navigate({ to: "/contracts/new", search: { partner_id: id } as never })
                    }
                  >
                    <Plus className="mr-1.5 h-4 w-4" /> New Contract
                  </Button>
                )}
              </div>

              {contracts.length === 0 ? (
                <EmptyBlock
                  icon={<FileText className="h-6 w-6" />}
                  title="No contracts yet"
                  description="Contracts will appear here once they're created."
                />
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                        <TableHead>Plan</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contracts.map((c) => (
                        <TableRow
                          key={c.id}
                          className="h-14 cursor-pointer hover:bg-secondary/40"
                          onClick={() => navigate({ to: "/contracts/$id", params: { id: c.id } })}
                        >
                          <TableCell className="capitalize">{c.plan_type.replace(/_/g, " ")}</TableCell>
                          <TableCell>
                            <StatusBadge tone={statusTone(c.status)}>{c.status}</StatusBadge>
                          </TableCell>
                          <TableCell className="text-sm text-text-secondary">
                            {new Date(c.start_date).toLocaleDateString()} → {new Date(c.end_date).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <Link
                              to="/contracts/$id"
                              params={{ id: c.id }}
                              className="text-sm font-medium text-primary hover:underline"
                            >
                              View
                            </Link>
                            {canEdit && (
                              <Link
                                to="/contracts/$id/edit"
                                params={{ id: c.id }}
                                className="ml-3 text-sm font-medium text-text-secondary hover:text-text-primary"
                              >
                                Edit
                              </Link>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>


      <AddPartnerUserDialog
        partnerId={id}
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => void loadAll()}
      />

      <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {partner.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The partner will be hidden from active lists and cannot have new
              users or contracts added.
              {activeUserCount > 0 && (
                <>
                  {" "}This will also disable <strong>{activeUserCount} active user account{activeUserCount === 1 ? "" : "s"}</strong> linked to this partner. They will lose login access immediately.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAction}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDeactivate();
              }}
              disabled={busyAction}
              className="bg-primary text-primary-foreground hover:bg-[var(--primary-hover)]"
            >
              {busyAction ? "Deactivating…" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
        {title}
      </div>
      {children}
    </div>
  );
}

function ContactLine({ icon, value, href }: { icon: ReactNode; value: string | null; href?: string }) {
  if (!value) {
    return (
      <div className="flex items-center gap-2 text-text-tertiary">
        {icon}
        <span>Not set</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-text-primary">
      <span className="text-text-tertiary">{icon}</span>
      {href ? (
        <a href={href} className="hover:text-primary hover:underline">{value}</a>
      ) : (
        <span>{value}</span>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <span className="text-text-tertiary">{icon}</span>
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums text-text-primary">{value}</div>
    </div>
  );
}

function EmptyBlock({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-light text-primary">
        {icon}
      </div>
      <div className="text-sm font-semibold">{title}</div>
      <div className="max-w-sm text-xs text-text-tertiary">{description}</div>
    </div>
  );
}

function statusTone(status: string): "neutral" | "info" | "success" | "warning" | "danger" | "muted" {
  switch (status) {
    case "active": return "success";
    case "draft": return "neutral";
    case "pending": return "warning";
    case "completed": return "info";
    case "cancelled":
    case "terminated": return "muted";
    default: return "neutral";
  }
}
