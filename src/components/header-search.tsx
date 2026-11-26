import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Building2, FileText, ListChecks, Search as SearchIcon, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getTaskWorkspaceRoute } from "@/lib/task-routes";
import { cn } from "@/lib/utils";

interface Result {
  kind: "task" | "contract" | "partner" | "submission";
  id: string;
  title: string | null;
  subtitle: string | null;
  status: string | null;
  link_id: string;
  extra: Record<string, unknown> | null;
}

const KIND_META: Record<Result["kind"], { label: string; icon: typeof FileText }> = {
  task: { label: "Tasks", icon: ListChecks },
  contract: { label: "Contracts", icon: FileText },
  partner: { label: "Partners", icon: Building2 },
  submission: { label: "Submissions", icon: Send },
};

export function HeaderSearch() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Cmd+K focuses search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Outside-click close.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  // Debounced search.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const { data, error } = await supabase.rpc("universal_search", { _q: term, _limit: 5 });
      if (!error) setResults((data ?? []) as Result[]);
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [q]);

  function routeFor(r: Result): string {
    switch (r.kind) {
      case "task": {
        if (!profile) return "/";
        return getTaskWorkspaceRoute({ id: r.link_id }, profile.role);
      }
      case "contract":
        if (profile?.role === "content_partner") return `/partner/contracts/${r.link_id}`;
        return `/contracts/${r.link_id}`;
      case "partner":
        return `/partners/${r.link_id}`;
      case "submission":
        return `/manager/approvals/${r.link_id}`;
    }
  }

  function onPick(r: Result) {
    setOpen(false);
    setQ("");
    navigate({ to: routeFor(r) });
  }

  const grouped = (["task", "contract", "partner", "submission"] as const)
    .map((k) => ({ kind: k, items: results.filter((r) => r.kind === k) }))
    .filter((g) => g.items.length);

  return (
    <div ref={containerRef} className="relative max-w-md flex-1">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
      <input
        ref={inputRef}
        type="text"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search contracts, partners, tasks…"
        className="h-11 w-full rounded-full border border-border bg-card glass pl-11 pr-16 text-sm shadow-sm placeholder:text-text-tertiary focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-black/5"
      />
      <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary sm:flex">
        ⌘K
      </kbd>
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-12 z-50 max-h-[420px] overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {loading && <div className="px-4 py-6 text-center text-sm text-text-tertiary">Searching…</div>}
          {!loading && grouped.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-text-tertiary">No results for "{q}".</div>
          )}
          {!loading && grouped.map((g) => {
            const Icon = KIND_META[g.kind].icon;
            return (
              <div key={g.kind}>
                <div className="border-b border-border bg-muted/40 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                  {KIND_META[g.kind].label}
                </div>
                {g.items.map((r) => (
                  <button
                    key={`${r.kind}-${r.id}`}
                    onClick={() => onPick(r)}
                    className={cn("flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left hover:bg-secondary/50")}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-text-tertiary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.title ?? "—"}</div>
                      {r.subtitle && <div className="truncate text-xs text-text-tertiary">{r.subtitle}</div>}
                    </div>
                    {r.status && (
                      <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                        {r.status.replace(/_/g, " ")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
