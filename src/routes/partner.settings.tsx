import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/partner/settings")({
  component: () => (
    <AppShell allowed="content_partner">
      <PartnerSettings />
    </AppShell>
  ),
});

function PartnerSettings() {
  const { profile } = useAuth();
  const [partnerName, setPartnerName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("content_partners").select("name").maybeSingle();
      setPartnerName(data?.name ?? "");
    })();
  }, []);

  async function resetPassword() {
    if (!profile) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      toast.success("Password reset email sent. Check your inbox.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Partner portal</div>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">Settings</h1>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base">Profile</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Full name" value={profile?.full_name ?? "—"} />
          <Row label="Email" value={profile?.email ?? "—"} />
          <Row label="Organization" value={partnerName} />
          <p className="pt-2 text-xs text-text-tertiary">
            To change name, email, or organization, contact your Thursd contact: <a href="mailto:hello@thursd.com" className="text-primary hover:underline">hello@thursd.com</a>
          </p>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base">Password</CardTitle></CardHeader>
        <CardContent>
          <Button onClick={resetPassword} disabled={busy}>{busy ? "Sending…" : "Send password reset email"}</Button>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base">Notification preferences</CardTitle></CardHeader>
        <CardContent className="text-sm text-text-tertiary">Notification settings coming soon.</CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <span className="text-text-tertiary">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
