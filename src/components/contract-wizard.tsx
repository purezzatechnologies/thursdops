import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, X, Check, Plus, Minus, ChevronDown, ChevronUp, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { createContractWithTasks, updateContractWithTasks } from "@/lib/tasks-create.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PLAN_TYPE_LABELS } from "@/lib/contract-display";
import { weeksBetween, evenDistribution, toISODate, type WeekInfo } from "@/lib/week";
import { cn } from "@/lib/utils";

type DType = "article" | "newsletter" | "homepage_banner" | "article_banner" | "social_post";

const DELIVERABLE_TYPES: { key: DType; label: string; totalField: keyof ContractValues }[] = [
  { key: "article", label: "Article", totalField: "total_articles" },
  { key: "newsletter", label: "Newsletter Mention", totalField: "total_newsletters" },
  { key: "homepage_banner", label: "Banner Homepage", totalField: "total_homepage_banners" },
  { key: "article_banner", label: "Banner Newsletter", totalField: "total_article_banners" },
  { key: "social_post", label: "Social", totalField: "total_social_posts" },
];

interface ContractValues {
  content_partner_id: string;
  plan_type: "monthly" | "quarterly" | "six_month" | "annual" | "custom";
  start_date: string;
  end_date: string;
  status: "draft" | "active" | "completed" | "expired" | "cancelled";
  notes: string;
  total_articles: number;
  total_newsletters: number;
  total_homepage_banners: number;
  total_article_banners: number;
  total_social_posts: number;
  owner_ids: string[];
}

interface PlannedTask {
  uid: string;            // local id
  existing_id?: string;   // db id, set in edit mode
  title: string;
  description: string;
  deliverable_type: DType;
  week_index: number;     // 1-based
  due_date: string;       // YYYY-MM-DD (Wed of that week by default)
  assigned_to: string | null;
}

const EMPTY: ContractValues = {
  content_partner_id: "",
  plan_type: "monthly",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
  status: "draft",
  notes: "",
  total_articles: 0,
  total_newsletters: 0,
  total_homepage_banners: 0,
  total_article_banners: 0,
  total_social_posts: 0,
  owner_ids: [],
};

export function ContractWizard({
  initial, lockPartner, editContractId, editInitialTasks,
}: {
  initial?: Partial<ContractValues>;
  lockPartner?: boolean;
  editContractId?: string;
  editInitialTasks?: PlannedTask[];
}) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const callCreate = useServerFn(createContractWithTasks);
  const callUpdate = useServerFn(updateContractWithTasks);
  const isEdit = !!editContractId;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [v, setV] = useState<ContractValues>(() => ({
    ...EMPTY,
    ...(profile?.role === "manager" && !editContractId ? { owner_ids: [profile.id] } : {}),
    ...initial,
  }));
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([]);
  const [managers, setManagers] = useState<{ id: string; full_name: string | null; email: string; role: string }[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [weekCounts, setWeekCounts] = useState<Record<DType, number[]>>({} as any);
  const [tasks, setTasks] = useState<PlannedTask[]>(() => editInitialTasks ?? []);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ContractValues>(k: K, val: ContractValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  useEffect(() => {
    void (async () => {
      const [{ data: pts }, { data: mgrs }, { data: users }] = await Promise.all([
        supabase.from("content_partners").select("id,name").eq("is_active", true).order("name"),
        supabase.from("profiles").select("id,full_name,email,role").in("role", ["manager", "super_admin"]).eq("is_active", true).order("full_name"),
        supabase.from("profiles").select("id,full_name,email,role").in("role", ["editor", "manager", "ops_support", "super_admin"]).eq("is_active", true).order("full_name"),
      ]);
      const isSuperAdmin = profile?.role === "super_admin";
      setPartners(pts ?? []);
      // Regular managers can only see themselves as a contract owner, not other managers
      setManagers(isSuperAdmin ? (mgrs ?? []) : (mgrs ?? []).filter((m: any) => m.id === profile?.id));
      // Regular managers cannot assign tasks to other managers or super_admins
      setAssignableUsers(
        (users ?? [])
          .filter((u: any) => isSuperAdmin || (u.role !== "manager" && u.role !== "super_admin"))
          .map((u: any) => ({ id: u.id, name: u.full_name ?? u.email, role: u.role }))
      );
    })();
  }, []);

  const weeks: WeekInfo[] = useMemo(() => {
    if (!v.start_date || !v.end_date) return [];
    try { return weeksBetween(v.start_date, v.end_date); } catch { return []; }
  }, [v.start_date, v.end_date]);

  // When entering step 2, initialise weekCounts + tasks from totals
  function buildPlanFromTotals() {
    if (!weeks.length) return;
    const next: Record<DType, number[]> = {} as any;
    const nextTasks: PlannedTask[] = [];
    for (const dt of DELIVERABLE_TYPES) {
      const total = v[dt.totalField] as number;
      const dist = evenDistribution(total, weeks.length);
      next[dt.key] = dist;
      let n = 1;
      for (let wi = 0; wi < weeks.length; wi++) {
        const cnt = dist[wi];
        for (let i = 0; i < cnt; i++) {
          nextTasks.push({
            uid: `${dt.key}-${wi}-${i}-${Math.random().toString(36).slice(2, 7)}`,
            title: "",
            description: "",
            deliverable_type: dt.key,
            week_index: wi + 1,
            due_date: weeks[wi].endISO,
            assigned_to: null,
          });
          n++;
        }
      }
      void n;
    }
    setWeekCounts(next);
    setTasks(nextTasks);
  }

  function validateStep1(): string | null {
    if (!v.content_partner_id) return "Select a content partner.";
    if (!v.start_date) return "Start date is required.";
    if (!v.end_date) return "End date is required.";
    if (new Date(v.end_date) <= new Date(v.start_date)) return "End date must be after start date.";
    const t = v.total_articles + v.total_newsletters + v.total_homepage_banners + v.total_article_banners + v.total_social_posts;
    if (t === 0) return "At least one deliverable count must be greater than zero.";
    if (v.owner_ids.length === 0) return "At least one contract owner is required.";
    return null;
  }

  function validateStep2(): string | null {
    for (const t of tasks) {
      if (!t.title.trim()) return `Every task needs a title — check ${t.deliverable_type.replace(/_/g, " ")}`;
    }
    return null;
  }

  function goToStep2() {
    const e = validateStep1();
    if (e) { toast.error(e); return; }
    if (isEdit) {
      // Preserve existing tasks, but reconcile against the (possibly changed)
      // totals: if a deliverable total was increased, append empty task slots
      // for the difference so new deliverables get boxes to fill in.
      const additions: PlannedTask[] = [];
      for (const dt of DELIVERABLE_TYPES) {
        const total = v[dt.totalField] as number;
        const existingCount = tasks.filter((t) => t.deliverable_type === dt.key).length;
        const missing = total - existingCount;
        if (missing > 0 && weeks.length) {
          const dist = evenDistribution(missing, weeks.length);
          for (let wi = 0; wi < weeks.length; wi++) {
            for (let i = 0; i < dist[wi]; i++) {
              additions.push({
                uid: `${dt.key}-add-${wi}-${i}-${Math.random().toString(36).slice(2, 7)}`,
                title: "",
                description: "",
                deliverable_type: dt.key,
                week_index: wi + 1,
                due_date: weeks[wi].endISO,
                assigned_to: null,
              });
            }
          }
        }
      }
      const merged = additions.length ? [...tasks, ...additions] : tasks;
      if (additions.length) setTasks(merged);
      const next: Record<DType, number[]> = {} as any;
      for (const dt of DELIVERABLE_TYPES) {
        next[dt.key] = weeks.map((w) => merged.filter((t) => t.deliverable_type === dt.key && t.week_index === w.index).length);
      }
      setWeekCounts(next);
    } else {
      buildPlanFromTotals();
    }
    setStep(2);
  }

  function goToStep3() {
    const e = validateStep2();
    if (e) { toast.error(e); return; }
    setStep(3);
  }

  async function submit(asActive: boolean) {
    setSaving(true);
    try {
      const payload = {
        content_partner_id: v.content_partner_id,
        plan_type: v.plan_type,
        start_date: v.start_date,
        end_date: v.end_date,
        status: isEdit ? v.status : (asActive ? ("active" as const) : v.status),
        notes: v.notes || null,
        total_articles: v.total_articles,
        total_newsletters: v.total_newsletters,
        total_homepage_banners: v.total_homepage_banners,
        total_article_banners: v.total_article_banners,
        total_social_posts: v.total_social_posts,
        owner_ids: v.owner_ids,
        tasks: tasks.map((t) => ({
          existing_id: t.existing_id ?? null,
          title: t.title.trim(),
          description: t.description.trim() || null,
          deliverable_type: t.deliverable_type,
          due_date: t.due_date,
          assigned_to: t.assigned_to,
        })),
      };
      if (isEdit && editContractId) {
        const res = await callUpdate({ data: { ...payload, id: editContractId } });
        toast.success(`Contract updated (${res.task_count} tasks).`);
        void navigate({ to: "/contracts/$id", params: { id: editContractId } });
      } else {
        const res = await callCreate({ data: payload });
        toast.success(`Contract created with ${res.task_count} tasks.`);
        void navigate({ to: "/contracts/$id", params: { id: res.id } });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create contract.");
    } finally {
      setSaving(false);
    }
  }

  function toggleOwner(id: string) {
    if (v.owner_ids.includes(id)) set("owner_ids", v.owner_ids.filter((x) => x !== id));
    else set("owner_ids", [...v.owner_ids, id]);
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === 1 && (
        <Step1Basics
          v={v} set={set} partners={partners} managers={managers}
          lockPartner={lockPartner} profileRole={profile?.role} toggleOwner={toggleOwner}
        />
      )}

      {step === 2 && (
        <Step2Planner
          weeks={weeks} tasks={tasks} setTasks={setTasks}
          weekCounts={weekCounts} setWeekCounts={setWeekCounts}
          totals={v}
          assignableUsers={assignableUsers}
          rebuildForType={(dt) => {
            const total = v[dt.totalField] as number;
            const dist = evenDistribution(total, weeks.length);
            setWeekCounts((p) => ({ ...p, [dt.key]: dist }));
            const others = tasks.filter((t) => t.deliverable_type !== dt.key);
            const created: PlannedTask[] = [];
            for (let wi = 0; wi < weeks.length; wi++) {
              for (let i = 0; i < dist[wi]; i++) {
                created.push({
                  uid: `${dt.key}-${wi}-${i}-${Math.random().toString(36).slice(2, 7)}`,
                  title: "", description: "",
                  deliverable_type: dt.key,
                  week_index: wi + 1,
                  due_date: weeks[wi].endISO,
                  assigned_to: null,
                });
              }
            }
            setTasks([...others, ...created]);
          }}
        />
      )}

      {step === 3 && (
        <Step3Review v={v} tasks={tasks} weeks={weeks} partners={partners} managers={managers} assignableUsers={assignableUsers} />
      )}

      <div className="sticky bottom-0 -mx-2 flex items-center justify-between gap-2 border-t border-border bg-card px-4 py-3 shadow-sm">
        <Button variant="outline" onClick={() => navigate({ to: "/contracts" })} disabled={saving}>
          Cancel
        </Button>
        <div className="flex items-center gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)} disabled={saving}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Button>
          )}
          {step === 1 && <Button onClick={goToStep2}>Next: Plan tasks <ChevronRight className="ml-1 h-4 w-4" /></Button>}
          {step === 2 && <Button onClick={goToStep3}>Next: Review <ChevronRight className="ml-1 h-4 w-4" /></Button>}
          {step === 3 && (
            <>
              {!isEdit && (
                <Button variant="outline" onClick={() => submit(false)} disabled={saving}>
                  {saving ? "Saving…" : "Save as Draft"}
                </Button>
              )}
              <Button onClick={() => submit(true)} disabled={saving}>
                {saving ? "Saving…" : isEdit ? "Save changes" : "Create & Activate"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── Stepper ─────────────────────── */
function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Contract basics" },
    { n: 2, label: "Week planner & tasks" },
    { n: 3, label: "Review & confirm" },
  ];
  return (
    <div className="flex items-center gap-3">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-3">
          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
            step === s.n ? "bg-primary text-primary-foreground" : step > s.n ? "bg-emerald-500 text-white" : "bg-secondary text-text-tertiary",
          )}>
            {step > s.n ? <Check className="h-4 w-4" /> : s.n}
          </div>
          <div className={cn("text-sm", step === s.n ? "font-semibold text-text-primary" : "text-text-secondary")}>{s.label}</div>
          {i < steps.length - 1 && <div className="h-px w-8 bg-border" />}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────── Step 1 ─────────────────────── */
function Step1Basics({
  v, set, partners, managers, lockPartner, profileRole, toggleOwner,
}: {
  v: ContractValues;
  set: <K extends keyof ContractValues>(k: K, val: ContractValues[K]) => void;
  partners: { id: string; name: string }[];
  managers: { id: string; full_name: string | null; email: string; role: string }[];
  lockPartner?: boolean;
  profileRole?: string;
  toggleOwner: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Card className="border-border">
        <CardContent className="space-y-5 p-6">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Commercial terms</div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label className="mb-1.5 block">Content Partner *</Label>
              <Select value={v.content_partner_id} onValueChange={(val) => set("content_partner_id", val)} disabled={lockPartner}>
                <SelectTrigger><SelectValue placeholder="Select a partner" /></SelectTrigger>
                <SelectContent>{partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Plan type *</Label>
              <Select value={v.plan_type} onValueChange={(val) => set("plan_type", val as ContractValues["plan_type"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PLAN_TYPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Start date * <span className="text-text-tertiary">(weeks run Thu→Wed)</span></Label>
              <Input type="date" value={v.start_date} onChange={(e) => set("start_date", e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block">End date *</Label>
              <Input type="date" value={v.end_date} onChange={(e) => set("end_date", e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block">Status</Label>
              <Select value={v.status} onValueChange={(val) => set("status", val as ContractValues["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  {profileRole === "super_admin" && <SelectItem value="cancelled">Cancelled</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block">Internal notes / description</Label>
            <Textarea rows={3} maxLength={5000} value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional, internal use only" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardContent className="space-y-4 p-6">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Deliverable totals</div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {DELIVERABLE_TYPES.map((dt) => (
              <NumField key={dt.key} label={dt.label} value={v[dt.totalField] as number}
                onChange={(n) => set(dt.totalField as any, n as any)} />
            ))}
          </div>
          <p className="text-xs text-text-tertiary">Next, we'll split these across weeks and you'll add details for each task.</p>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardContent className="space-y-4 p-6">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Contract owners</div>
          <div className="flex flex-wrap gap-2">
            {v.owner_ids.map((id) => {
              const m = managers.find((mm) => mm.id === id);
              return (
                <div key={id} className="flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 text-xs">
                  <span>{m?.full_name ?? m?.email ?? "—"}</span>
                  <button onClick={() => toggleOwner(id)} className="text-text-tertiary hover:text-text-primary"><X className="h-3 w-3" /></button>
                </div>
              );
            })}
            {v.owner_ids.length === 0 && <span className="text-xs text-text-tertiary">No owners selected.</span>}
          </div>
          <div className="max-h-48 overflow-y-auto rounded-md border border-border">
            {managers.filter((m) => !v.owner_ids.includes(m.id)).map((m) => (
              <button key={m.id} onClick={() => toggleOwner(m.id)} type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-secondary">
                <span>{m.full_name ?? m.email}</span>
                <span className="text-[10px] uppercase tracking-wide text-text-tertiary">{m.role === "super_admin" ? "Admin" : "Manager"}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs">{label}</Label>
      <Input type="number" min={0} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
    </div>
  );
}

/* ─────────────────────── Step 2 ─────────────────────── */
function Step2Planner({
  weeks, tasks, setTasks, weekCounts, setWeekCounts, totals, assignableUsers, rebuildForType,
}: {
  weeks: WeekInfo[];
  tasks: PlannedTask[];
  setTasks: React.Dispatch<React.SetStateAction<PlannedTask[]>>;
  weekCounts: Record<DType, number[]>;
  setWeekCounts: React.Dispatch<React.SetStateAction<Record<DType, number[]>>>;
  totals: ContractValues;
  assignableUsers: { id: string; name: string; role: string }[];
  rebuildForType: (dt: typeof DELIVERABLE_TYPES[number]) => void;
}) {
  const [openSections, setOpenSections] = useState<Record<DType, boolean>>(() =>
    Object.fromEntries(DELIVERABLE_TYPES.map((d, i) => [d.key, i === 0])) as Record<DType, boolean>,
  );
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  function toggleSection(k: DType) {
    setOpenSections((p) => ({ ...p, [k]: !p[k] }));
  }

  function updateTask(uid: string, patch: Partial<PlannedTask>) {
    setTasks((p) => p.map((t) => (t.uid === uid ? { ...t, ...patch } : t)));
  }

  function bulkAssign(dt: DType, userId: string | null) {
    setTasks((p) => p.map((t) => (t.deliverable_type === dt && selected[t.uid] ? { ...t, assigned_to: userId } : t)));
    toast.success(userId ? "Assigned selected tasks." : "Cleared assignee.");
  }

  function applyTitlePattern(dt: DType, pattern: string) {
    let n = 1;
    setTasks((p) => p.map((t) => {
      if (t.deliverable_type !== dt) return t;
      const title = pattern.replace("{n}", String(n)).replace("{week}", `W${t.week_index}`);
      n++;
      return { ...t, title };
    }));
  }

  return (
    <div className="space-y-4">

      {DELIVERABLE_TYPES.map((dt) => {
        const total = totals[dt.totalField] as number;
        if (total === 0) return null;
        const sectionTasks = tasks.filter((t) => t.deliverable_type === dt.key);
        if (sectionTasks.length === 0) return null;
        const selectedCount = sectionTasks.filter((t) => selected[t.uid]).length;
        const open = openSections[dt.key];

        return (
          <Card key={dt.key} className="border-border">
            <CardContent className="p-0">
              <button onClick={() => toggleSection(dt.key)} className="flex w-full items-center justify-between gap-2 px-4 py-3 hover:bg-secondary/40">
                <div className="flex items-center gap-2">
                  {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  <span className="font-semibold">{dt.label}</span>
                  <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium text-text-secondary">{sectionTasks.length} tasks</span>
                </div>
              </button>

              {open && (
                <div className="border-t border-border">
                  {/* Bulk bar */}
                  <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/30 px-4 py-2 text-xs">
                    <span className="text-text-tertiary">{selectedCount} selected</span>
                    <Select onValueChange={(v) => bulkAssign(dt.key, v === "__none__" ? null : v)} disabled={selectedCount === 0}>
                      <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="Bulk assign…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {assignableUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="ml-auto flex items-center gap-2">
                      <Input placeholder="Title pattern e.g. Article {n}" className="h-7 w-56 text-xs" id={`pat-${dt.key}`} />
                      <Button size="sm" variant="outline" className="h-7" onClick={() => {
                        const el = document.getElementById(`pat-${dt.key}`) as HTMLInputElement | null;
                        if (el?.value) applyTitlePattern(dt.key, el.value);
                      }}>
                        Apply
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-secondary/30 text-left text-[10px] uppercase tracking-wide text-text-tertiary">
                          <th className="w-8 px-3 py-2">
                            <input type="checkbox"
                              checked={sectionTasks.length > 0 && sectionTasks.every((t) => selected[t.uid])}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                const next: Record<string, boolean> = { ...selected };
                                sectionTasks.forEach((t) => { next[t.uid] = checked; });
                                setSelected(next);
                              }}
                            />
                          </th>
                          <th className="w-12 px-2 py-2">Week</th>
                          <th className="px-2 py-2">Title *</th>
                          <th className="px-2 py-2">Description *</th>
                          <th className="w-32 px-2 py-2">Due date</th>
                          <th className="w-44 px-2 py-2">Assignee</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sectionTasks.map((t) => (
                          <tr key={t.uid} className="border-t border-border">
                            <td className="px-3 py-1.5">
                              <input type="checkbox" checked={!!selected[t.uid]}
                                onChange={(e) => setSelected((p) => ({ ...p, [t.uid]: e.target.checked }))} />
                            </td>
                            <td className="px-2 py-1.5 font-mono text-[11px] text-text-tertiary">W{t.week_index}</td>
                            <td className="px-1 py-1.5">
                              <Input className="h-8 text-xs" value={t.title} onChange={(e) => updateTask(t.uid, { title: e.target.value })} placeholder="Required" />
                            </td>
                            <td className="px-1 py-1.5">
                              <Input className="h-8 text-xs" value={t.description} onChange={(e) => updateTask(t.uid, { description: e.target.value })} placeholder="Brief description" />
                            </td>
                            <td className="px-1 py-1.5">
                              <Input type="date" className="h-8 text-xs" value={t.due_date} onChange={(e) => updateTask(t.uid, { due_date: e.target.value })} />
                            </td>
                            <td className="px-1 py-1.5">
                              <Select value={t.assigned_to ?? "__none__"}
                                onValueChange={(v) => updateTask(t.uid, { assigned_to: v === "__none__" ? null : v })}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">Unassigned</SelectItem>
                                  {assignableUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      <Plus className="hidden" /><Minus className="hidden" /><Users className="hidden" />
    </div>
  );
}

/* ─────────────────────── Step 3 ─────────────────────── */
function Step3Review({
  v, tasks, weeks, partners, managers, assignableUsers,
}: {
  v: ContractValues;
  tasks: PlannedTask[];
  weeks: WeekInfo[];
  partners: { id: string; name: string }[];
  managers: { id: string; full_name: string | null; email: string; role: string }[];
  assignableUsers: { id: string; name: string; role: string }[];
}) {
  const partner = partners.find((p) => p.id === v.content_partner_id);
  const byType = DELIVERABLE_TYPES.map((dt) => ({
    label: dt.label,
    count: tasks.filter((t) => t.deliverable_type === dt.key).length,
  })).filter((x) => x.count > 0);

  const byWeek = weeks.map((w) => ({
    label: `W${w.index} · ${new Date(w.start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
    count: tasks.filter((t) => t.week_index === w.index).length,
  }));

  const byAssignee = new Map<string, number>();
  for (const t of tasks) {
    const key = t.assigned_to ?? "__unassigned__";
    byAssignee.set(key, (byAssignee.get(key) ?? 0) + 1);
  }
  const assigneeRows = Array.from(byAssignee.entries()).map(([id, count]) => ({
    name: id === "__unassigned__" ? "Unassigned" : (assignableUsers.find((u) => u.id === id)?.name ?? "—"),
    count,
  }));

  return (
    <div className="space-y-4">
      <Card className="border-border">
        <CardContent className="space-y-2 p-6">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Summary</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-text-tertiary">Partner: </span>{partner?.name ?? "—"}</div>
            <div><span className="text-text-tertiary">Plan: </span>{v.plan_type}</div>
            <div><span className="text-text-tertiary">Dates: </span>{v.start_date} → {v.end_date}</div>
            <div><span className="text-text-tertiary">Total weeks: </span>{weeks.length}</div>
            <div><span className="text-text-tertiary">Total tasks: </span>{tasks.length}</div>
            <div><span className="text-text-tertiary">Owners: </span>{v.owner_ids.map((id) => managers.find((m) => m.id === id)?.full_name ?? "—").join(", ")}</div>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-border"><CardContent className="space-y-1 p-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">By type</div>
          {byType.map((r) => <div key={r.label} className="flex justify-between text-xs"><span>{r.label}</span><span className="font-medium">{r.count}</span></div>)}
        </CardContent></Card>
        <Card className="border-border"><CardContent className="space-y-1 p-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">By week</div>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {byWeek.map((r) => <div key={r.label} className="flex justify-between text-xs"><span>{r.label}</span><span className="font-medium">{r.count}</span></div>)}
          </div>
        </CardContent></Card>
        <Card className="border-border"><CardContent className="space-y-1 p-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">By assignee</div>
          {assigneeRows.map((r) => <div key={r.name} className="flex justify-between text-xs"><span>{r.name}</span><span className="font-medium">{r.count}</span></div>)}
        </CardContent></Card>
      </div>
      <p className="text-xs text-text-tertiary">After confirming, all {tasks.length} tasks will be created and mapped to the contract.</p>
    </div>
  );
}

// silence import lint if any
void toISODate;
