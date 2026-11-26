import { ActivityFeed } from "@/components/activity-feed";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Edit, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  contractStatusTone, taskStatusTone, DELIVERABLE_LABELS,
  DELIVERABLE_LABEL_SINGULAR, PLAN_TYPE_LABELS, shortId, relativeTime,
  CONTRACT_BUCKET_TYPES,
} from "@/lib/contract-display";
import { setContractStatus, createTask, deleteTask, cancelTask } from "@/lib/contracts.functions";
import { getTaskWorkspaceRoute } from "@/lib/task-routes";
import { useConfirm } from "@/components/confirm-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/contracts/$id/")({
  component: () => (
    <AppShell allowed={["super_admin", "manager", "editor", "ops_support"]}>
      <ContractDetail />
    </AppShell>
  ),
});

interface SummaryRow {
  deliverable_type: string;
  total_promised: number;
  delivered_count: number;
  scheduled_count: number;
  unscheduled_count: number;
  extras_delivered_count: number;
  extras_scheduled_count: number;
}

interface Contract {
  id: string;
  status: string;
  plan_type: string;
  start_date: string;
  end_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  content_partner_id: string;
}

interface Task {
  id: string;
  title: string;
  deliverable_type: string;
  status: string;
  priority: string;
  due_date: string;
  is_extra: boolean;
  assigned_to: string | null;
  updated_at: string;
  assignee_name?: string | null;
}

function ContractDetail() {
  const { id } = Route.useParams();
  const { profile } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const callStatus = useServerFn(setContractStatus);
  const callCreateTask = useServerFn(createTask);
  const callDeleteTask = useServerFn(deleteTask);
  const callCancelTask = useServerFn(cancelTask);

  const canManage = profile?.role === "super_admin" || profile?.role === "manager";
  const canAdmin = profile?.role === "super_admin";

  const [contract, setContract] = useState<Contract | null>(null);
  const [partnerName, setPartnerName] = useState("");
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [taskModal, setTaskModal] = useState<{ open: boolean; type: string; isExtra: boolean }>({ open: false, type: "article", isExtra: false });

  async function load() {
    setLoading(true);
    const { data: c } = await supabase.from("contracts").select("*").eq("id", id).maybeSingle();
    if (!c) { setNotFound(true); setLoading(false); return; }
    setContract(c as Contract);

    const { data: p } = await supabase.from("content_partners").select("name").eq("id", c.content_partner_id).maybeSingle();
    setPartnerName(p?.name ?? "—");

    const { data: sum } = await supabase.rpc("contract_deliverable_summary", { _contract_id: id });
    setSummary((sum ?? []) as SummaryRow[]);

    const { data: ow } = await supabase.from("contract_owners").select("profile_id").eq("contract_id", id);
    const ownerIds = (ow ?? []).map((o) => o.profile_id);
    if (ownerIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ownerIds);
      setOwners((profs ?? []).map((pr) => ({ id: pr.id, name: pr.full_name ?? pr.email })));
    } else { setOwners([]); }

    const { data: ts } = await supabase
      .from("tasks")
      .select("id,title,deliverable_type,status,priority,due_date,is_extra,assigned_to,updated_at")
      .eq("contract_id", id)
      .order("due_date", { ascending: true });
    let taskList = (ts ?? []) as Task[];
    // editor filter
    if (profile?.role === "editor") {
      taskList = taskList.filter((t) => t.assigned_to === profile.id);
    } else if (profile?.role === "ops_support") {
      taskList = taskList.filter(
        (t) => (t.deliverable_type === "newsletter" || t.deliverable_type === "social_post") &&
               (t.assigned_to === null || t.assigned_to === profile.id),
      );
    }
    // assignee names
    const aids = Array.from(new Set(taskList.map((t) => t.assigned_to).filter(Boolean) as string[]));
    if (aids.length) {
      const { data: ap } = await supabase.from("profiles").select("id,full_name,email").in("id", aids);
      const m = new Map((ap ?? []).map((x) => [x.id, x.full_name ?? x.email]));
      taskList = taskList.map((t) => ({ ...t, assignee_name: t.assigned_to ? m.get(t.assigned_to) ?? null : null }));
    }
    setTasks(taskList);
    setLoading(false);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [id]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center">
        <h1 className="text-xl font-semibold">Contract not found</h1>
        <Link to="/contracts" className="mt-3 inline-block text-sm text-primary hover:underline">← Back to contracts</Link>
      </div>
    );
  }
  if (loading || !contract) return <div className="mx-auto max-w-7xl py-20 text-center text-sm text-text-tertiary">Loading…</div>;

  const today = new Date();
  const endDate = new Date(contract.end_date);
  const daysDiff = Math.round((endDate.getTime() - today.getTime()) / 86400000);
  const dateLabel = daysDiff >= 0 ? `${daysDiff} days remaining` : `Ended ${Math.abs(daysDiff)} days ago`;

  const allDelivered = summary.length > 0 && summary.every((s) => s.delivered_count >= s.total_promised);
  const showCompleteSuggest = contract.status === "active" && allDelivered;

  async function changeStatus(next: "active" | "completed" | "expired" | "cancelled") {
    if (next === "cancelled" && !(await confirm({ title: "Cancel this contract?", description: "Cancelling this contract will also cancel all its open tasks.", confirmText: "Cancel contract", danger: true }))) return;
    try {
      const res = await callStatus({ data: { contract_id: id, next_status: next } });
      toast.success(
        next === "cancelled"
          ? `Contract cancelled. ${res.cancelledTaskCount} task(s) cancelled.`
          : `Contract marked ${next}.`,
      );
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        crumbs={[{ label: "Contracts", to: "/contracts" }, { label: shortId(id) }]}
        title={
          <span className="flex items-center gap-3">
            <Link to="/partners/$id" params={{ id: contract.content_partner_id }} className="hover:text-primary">{partnerName}</Link>
            <span className="font-mono text-sm text-text-tertiary">#{shortId(id)}</span>
          </span>
        }
        badge={
          <span className="flex items-center gap-2">
            <StatusBadge tone={contractStatusTone(contract.status)}>{contract.status}</StatusBadge>
            <StatusBadge tone="neutral">{PLAN_TYPE_LABELS[contract.plan_type]}</StatusBadge>
          </span>
        }
        subtitle={`${new Date(contract.start_date).toLocaleDateString()} → ${new Date(contract.end_date).toLocaleDateString()} · ${dateLabel}`}
        actions={
          canManage && (
            <>
              {contract.status === "draft" && (
                <Button variant="outline" onClick={() => changeStatus("active")}>Mark Active</Button>
              )}
              {contract.status === "active" && (
                <>
                  <Button variant="outline" onClick={() => changeStatus("completed")}>Mark Completed</Button>
                  <Button variant="outline" onClick={() => changeStatus("expired")}>Mark Expired</Button>
                </>
              )}
              {canAdmin && contract.status !== "cancelled" && contract.status !== "completed" && (
                <Button variant="outline" onClick={() => changeStatus("cancelled")}>Cancel Contract</Button>
              )}
              <Button onClick={() => navigate({ to: "/contracts/$id/edit", params: { id } })}>
                <Edit className="mr-1.5 h-4 w-4" /> Edit
              </Button>
            </>
          )
        }
      />

      {showCompleteSuggest && canManage && (
        <Card className="mb-4 border-success/30 bg-success-light">
          <CardContent className="flex items-center justify-between p-4">
            <div className="text-sm text-success">All deliverables delivered. Mark contract as Completed?</div>
            <Button onClick={() => changeStatus("completed")}>Mark Completed</Button>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 flex items-center gap-2 text-xs text-text-tertiary">
        Owners:
        {owners.length > 0 ? (
          <div className="flex -space-x-1.5">
            {owners.map((o) => (
              <div key={o.id} title={o.name} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary-light text-[10px] font-semibold text-primary">
                {o.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
              </div>
            ))}
          </div>
        ) : (
          <span>Unassigned</span>
        )}
      </div>

      {/* At-a-glance stats */}
      {(() => {
        const totalPromised = summary.reduce((a, s) => a + s.total_promised, 0);
        const totalDelivered = summary.reduce((a, s) => a + s.delivered_count, 0);
        const totalScheduled = summary.reduce((a, s) => a + s.scheduled_count, 0);
        const totalUnscheduled = summary.reduce((a, s) => a + s.unscheduled_count, 0);
        const overallPct = totalPromised === 0 ? 0 : Math.min(100, Math.round(((totalDelivered + totalScheduled) / totalPromised) * 100));
        const deliveredPct = totalPromised === 0 ? 0 : Math.min(100, Math.round((totalDelivered / totalPromised) * 100));
        const scheduledPct = Math.max(0, overallPct - deliveredPct);
        const openTasks = tasks.filter((t) => !["completed", "cancelled"].includes(t.status)).length;
        const overdueTasks = tasks.filter((t) => new Date(t.due_date) < new Date() && !["completed", "cancelled"].includes(t.status)).length;
        const timelineTone = daysDiff < 0 ? "text-danger" : daysDiff <= 7 ? "text-warning" : "text-text-primary";
        return (
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Overall progress</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">{overallPct}%</div>
                <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full bg-success" style={{ width: `${deliveredPct}%` }} />
                  <div className="h-full bg-info" style={{ width: `${scheduledPct}%` }} />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Deliverables</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">{totalDelivered}<span className="text-base font-medium text-text-tertiary">/{totalPromised}</span></div>
                <div className="mt-2 text-[11px] text-text-tertiary"><b className="text-info">{totalScheduled}</b> scheduled · {totalUnscheduled} to plan</div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Tasks</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">{tasks.length}</div>
                <div className="mt-2 text-[11px] text-text-tertiary">{openTasks} open{overdueTasks > 0 && <> · <b className="text-warning">{overdueTasks} overdue</b></>}</div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Timeline</div>
                <div className={`mt-1 text-2xl font-bold tabular-nums ${timelineTone}`}>{Math.abs(daysDiff)}<span className="text-base font-medium text-text-tertiary">d</span></div>
                <div className="mt-2 text-[11px] text-text-tertiary">{daysDiff >= 0 ? "remaining" : "since ended"}</div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      <Tabs defaultValue="overview">
        <TabsList className="mb-6 bg-secondary">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {summary.map((s) => {
              const totalDoneScheduled = s.delivered_count + s.scheduled_count;
              const dPct = s.total_promised === 0 ? 0 : (s.delivered_count / s.total_promised) * 100;
              const sPct = s.total_promised === 0 ? 0 : (s.scheduled_count / s.total_promised) * 100;
              return (
                <Card key={s.deliverable_type} className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-baseline justify-between">
                      <div className="text-sm font-semibold">{DELIVERABLE_LABELS[s.deliverable_type]}</div>
                      <div className="text-2xl font-bold tabular-nums">{s.total_promised}</div>
                    </div>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div className="float-left h-full bg-success" style={{ width: `${dPct}%` }} />
                      <div className="float-left h-full bg-info" style={{ width: `${sPct}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] text-text-tertiary">
                      <span>Delivered: <b className="text-success">{s.delivered_count}</b></span>
                      <span>Scheduled: <b className="text-info">{s.scheduled_count}</b></span>
                      <span>Unscheduled: <b>{s.unscheduled_count}</b></span>
                    </div>
                    <div className="mt-1 text-[10px] text-text-tertiary">{totalDoneScheduled}/{s.total_promised} accounted for</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {summary.some((s) => s.extras_delivered_count + s.extras_scheduled_count > 0) && (
            <Card className="mt-4 border-border bg-secondary/30">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="text-sm font-semibold">Extras (Bonus Deliverables)</div>
                  <div className="text-xs text-text-tertiary">Beyond contract promises</div>
                </div>
                <div className="text-sm">
                  Delivered: <b className="text-success">{summary.reduce((a, s) => a + s.extras_delivered_count, 0)}</b>
                  {" · "}
                  Scheduled: <b className="text-info">{summary.reduce((a, s) => a + s.extras_scheduled_count, 0)}</b>
                </div>
              </CardContent>
            </Card>
          )}

          {canManage && contract.notes && (
            <Card className="mt-4 border-border">
              <CardContent className="p-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Internal notes</div>
                <p className="whitespace-pre-wrap text-sm text-text-secondary">{contract.notes}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="tasks">
          {!canManage && (
            <div className="mb-3 rounded-md border border-info/20 bg-info-light p-3 text-xs text-info">
              {profile?.role === "editor"
                ? `Showing only tasks assigned to you.`
                : `Showing newsletter and social tasks for your role.`}
            </div>
          )}

          {canManage && (
            <Card className="mb-5 border-border">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {summary.map((s) => (
                    <div key={s.deliverable_type} className="rounded-lg border border-border p-3">
                      <div className="text-xs font-semibold">{DELIVERABLE_LABELS[s.deliverable_type]}</div>
                      <div className="mt-1 text-[11px] text-text-tertiary">
                        {s.delivered_count}d · {s.scheduled_count}s · {s.unscheduled_count} left
                      </div>
                      <Button
                        size="sm"
                        className="mt-2 w-full"
                        disabled={s.unscheduled_count === 0}
                        onClick={() => setTaskModal({ open: true, type: s.deliverable_type, isExtra: false })}
                        title={s.unscheduled_count === 0 ? `All ${DELIVERABLE_LABELS[s.deliverable_type]} scheduled.` : undefined}
                      >
                        <Plus className="mr-1 h-3 w-3" /> Add
                      </Button>
                    </div>
                  ))}
                  <div className="rounded-lg border border-dashed border-primary/40 bg-primary-light/30 p-3">
                    <div className="text-xs font-semibold text-primary">Extras</div>
                    <div className="mt-1 text-[11px] text-text-tertiary">
                      {summary.reduce((a, s) => a + s.extras_delivered_count, 0)}d · {summary.reduce((a, s) => a + s.extras_scheduled_count, 0)}s
                    </div>
                    <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => setTaskModal({ open: true, type: "article", isExtra: true })}>
                      <Plus className="mr-1 h-3 w-3" /> Add Extra
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Activity</TableHead>
                    {canManage && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.length === 0 && (
                    <TableRow><TableCell colSpan={canManage ? 7 : 6} className="py-10 text-center text-sm text-text-tertiary">No tasks yet.</TableCell></TableRow>
                  )}
                  {tasks.map((t) => {
                    const overdue = new Date(t.due_date) < new Date() && !["completed", "cancelled"].includes(t.status);
                    return (
                      <TableRow key={t.id} className="h-14">
                        <TableCell>
                          {profile ? (
                            <a href={getTaskWorkspaceRoute(t, profile.role)} className="font-medium hover:text-primary">
                              {t.title}
                            </a>
                          ) : (
                            <div className="font-medium">{t.title}</div>
                          )}
                          {t.is_extra && <span className="mt-0.5 inline-block rounded-full bg-primary-light px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">Bonus</span>}
                        </TableCell>
                        <TableCell><StatusBadge tone="neutral">{DELIVERABLE_LABEL_SINGULAR[t.deliverable_type]}</StatusBadge></TableCell>
                        <TableCell className="text-sm">{t.assignee_name ?? <span className="text-text-tertiary">Unassigned</span>}</TableCell>
                        <TableCell className={`text-sm ${overdue ? "text-warning font-semibold" : ""}`}>{new Date(t.due_date).toLocaleDateString()}</TableCell>
                        <TableCell><StatusBadge tone={taskStatusTone(t.status)}>{t.status.replace(/_/g, " ")}</StatusBadge></TableCell>
                        <TableCell className="text-xs text-text-tertiary">{relativeTime(t.updated_at)}</TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            {t.status === "not_started" && (
                              <button onClick={async () => { if (await confirm({ title: "Delete task?", description: "This permanently deletes the task. This can't be undone.", confirmText: "Delete", danger: true })) { try { await callDeleteTask({ data: { id: t.id } }); toast.success("Deleted."); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); } } }} className="text-xs text-text-tertiary hover:text-primary">Delete</button>
                            )}
                            {!["completed", "cancelled", "not_started"].includes(t.status) && (
                              <button onClick={async () => { try { await callCancelTask({ data: { id: t.id } }); toast.success("Cancelled."); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); } }} className="ml-2 text-xs text-text-tertiary hover:text-primary">Cancel</button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card className="border-border">
            <CardContent className="space-y-3 p-4 text-sm">
              <div className="flex justify-between border-b border-border pb-2">
                <span>Contract created</span>
                <span className="text-text-tertiary">{new Date(contract.created_at).toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span>Current status: <b>{contract.status}</b></span>
                <span className="text-text-tertiary">Updated {relativeTime(contract.updated_at)}</span>
              </div>
              <div className="pt-2 text-xs text-text-tertiary">
                Task and submission activity appears here as the contract progresses.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <TaskCreateDialog
        open={taskModal.open}
        type={taskModal.type}
        isExtra={taskModal.isExtra}
        contractId={id}
        contractDates={{ start: contract.start_date, end: contract.end_date }}
        onClose={() => setTaskModal({ ...taskModal, open: false })}
        onCreated={async () => { setTaskModal({ ...taskModal, open: false }); await load(); }}
        callCreateTask={callCreateTask}
      />
      <div className="mt-6">
        <ActivityFeed linkPrefixes={[`/contracts/${id}`, `/manager/all-tasks/`]} title="Contract activity" />
      </div>
    </div>
  );
}

function TaskCreateDialog({
  open, type, isExtra, contractId, contractDates, onClose, onCreated, callCreateTask,
}: {
  open: boolean;
  type: string;
  isExtra: boolean;
  contractId: string;
  contractDates: { start: string; end: string };
  onClose: () => void;
  onCreated: () => void;
  callCreateTask: ReturnType<typeof useServerFn<typeof createTask>>;
}) {
  const confirm = useConfirm();
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [assignee, setAssignee] = useState<string>("");
  const [extra, setExtra] = useState(isExtra);
  const [deliverableType, setDeliverableType] = useState(type);
  const [assignees, setAssignees] = useState<{ id: string; name: string; role: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(""); setBrief(""); setDueDate(""); setPriority("normal"); setAssignee("");
    setExtra(isExtra); setDeliverableType(type);
    void (async () => {
      const includeOps = deliverableType === "newsletter" || deliverableType === "social_post";
      const roles = (includeOps ? ["editor", "manager", "super_admin", "ops_support"] as const : ["editor", "manager", "super_admin"] as const);
      const { data } = await supabase.from("profiles").select("id,full_name,email,role").in("role", roles).eq("is_active", true).order("full_name");
      setAssignees((data ?? []).map((p) => ({ id: p.id, name: p.full_name ?? p.email, role: p.role })));
    })();
    // eslint-disable-next-line
  }, [open, type, isExtra]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const includeOps = deliverableType === "newsletter" || deliverableType === "social_post";
      const roles = (includeOps ? ["editor", "manager", "super_admin", "ops_support"] as const : ["editor", "manager", "super_admin"] as const);
      const { data } = await supabase.from("profiles").select("id,full_name,email,role").in("role", roles).eq("is_active", true).order("full_name");
      setAssignees((data ?? []).map((p) => ({ id: p.id, name: p.full_name ?? p.email, role: p.role })));
    })();
  }, [deliverableType, open]);

  async function save() {
    if (!title.trim()) { toast.error("Title is required."); return; }
    if (!dueDate) { toast.error("Due date is required."); return; }
    if ((dueDate < contractDates.start || dueDate > contractDates.end) && !(await confirm({ title: "Due date outside contract dates", description: "This task's due date falls outside the contract's date range. Create it anyway?", confirmText: "Create anyway" }))) return;
    setSaving(true);
    try {
      await callCreateTask({ data: {
        contract_id: contractId,
        title: title.trim(),
        brief: brief || null,
        deliverable_type: deliverableType as "article",
        assigned_to: assignee || null,
        due_date: dueDate,
        priority,
        is_extra: extra,
      } });
      toast.success("Task created.");
      onCreated();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New {extra ? "Extra " : ""}task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs">Deliverable type</Label>
            <Select value={deliverableType} onValueChange={setDeliverableType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTRACT_BUCKET_TYPES.map((k) => <SelectItem key={k} value={k}>{DELIVERABLE_LABELS[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Article: Spring tulip varieties feature" />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Brief</Label>
            <Textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={5000} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-xs">Due date *</Label>
              <Input type="date" value={dueDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as "low" | "normal" | "high")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Assignee</Label>
            <Select value={assignee || "_none"} onValueChange={(v) => setAssignee(v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Unassigned</SelectItem>
                {assignees.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} <span className="text-text-tertiary">({a.role.replace("_", " ")})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={extra} onCheckedChange={(v) => setExtra(v === true)} />
            Mark as extra (bonus delivery beyond contract promises)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Creating…" : "Create task"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
