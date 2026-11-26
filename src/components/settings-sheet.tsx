import { useEffect, useRef, useState } from "react";
import { Moon, Sun, Monitor, Settings, Check, Camera, Download, Upload, Trash2, FlaskConical, ShieldAlert } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import { AvatarCropper } from "@/components/avatar-cropper";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { exportAllData, getDataCounts, wipeAllData, restoreAllData } from "@/lib/admin-data.functions";
import { seedDemoData, clearDemoData, getDemoDataStatus } from "@/lib/demo-data.functions";
import { setAppLogo } from "@/lib/admin-branding.functions";
import { useBranding } from "@/lib/branding";
import { BrandLogo } from "@/components/brand-logo";
import { ImagePlus, RotateCcw } from "lucide-react";
import { type Theme, applyTheme, getStoredTheme, saveTheme } from "@/lib/theme";
import {
  BG_PRESETS,
  type BgConfig,
  getStoredBackground,
  saveBackground,
  resetBackground,
} from "@/lib/background";

function downloadJson(filename: string, obj: unknown) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function SettingsSheet() {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === "super_admin";
  const { logoUrl, refresh: refreshBranding } = useBranding();
  const callSetLogo = useServerFn(setAppLogo);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"profile" | "appearance" | "security" | "branding" | "developer">("profile");

  // Developer tools (super admin)
  const callExport = useServerFn(exportAllData);
  const callCounts = useServerFn(getDataCounts);
  const callWipe = useServerFn(wipeAllData);
  const callRestore = useServerFn(restoreAllData);
  const callSeedDemo = useServerFn(seedDemoData);
  const callClearDemo = useServerFn(clearDemoData);
  const callDemoStatus = useServerFn(getDemoDataStatus);
  const [dataTotal, setDataTotal] = useState<number | null>(null);
  const [demoPresent, setDemoPresent] = useState(false);
  const [devBusy, setDevBusy] = useState<"" | "backup" | "wipe" | "restore" | "demo" | "demo-del">("");
  const [backupFirst, setBackupFirst] = useState(true);
  const [wipeConfirm, setWipeConfirm] = useState("");
  const restoreInputRef = useRef<HTMLInputElement>(null);

  async function refreshCounts() {
    try {
      const c = await callCounts();
      setDataTotal(c.total);
    } catch {
      setDataTotal(null);
    }
    try {
      const d = await callDemoStatus();
      setDemoPresent(d.present);
    } catch {
      setDemoPresent(false);
    }
  }

  async function doBackup() {
    setDevBusy("backup");
    try {
      const snapshot = await callExport();
      downloadJson(`thursdops-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`, snapshot);
      toast.success(`Backup downloaded — ${snapshot._meta.total} records.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup failed.");
    } finally { setDevBusy(""); }
  }

  async function doWipe() {
    setDevBusy("wipe");
    try {
      if (backupFirst) {
        const snapshot = await callExport();
        downloadJson(`thursdops-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`, snapshot);
      }
      const r = await callWipe({ data: { confirm: "ERASE" } });
      toast.success(`All data wiped — ${r.deleted} records removed.`);
      setWipeConfirm("");
      await refreshCounts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Wipe failed.");
    } finally { setDevBusy(""); }
  }

  async function doRestore(file: File) {
    setDevBusy("restore");
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const r = await callRestore({ data: { payload } });
      toast.success(`Restored — ${r.inserted} records.`);
      await refreshCounts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed — check the file.");
    } finally { setDevBusy(""); }
  }

  async function doDeleteDemo() {
    setDevBusy("demo-del");
    try {
      await callClearDemo({ data: { mode: "delete" } });
      toast.success("Demo data deleted.");
      await refreshCounts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
    } finally { setDevBusy(""); }
  }

  async function doImportDemo() {
    setDevBusy("demo");
    try {
      const r = await callSeedDemo();
      toast.success(`Demo data imported — ${r.total} records.`);
      await refreshCounts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally { setDevBusy(""); }
  }

  // Profile
  const [fullName, setFullName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Appearance
  const [theme, setTheme] = useState<Theme>("system");
  const [bg, setBg] = useState<BgConfig | null>(null);
  const [customColors, setCustomColors] = useState<string[]>(["#FE4E5C", "#FFBA8A", "#FF96B9", "#8CC8A0"]);

  // Security
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    if (open) {
      setFullName(profile?.full_name ?? "");
      setAvatarUrl(profile?.avatar_url ?? null);
      setTheme(getStoredTheme());
      const storedBg = getStoredBackground();
      setBg(storedBg);
      if (storedBg && "custom" in storedBg) setCustomColors(storedBg.custom);
    }
  }, [open, profile]);

  useEffect(() => {
    if (open && tab === "developer" && isSuperAdmin) void refreshCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, isSuperAdmin]);

  // Keep theme in sync with system changes when "system" is selected
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => { if (getStoredTheme() === "system") applyTheme("system"); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  async function uploadAvatar(blob: Blob) {
    if (!profile) return;
    setUploadingAvatar(true);
    const path = `${profile.id}/avatar.jpg`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (upErr) { toast.error(upErr.message); setUploadingAvatar(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    const busted = `${publicUrl}?t=${Date.now()}`;
    const { error: dbErr } = await supabase
      .from("profiles")
      .update({ avatar_url: busted })
      .eq("id", profile.id);
    if (dbErr) { toast.error(dbErr.message); setUploadingAvatar(false); return; }
    setAvatarUrl(busted);
    setUploadingAvatar(false);
    setCropOpen(false);
    toast.success("Photo updated.");
    // Reload so auth context reflects new avatar_url
    window.location.reload();
  }

  async function saveName() {
    if (!profile || !fullName.trim()) return;
    setSavingName(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() })
      .eq("id", profile.id);
    setSavingName(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Name updated.");
    // Reload page so auth context picks up the new name
    window.location.reload();
  }

  function pickTheme(t: Theme) {
    setTheme(t);
    saveTheme(t);
  }

  function pickPreset(id: string) {
    if (id === "default") {
      setBg(null);
      resetBackground();
    } else {
      const cfg: BgConfig = { preset: id };
      setBg(cfg);
      saveBackground(cfg);
    }
  }

  function applyCustom(colors: string[]) {
    const cfg: BgConfig = { custom: colors };
    setCustomColors(colors);
    setBg(cfg);
    saveBackground(cfg);
  }

  const activePreset = bg && "preset" in bg ? bg.preset : bg === null ? "default" : null;
  const customActive = !!bg && "custom" in bg;

  async function uploadLogo(file: File) {
    if (file.size > 1_000_000) { toast.error("Please use an image under 1 MB."); return; }
    setLogoBusy(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read the file."));
        reader.readAsDataURL(file);
      });
      await callSetLogo({ data: { logoUrl: dataUrl } });
      await refreshBranding();
      toast.success("Logo updated across the app.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally { setLogoBusy(false); }
  }

  async function resetLogo() {
    setLogoBusy(true);
    try {
      await callSetLogo({ data: { logoUrl: null } });
      await refreshBranding();
      toast.success("Logo reset to default.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed.");
    } finally { setLogoBusy(false); }
  }

  async function sendPasswordReset() {
    if (!profile) return;
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
      redirectTo: `${window.location.origin}/login`,
    });
    setSendingReset(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password reset email sent. Check your inbox.");
  }

  const TABS = [
    { key: "profile" as const, label: "Profile" },
    { key: "appearance" as const, label: "Appearance" },
    { key: "security" as const, label: "Security" },
    ...(isSuperAdmin ? [{ key: "branding" as const, label: "Branding" }, { key: "developer" as const, label: "Developer" }] : []),
  ];

  return (
    <>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="relative rounded-lg border border-border bg-card p-2 text-text-secondary hover:bg-secondary hover:text-text-primary"
          aria-label="Settings"
          type="button"
        >
          <Settings className="h-4 w-4" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full max-w-sm flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle className="text-base font-semibold">Settings</SheetTitle>
        </SheetHeader>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex-1 py-2.5 text-xs font-medium transition-colors",
                tab === t.key
                  ? "border-b-2 border-primary text-primary"
                  : "text-text-tertiary hover:text-text-primary",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* PROFILE TAB */}
          {tab === "profile" && (
            <div className="space-y-5">
              <div className="flex items-end gap-4">
                <div className="relative">
                  <UserAvatar src={avatarUrl} name={profile?.full_name ?? profile?.email} size="lg" />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary text-white shadow hover:bg-primary-hover disabled:opacity-50"
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) { setCropFile(f); setCropOpen(true); }
                      e.target.value = "";
                    }}
                  />
                </div>
                <div className="text-xs text-text-tertiary">
                  {uploadingAvatar ? "Uploading…" : "Click camera to change photo"}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary">Display name</label>
                <div className="flex gap-2">
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your name"
                    onKeyDown={(e) => { if (e.key === "Enter") void saveName(); }}
                  />
                  <Button onClick={() => void saveName()} disabled={savingName || fullName.trim() === (profile?.full_name ?? "")}>
                    {savingName ? "…" : "Save"}
                  </Button>
                </div>
              </div>

              <InfoRow label="Email" value={profile?.email ?? "—"} />
              <InfoRow label="Role" value={profile?.role.replace(/_/g, " ") ?? "—"} />
              <p className="text-xs text-text-tertiary">Email and role changes require an admin.</p>
            </div>
          )}

          {/* APPEARANCE TAB */}
          {tab === "appearance" && (
            <div className="space-y-4">
              <p className="text-sm font-medium">Theme</p>
              <div className="grid grid-cols-3 gap-2">
                {THEMES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => pickTheme(value)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 text-xs font-medium transition-colors",
                      theme === value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-card text-text-secondary hover:border-border-strong hover:text-text-primary",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                    {theme === value && <Check className="h-3 w-3" />}
                  </button>
                ))}
              </div>
              <p className="text-xs text-text-tertiary">
                "System" follows your OS preference automatically.
              </p>

              {/* Background theme */}
              <div className="pt-2">
                <p className="text-sm font-medium">Background</p>
                <p className="mt-1 text-xs text-text-secondary">
                  The colour wash behind the frosted glass.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {BG_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => pickPreset(p.id)}
                    className={cn(
                      "group relative overflow-hidden rounded-xl border-2 p-0 transition-colors",
                      activePreset === p.id ? "border-primary" : "border-border hover:border-border-strong",
                    )}
                  >
                    <span
                      className="block h-12 w-full"
                      style={{
                        backgroundImage: `radial-gradient(circle at 22% 25%, ${p.swatch[0]} 0%, transparent 55%), radial-gradient(circle at 80% 20%, ${p.swatch[1]} 0%, transparent 55%), radial-gradient(circle at 25% 82%, ${p.swatch[2]} 0%, transparent 55%), radial-gradient(circle at 82% 82%, ${p.swatch[3]} 0%, transparent 55%)`,
                      }}
                    />
                    <span className="flex items-center justify-between px-2 py-1.5 text-[11px] font-medium">
                      {p.name}
                      {activePreset === p.id && <Check className="h-3 w-3 text-primary" />}
                    </span>
                  </button>
                ))}
              </div>

              {/* Custom gradient colours */}
              <div
                className={cn(
                  "rounded-xl border-2 p-3 space-y-3",
                  customActive ? "border-primary" : "border-border",
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Custom colours</p>
                  {customActive && <Check className="h-3 w-3 text-primary" />}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {customColors.map((c, i) => (
                    <label key={i} className="flex flex-col items-center gap-1">
                      <span
                        className="relative h-10 w-full overflow-hidden rounded-lg border border-border"
                        style={{ backgroundColor: c }}
                      >
                        <input
                          type="color"
                          value={c}
                          onChange={(e) => {
                            const next = customColors.slice();
                            next[i] = e.target.value;
                            applyCustom(next);
                          }}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          aria-label={`Gradient colour ${i + 1}`}
                        />
                      </span>
                      <span className="text-[10px] uppercase text-text-tertiary">{c.replace("#", "")}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-text-tertiary">
                  Pick four colours — they're placed in the corners and blurred behind the glass.
                </p>
              </div>
            </div>
          )}

          {/* SECURITY TAB */}
          {tab === "security" && (
            <div className="space-y-5">
              <div className="rounded-xl border border-border p-4 space-y-3">
                <p className="text-sm font-medium">Password</p>
                <p className="text-xs text-text-secondary">
                  We'll send a reset link to <span className="font-medium">{profile?.email}</span>.
                </p>
                <Button
                  variant="outline"
                  onClick={() => void sendPasswordReset()}
                  disabled={sendingReset}
                  className="w-full"
                >
                  {sendingReset ? "Sending…" : "Send password reset email"}
                </Button>
              </div>

              <div className="rounded-xl border border-border p-4 space-y-3">
                <p className="text-sm font-medium">Session</p>
                <p className="text-xs text-text-secondary">
                  You are signed in as <span className="font-medium">{profile?.email}</span>.
                </p>
                <Button
                  variant="outline"
                  className="w-full text-danger hover:text-danger"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    window.location.href = "/login";
                  }}
                >
                  Sign out
                </Button>
              </div>
            </div>
          )}

          {/* BRANDING TAB (super admin only) */}
          {tab === "branding" && isSuperAdmin && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium">App logo</p>
                <p className="mt-1 text-xs text-text-secondary">
                  Replaces the logo everywhere (sidebar, login screen). Any size or shape fits automatically —
                  it's scaled to fit, never stretched or cropped. PNG or SVG with transparency works best. Max 1 MB.
                </p>
              </div>

              <div className="flex items-center gap-4 rounded-xl border border-border p-4">
                <div className="flex items-center justify-center rounded-xl bg-secondary p-2">
                  <BrandLogo size={56} rounded="rounded-lg" fallbackTextClass="text-2xl" />
                </div>
                <div className="text-xs text-text-tertiary">
                  {logoUrl ? "Custom logo in use." : "Default logo in use."}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button disabled={logoBusy} onClick={() => logoInputRef.current?.click()}>
                  <ImagePlus className="mr-1.5 h-4 w-4" /> {logoBusy ? "Saving…" : "Upload logo"}
                </Button>
                {logoUrl && (
                  <Button variant="outline" disabled={logoBusy} onClick={() => void resetLogo()}>
                    <RotateCcw className="mr-1.5 h-4 w-4" /> Reset to default
                  </Button>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.target.value = ""; }}
                />
              </div>
            </div>
          )}

          {/* DEVELOPER TAB (super admin only) */}
          {tab === "developer" && isSuperAdmin && (
            <div className="space-y-5">
              <div className="rounded-lg border border-warning/30 bg-warning-light/40 p-3 text-xs text-text-secondary">
                <div className="flex items-center gap-1.5 font-semibold text-warning">
                  <ShieldAlert className="h-3.5 w-3.5" /> Developer tools
                </div>
                <p className="mt-1">
                  For testing. Login accounts are always preserved.
                  {dataTotal !== null && <> Currently <span className="font-semibold text-text-primary">{dataTotal}</span> business records across all dashboards.</>}
                </p>
              </div>

              {/* Backup & restore */}
              <div className="rounded-xl border border-border p-4 space-y-3">
                <p className="text-sm font-medium">Backup &amp; restore</p>
                <Button variant="outline" className="w-full" disabled={devBusy !== ""} onClick={() => void doBackup()}>
                  <Download className="mr-1.5 h-4 w-4" /> {devBusy === "backup" ? "Preparing…" : "Download backup (.json)"}
                </Button>
                <Button variant="outline" className="w-full" disabled={devBusy !== ""} onClick={() => restoreInputRef.current?.click()}>
                  <Upload className="mr-1.5 h-4 w-4" /> {devBusy === "restore" ? "Restoring…" : "Restore from backup"}
                </Button>
                <input
                  ref={restoreInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void doRestore(f); e.target.value = ""; }}
                />
                <p className="text-xs text-text-tertiary">Restore replaces all current business data with the file's contents.</p>
              </div>

              {/* Demo data */}
              <div className="rounded-xl border border-border p-4 space-y-3">
                <p className="text-sm font-medium">Demo data</p>
                <p className="text-xs text-text-secondary">Populate a labelled <span className="font-medium">[Demo]</span> dataset to verify the app end-to-end.</p>
                <Button className="w-full" disabled={devBusy !== ""} onClick={() => void doImportDemo()}>
                  <FlaskConical className="mr-1.5 h-4 w-4" /> {devBusy === "demo" ? "Importing…" : demoPresent ? "Re-import demo data" : "Import demo data"}
                </Button>
                {demoPresent && (
                  <Button variant="outline" className="w-full border-danger/40 text-danger hover:bg-danger-light" disabled={devBusy !== ""} onClick={() => void doDeleteDemo()}>
                    <Trash2 className="mr-1.5 h-4 w-4" /> {devBusy === "demo-del" ? "Deleting…" : "Delete demo data"}
                  </Button>
                )}
              </div>

              {/* Danger zone */}
              <div className="rounded-xl border border-danger/40 p-4 space-y-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-danger">
                  <Trash2 className="h-4 w-4" /> Danger zone — wipe all data
                </p>
                <p className="text-xs text-text-secondary">
                  Permanently deletes every partner, contract, task, submission, KPI, request and notification —
                  emptying all dashboards. Login accounts stay intact.
                </p>
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input type="checkbox" checked={backupFirst} onChange={(e) => setBackupFirst(e.target.checked)} />
                  Download a backup first (recommended)
                </label>
                <Input
                  value={wipeConfirm}
                  onChange={(e) => setWipeConfirm(e.target.value)}
                  placeholder="Type ERASE to confirm"
                />
                <Button
                  className="w-full bg-danger text-danger-foreground hover:bg-danger/90"
                  disabled={devBusy !== "" || wipeConfirm !== "ERASE"}
                  onClick={() => void doWipe()}
                >
                  {devBusy === "wipe" ? "Wiping…" : backupFirst ? "Back up & wipe all data" : "Wipe all data"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>

    <AvatarCropper
      file={cropFile}
      open={cropOpen}
      onOpenChange={(o) => { setCropOpen(o); if (!o) setCropFile(null); }}
      onCropped={(blob) => void uploadAvatar(blob)}
      uploading={uploadingAvatar}
    />
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-3 text-sm">
      <span className="text-text-tertiary">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  );
}
