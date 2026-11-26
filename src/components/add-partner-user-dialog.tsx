import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { createPartnerUser } from "@/lib/partner-users.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("Invalid email").max(255),
});

export function AddPartnerUserDialog({
  partnerId,
  open,
  onOpenChange,
  onCreated,
}: {
  partnerId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const callCreate = useServerFn(createPartnerUser);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{ fullName?: string; email?: string }>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ email: string; password: string } | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [copied, setCopied] = useState(false);

  function reset() {
    setFullName("");
    setEmail("");
    setErrors({});
    setResult(null);
    setShowPw(false);
    setCopied(false);
  }

  function handleOpenChange(v: boolean) {
    if (busy) return;
    onOpenChange(v);
    if (!v) {
      // Allow exit animation before clearing
      setTimeout(reset, 200);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ fullName, email });
    if (!parsed.success) {
      const errs: typeof errors = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0] as keyof typeof errs;
        if (!errs[k]) errs[k] = i.message;
      }
      setErrors(errs);
      return;
    }
    setBusy(true);
    try {
      const res = await callCreate({ data: { partnerId, fullName: parsed.data.fullName, email: parsed.data.email } });
      setResult({ email: res.email, password: res.tempPassword });
      toast.success("Partner user created.");
      onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create user.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function copyAll() {
    if (!result) return;
    await navigator.clipboard.writeText(`Email: ${result.email}\nPassword: ${result.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>User created</DialogTitle>
              <DialogDescription>
                Share these credentials with the partner securely. The password
                is shown <strong>only once</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 rounded-lg border border-warning/30 bg-warning-light/40 p-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Email
                </div>
                <div className="font-mono text-sm text-text-primary">{result.email}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Temporary password
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 rounded border border-border bg-card px-2 py-1.5 font-mono text-sm">
                    {showPw ? result.password : "•".repeat(result.password.length)}
                  </code>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "Hide" : "Show"}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button type="button" variant="outline" onClick={copyAll} className="w-full">
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? "Copied" : "Copy email & password"}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Add partner user</DialogTitle>
              <DialogDescription>
                Creates a content_partner account with login access.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label>Full name</Label>
                <Input
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setErrors((p) => ({ ...p, fullName: undefined }));
                  }}
                  maxLength={200}
                  placeholder="Jane Doe"
                  autoFocus
                />
                {errors.fullName && <p className="text-xs text-danger">{errors.fullName}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrors((p) => ({ ...p, email: undefined }));
                  }}
                  maxLength={255}
                  placeholder="jane@partner.com"
                />
                {errors.email && <p className="text-xs text-danger">{errors.email}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
