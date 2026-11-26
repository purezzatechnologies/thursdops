import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { fromNow } from "@/lib/format";

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export function NotificationsBell() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const unread = items.filter((n) => !n.is_read).length;

  async function load() {
    if (!profile) return;
    const { data } = await supabase
      .from("notifications")
      .select("id,type,title,body,link,is_read,created_at")
      .eq("recipient_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(10);
    setItems((data ?? []) as Notif[]);
  }

  useEffect(() => {
    if (!profile) return;
    void load();
    const channel = supabase
      .channel(`notif-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${profile.id}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const n = payload.new as Notif;
            setItems((prev) => [n, ...prev].slice(0, 10));
            if (typeof window !== "undefined" && !window.location.pathname.startsWith(n.link ?? "__none__")) {
              toast(n.title, {
                description: n.body ?? undefined,
                action: n.link ? { label: "Open", onClick: () => navigate({ to: n.link! }) } : undefined,
                closeButton: true,
                duration: 8000,
              });
            }
          } else {
            void load();
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function markRead(id: string) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }

  async function markAll() {
    if (!profile) return;
    await supabase.from("notifications").update({ is_read: true }).eq("recipient_id", profile.id).eq("is_read", false);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  async function onClickRow(n: Notif) {
    if (!n.is_read) await markRead(n.id);
    setOpen(false);
    if (n.link) navigate({ to: n.link });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                className="relative rounded-lg border border-border bg-card p-2 text-text-secondary hover:bg-secondary hover:text-text-primary"
                aria-label="Notifications"
                type="button"
              >
                <Bell className="h-4 w-4" />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{unread > 0 ? `${unread} unread notification${unread === 1 ? "" : "s"}` : "No new notifications"}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold">Notifications</div>
          {unread > 0 && (
            <button onClick={() => void markAll()} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <CheckCheck className="h-3.5 w-3.5" />Mark all as read
            </button>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {items.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-text-tertiary">No notifications yet.</div>
          )}
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => void onClickRow(n)}
              className={cn(
                "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left hover:bg-secondary/50",
                !n.is_read && "bg-primary-light/30",
              )}
              title={n.body ?? ""}
            >
              {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
              {n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{n.title}</div>
                {n.body && <div className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{n.body}</div>}
                <div className="mt-1 text-[11px] text-text-tertiary">{fromNow(n.created_at)}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="border-t border-border px-4 py-2.5 text-center">
          <Link to="/notifications" onClick={() => setOpen(false)} className="text-xs font-medium text-primary hover:underline">
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
