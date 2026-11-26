import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Building2, Edit, Eye, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ActiveBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/partners/")({
  component: () => (
    <AppShell allowed={["super_admin", "manager", "editor", "ops_support"]}>
      <PartnersList />
    </AppShell>
  ),
});

interface Row {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  created_at: string;
  contractCount: number;
  userCount: number;
}

type StatusFilter = "active" | "inactive" | "all";
type SortKey = "name" | "created_at" | "is_active";

const PAGE_SIZE = 25;

function PartnersList() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "super_admin" || profile?.role === "manager";
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [sort, setSort] = useState<SortKey>("name");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, status, sort]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, sort, page]);

  async function load() {
    setLoading(true);
    let q = supabase
      .from("content_partners")
      .select("id,name,contact_email,contact_phone,is_active,created_at", { count: "exact" });
    if (status !== "all") q = q.eq("is_active", status === "active");
    if (search) q = q.or(`name.ilike.%${search}%,contact_email.ilike.%${search}%`);
    if (sort === "name") q = q.order("name", { ascending: true });
    if (sort === "created_at") q = q.order("created_at", { ascending: false });
    if (sort === "is_active") q = q.order("is_active", { ascending: false }).order("name");
    q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    const { data, count, error } = await q;
    if (error) {
      setLoading(false);
      return;
    }
    const ids = (data ?? []).map((r) => r.id);
    const [contractsAgg, usersAgg] = await Promise.all([
      ids.length === 0
        ? Promise.resolve({ data: [] })
        : supabase.from("contracts").select("content_partner_id").in("content_partner_id", ids),
      ids.length === 0
        ? Promise.resolve({ data: [] })
        : supabase
            .from("partner_users")
            .select("content_partner_id, profile_id")
            .in("content_partner_id", ids),
    ]);
    const cCount = new Map<string, number>();
    for (const c of contractsAgg.data ?? []) {
      cCount.set(c.content_partner_id, (cCount.get(c.content_partner_id) ?? 0) + 1);
    }
    // For user count we want ACTIVE only — fetch profiles separately
    const profileIds = ((usersAgg.data ?? []) as { profile_id: string }[]).map((u) => u.profile_id);
    let activeSet = new Set<string>();
    if (profileIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,is_active")
        .in("id", profileIds);
      activeSet = new Set((profs ?? []).filter((p) => p.is_active).map((p) => p.id));
    }
    const uCount = new Map<string, number>();
    for (const link of (usersAgg.data ?? []) as { content_partner_id: string; profile_id: string }[]) {
      if (activeSet.has(link.profile_id)) {
        uCount.set(link.content_partner_id, (uCount.get(link.content_partner_id) ?? 0) + 1);
      }
    }

    setRows(
      (data ?? []).map((r) => ({
        ...r,
        contractCount: cCount.get(r.id) ?? 0,
        userCount: uCount.get(r.id) ?? 0,
      })),
    );
    setTotal(count ?? 0);
    setLoading(false);
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showEmpty = !loading && rows.length === 0;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Content Partners"
        subtitle="Brands and organizations Thursd produces content for."
        actions={
          canEdit && (
            <Button asChild>
              <Link to="/partners/new">
                <Plus className="mr-1 h-4 w-4" /> New Partner
              </Link>
            </Button>
          )
        }
      />

      <Card className="border-border">
        <CardContent className="p-6">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name or email…"
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Sort: Name</SelectItem>
                <SelectItem value="created_at">Sort: Newest first</SelectItem>
                <SelectItem value="is_active">Sort: Status</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showEmpty ? (
            <EmptyState canEdit={canEdit} />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Contracts</TableHead>
                    <TableHead className="text-right">Users</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i} className="h-14">
                          <TableCell colSpan={7}><Skeleton className="h-5 w-full" /></TableCell>
                        </TableRow>
                      ))
                    : rows.map((r) => (
                        <TableRow key={r.id} className="h-14 hover:bg-secondary/40">
                          <TableCell>
                            <Link
                              to="/partners/$id"
                              params={{ id: r.id }}
                              className="font-medium text-text-primary hover:text-primary"
                            >
                              {r.name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{r.contact_email ?? "—"}</div>
                            <div className="text-xs text-text-tertiary">{r.contact_phone ?? ""}</div>
                          </TableCell>
                          <TableCell><ActiveBadge active={r.is_active} /></TableCell>
                          <TableCell className="text-right tabular-nums">{r.contractCount}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.userCount}</TableCell>
                          <TableCell className="text-sm text-text-secondary">
                            {new Date(r.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => navigate({ to: "/partners/$id", params: { id: r.id } })}
                                title="View"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {canEdit && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => navigate({ to: "/partners/$id/edit", params: { id: r.id } })}
                                  title="Edit"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>
          )}

          {!showEmpty && total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
              <span>
                Page {page} of {pageCount} · {total} partner{total === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-light text-primary">
        <Building2 className="h-6 w-6" />
      </div>
      <div className="text-base font-semibold">No partners yet</div>
      <div className="max-w-sm text-sm text-text-tertiary">
        {canEdit
          ? "Add your first content partner to start managing contracts and deliverables."
          : "Once a manager adds a partner, it will appear here."}
      </div>
      {canEdit && (
        <Button asChild className="mt-2">
          <Link to="/partners/new"><Plus className="mr-1 h-4 w-4" /> Create your first partner</Link>
        </Button>
      )}
    </div>
  );
}
