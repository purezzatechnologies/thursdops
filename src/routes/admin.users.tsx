import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  createInternalUser, listAllUsers, resetUserPassword, updateInternalUser,
} from "@/lib/admin.functions";
import { toast } from "sonner";
import { KeyRound, Search, UserPlus } from "lucide-react";

export const Route = createFileRoute("/admin/users")({
  component: () => (
    <AppShell allowed="super_admin">
      <UsersPage />
    </AppShell>
  ),
});

type Role = "super_admin" | "manager" | "editor" | "ops_support" | "content_partner";

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  partner: { partnerId: string; partnerName: string } | null;
}

function UsersPage() {
  const listFn = useServerFn(listAllUsers);
  const createFn = useServerFn(createInternalUser);
  const updateFn = useServerFn(updateInternalUser);
  const resetFn = useServerFn(resetUserPassword);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [partners, setPartners] = useState<Array<{ id: string; name: string }>>([]);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  const refresh = async () => {
    const res = await listFn({ data: {} });
    setRows(res.rows as UserRow[]);
  };

  useEffect(() => {
    void refresh();
    void supabase.from("content_partners").select("id,name").eq("is_active", true).order("name").then(({ data }) => setPartners(data ?? []));
  }, []);

  const filtered = rows.filter((r) => {
    if (roleFilter !== "all" && r.role !== roleFilter) return false;
    if (q && !`${r.full_name ?? ""} ${r.email}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Super Admin</div>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight">Users</h1>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button><UserPlus className="mr-2 h-4 w-4" />New user</Button>
          </DialogTrigger>
          <NewUserDialog
            partners={partners}
            busy={busy}
            onSubmit={async (payload) => {
              setBusy(true);
              try {
                const res = await createFn({ data: payload });
                toast.success(`Created. Temp password: ${res.tempPassword}`);
                setOpenNew(false);
                await refresh();
              } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
              finally { setBusy(false); }
            }}
          />
        </Dialog>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <Input className="pl-9" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="ops_support">Ops Support</SelectItem>
                <SelectItem value="content_partner">Content Partner</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-text-tertiary">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Partner</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Last sign-in</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{u.full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-text-secondary">{u.email}</td>
                    <td className="px-4 py-3"><Badge variant="secondary">{u.role.replace(/_/g, " ")}</Badge></td>
                    <td className="px-4 py-3 text-text-secondary">{u.partner?.partnerName ?? "—"}</td>
                    <td className="px-4 py-3">
                      {u.is_active
                        ? <Badge className="bg-success-light text-success">Active</Badge>
                        : <Badge variant="secondary">Inactive</Badge>}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-tertiary">
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "Never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>Edit</Button>
                      <Button
                        variant="ghost" size="sm"
                        onClick={async () => {
                          try { await resetFn({ data: { email: u.email } }); toast.success("Password reset email sent"); }
                          catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                        }}
                      >
                        <KeyRound className="mr-1 h-3.5 w-3.5" />Reset
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-text-tertiary">No users.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {editing && (
        <EditUserDialog
          user={editing}
          partners={partners}
          busy={busy}
          onClose={() => setEditing(null)}
          onSubmit={async (payload) => {
            setBusy(true);
            try {
              await updateFn({ data: payload });
              toast.success("User updated");
              setEditing(null);
              await refresh();
            } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
            finally { setBusy(false); }
          }}
        />
      )}
    </div>
  );
}

function NewUserDialog({ partners, busy, onSubmit }: {
  partners: Array<{ id: string; name: string }>;
  busy: boolean;
  onSubmit: (d: { fullName: string; email: string; role: Role; partnerId?: string | null }) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [partnerId, setPartnerId] = useState<string>("");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Create user</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="super_admin">Super Admin</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="ops_support">Ops Support</SelectItem>
              <SelectItem value="content_partner">Content Partner</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {role === "content_partner" && (
          <div className="space-y-1.5">
            <Label>Partner</Label>
            <Select value={partnerId} onValueChange={setPartnerId}>
              <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
              <SelectContent>
                {partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <p className="text-xs text-text-tertiary">
          A temporary password will be generated. Share it with the user securely.
        </p>
      </div>
      <DialogFooter>
        <Button
          disabled={busy || !fullName || !email || (role === "content_partner" && !partnerId)}
          onClick={() => onSubmit({ fullName, email, role, partnerId: role === "content_partner" ? partnerId : null })}
        >Create user</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function EditUserDialog({ user, partners, busy, onClose, onSubmit }: {
  user: UserRow;
  partners: Array<{ id: string; name: string }>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (d: { profileId: string; fullName?: string; role?: Role; isActive?: boolean; partnerId?: string | null }) => void;
}) {
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [role, setRole] = useState<Role>(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [partnerId, setPartnerId] = useState<string>(user.partner?.partnerId ?? "");
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit user</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="super_admin">Super Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="ops_support">Ops Support</SelectItem>
                <SelectItem value="content_partner">Content Partner</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {role === "content_partner" && (
            <div className="space-y-1.5">
              <Label>Partner</Label>
              <Select value={partnerId} onValueChange={setPartnerId}>
                <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                <SelectContent>
                  {partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label className="m-0">Active</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy}
            onClick={() => onSubmit({
              profileId: user.id,
              fullName,
              role,
              isActive,
              partnerId: role === "content_partner" ? partnerId : null,
            })}
          >Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
