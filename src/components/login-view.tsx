import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2, ArrowRight, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, dashboardPathForRole } from "@/lib/auth";
import { BrandLogo } from "@/components/brand-logo";
import { getStoredBackground, BG_PRESETS } from "@/lib/background";
import { toast } from "sonner";

type Variant = "staff" | "partner";

const REMEMBER_KEY: Record<Variant, string> = {
  staff: "thursd-login-email",
  partner: "thursd-partner-login-email",
};

const CONFIG = {
  staff: {
    eyebrow: "Operations Cloud",
    badge: "Team & Managers",
    heroTitle: "Everything, in one calm place.",
    heroBody:
      "Partners, contracts, deliverables, approvals and reporting — one workspace that keeps the whole team in bloom.",
    heading: "Welcome back",
    sub: "Sign in to your workspace to continue.",
    image: "https://images.unsplash.com/photo-1490750967868-88aa4486c946?q=80&w=1400&auto=format&fit=crop",
    // Which swatch slots drive this window's accent + button (keeps staff/partner
    // distinct while both follow the admin theme).
    accentIdx: 0, buttonIdx: [0, 1] as const,
    trust: [
      { initials: "AW", from: "#FE4E5C", to: "#FF96B9" },
      { initials: "MM", from: "#ff8f6b", to: "#FFC49B" },
      { initials: "EK", from: "#0FA968", to: "#8CC8A0" },
    ],
    trustTitle: "Your whole team, in sync",
    trustSub: "admins · managers · editors · partners",
    crossText: "Are you a content partner?",
    crossCta: "Partner sign-in",
    crossTo: "/partner-login",
  },
  partner: {
    eyebrow: "Partner Portal",
    badge: "Content Partners",
    heroTitle: "Your content, beautifully in bloom.",
    heroBody:
      "Review your deliverables, approve what's ready, and watch your reach grow — your own calm corner of Thursd.",
    heading: "Partner sign-in",
    sub: "Access your content, approvals and performance.",
    image: "https://images.unsplash.com/photo-1462530260150-162092dbf011?q=80&w=1400&auto=format&fit=crop",
    accentIdx: 2, buttonIdx: [2, 0] as const,
    trust: [
      { initials: "🌷", from: "#E0568F", to: "#f7a8d0" },
      { initials: "📈", from: "#7c5ad6", to: "#c3a8ff" },
      { initials: "✓", from: "#2f9e8f", to: "#9fd8c4" },
    ],
    trustTitle: "Approvals & performance, in one place",
    trustSub: "review · approve · measure",
    crossText: "Thursd team member?",
    crossCta: "Staff sign-in",
    crossTo: "/login",
  },
} as const;

/** Resolve the admin-chosen theme swatch (background preset / custom colours). */
function resolveSwatch(): string[] {
  const cfg = getStoredBackground();
  if (cfg && "custom" in cfg && cfg.custom?.length) return cfg.custom;
  const id = cfg && "preset" in cfg ? cfg.preset : "default";
  return (BG_PRESETS.find((p) => p.id === id) ?? BG_PRESETS[0]).swatch;
}

export function LoginView({ variant }: { variant: Variant }) {
  const cfg = CONFIG[variant];
  const navigate = useNavigate();
  const { profile, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  // Default to the built-in Thursd swatch for SSR; resolve the real one after mount.
  const [swatch, setSwatch] = useState<string[]>(BG_PRESETS[0].swatch);
  // Set when THIS form was submitted (vs. an existing session); carries the values
  // needed at redirect time so the effect need not depend on email/remember.
  const submitted = useRef<{ email: string; remember: boolean } | null>(null);

  useEffect(() => {
    if (loading || !profile) return;
    const isPartner = profile.role === "content_partner";
    const wrongDoor = variant === "partner" ? !isPartner : isPartner;
    const sub = submitted.current;

    // Only reject when the mismatch came from signing in on this form — never strip
    // an already-valid session just because it landed on the other login page.
    // Sign out and stay put with a clear message (the cross-link points the right way);
    // staying avoids racing the async sign-out against a dashboard redirect.
    if (wrongDoor && sub) {
      submitted.current = null;
      void supabase.auth.signOut();
      try { localStorage.removeItem(REMEMBER_KEY[variant]); } catch { /* storage blocked */ }
      toast.error(
        variant === "partner"
          ? "This portal is for content partners only — please use staff sign-in."
          : "Content partners sign in from the partner portal — see the link below.",
      );
      return;
    }
    if (!wrongDoor) {
      // Persist "remember me" only for an accepted sign-in on the correct door.
      if (sub) {
        submitted.current = null;
        try {
          if (sub.remember) localStorage.setItem(REMEMBER_KEY[variant], sub.email);
          else localStorage.removeItem(REMEMBER_KEY[variant]);
        } catch { /* storage blocked */ }
      }
      void navigate({ to: dashboardPathForRole(profile.role), replace: true });
    }
  }, [loading, profile, navigate, variant]);

  useEffect(() => {
    setSwatch(resolveSwatch());
    const onStorage = (e: StorageEvent) => { if (e.key === "thursd-bg") setSwatch(resolveSwatch()); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY[variant]);
      if (saved) { setEmail(saved); setRemember(true); }
    } catch { /* storage blocked */ }
  }, [variant]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const clean = email.trim();
    submitted.current = { email: clean, remember };
    const { error } = await supabase.auth.signInWithPassword({ email: clean, password });
    if (error) {
      setBusy(false);
      submitted.current = null;
      toast.error(error.message);
      return;
    }
    if (typeof window !== "undefined") sessionStorage.removeItem("thursd_demo_mode");
    // The auth listener + effect above validates the role for this door, then
    // persists "remember me" and redirects once the profile loads.
  }

  async function onForgot() {
    const clean = email.trim();
    if (!clean) { toast.error("Enter your email above first, then tap Forgot password."); return; }
    setResetting(true);
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}${variant === "partner" ? "/partner-login" : "/login"}` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(clean, { redirectTo });
    setResetting(false);
    if (error) toast.error(error.message);
    else toast.success("If that email exists, a reset link is on its way.");
  }

  // Theme-derived colours (change with the admin panel background theme).
  const at = (i: number) => swatch[i] || swatch[i % swatch.length] || "#FE4E5C";
  const accent = at(cfg.accentIdx);
  const button = `linear-gradient(135deg, ${at(cfg.buttonIdx[0])}, ${at(cfg.buttonIdx[1])})`;
  const tintA = at(0), tintB = at(2);

  const field =
    "w-full rounded-xl border border-black/10 bg-white/70 py-3 text-sm text-[#2a1e28] outline-none transition placeholder:text-[#a89ba2] focus:bg-white/90 focus:shadow-[0_0_0_4px_var(--accent-ring)] dark:border-white/15 dark:bg-white/10 dark:text-white dark:placeholder:text-white/40 dark:focus:bg-white/15";

  return (
    <div
      className="fixed inset-0 flex overflow-hidden"
      style={{ ["--accent-ring" as string]: `${accent}33` }}
    >
      {/* ── Left: stock-image hero with themed wash + glass text ───── */}
      <div className="relative hidden w-1/2 overflow-hidden md:block">
        {/* themed gradient fallback (shows if the image fails to load) */}
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${tintA}, ${tintB})` }} />
        <img
          src={cfg.image} alt="" aria-hidden loading="eager"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
        {/* themed colour wash — recolours the photo with the admin theme */}
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${tintA}cc, ${tintB}99)`, mixBlendMode: "multiply" }} />
        {/* legibility scrim */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/5 to-black/65" />
        <div aria-hidden className="login-grain" />

        <div className="relative z-10 flex h-full flex-col justify-between p-10 lg:p-14">
          <div className="[text-shadow:0_1px_18px_rgba(0,0,0,0.35)]">
            <div className="text-[54px] font-black leading-none tracking-tight text-white xl:text-[64px]">
              THURSD<span className="text-white/45">.</span>
            </div>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/90 backdrop-blur">
              {cfg.eyebrow}
            </div>
          </div>

          {/* Glassmorphism text card */}
          <div className="max-w-[420px] rounded-2xl border border-white/25 bg-white/10 p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)] backdrop-blur-md">
            <h2 className="text-2xl font-bold leading-snug text-white xl:text-[28px]">{cfg.heroTitle}</h2>
            <p className="mt-2.5 text-[14px] leading-relaxed text-white/85">{cfg.heroBody}</p>

            <div className="mt-5 flex items-center gap-3">
              <div className="flex -space-x-2.5">
                {cfg.trust.map((m, i) => (
                  <span
                    key={i}
                    className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/70 text-[12px] font-bold text-white shadow"
                    style={{ backgroundImage: `linear-gradient(135deg, ${m.from}, ${m.to})` }}
                  >
                    {m.initials}
                  </span>
                ))}
              </div>
              <div className="leading-tight">
                <div className="text-sm font-bold text-white">{cfg.trustTitle}</div>
                <div className="text-[11px] text-white/70">{cfg.trustSub}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: frosted-glass form panel (theme-aware) ─────────── */}
      <div className="relative flex w-full items-center justify-center overflow-y-auto border-l border-white/40 bg-white/55 p-6 shadow-[-30px_0_80px_-40px_rgba(60,20,50,0.5)] backdrop-blur-2xl sm:p-10 md:w-1/2 dark:border-white/10 dark:bg-[#160f16]/60">
        <div className="relative z-10 w-full max-w-[400px]">
          <div className="login-fade mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/70 bg-white/80 shadow-lg backdrop-blur dark:border-white/10 dark:bg-white/10">
              <BrandLogo size={30} rounded="rounded-lg" fallbackTextClass="text-xl" />
            </div>
            <div>
              <div className="text-lg font-black tracking-tight text-[#241820] md:hidden dark:text-white">
                THURSD<span style={{ color: accent }}>.</span>
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#8a7b83] dark:text-white/55">
                {cfg.badge}
              </div>
            </div>
          </div>

          <div className="login-fade login-d1">
            <h1 className="text-[30px] font-bold tracking-tight text-[#241820] dark:text-white">{cfg.heading}</h1>
            <p className="mt-1.5 text-sm text-[#6b5b64] dark:text-white/65">{cfg.sub}</p>
          </div>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {/* Email */}
            <div className="login-fade login-d2">
              <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-[#6b5b64] dark:text-white/65">Email address</label>
              <div className="relative">
                <Mail aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a89ba2]" />
                <input
                  id="email" type="email" required autoComplete="email"
                  placeholder="you@company.com"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className={`${field} pl-10 pr-3.5`}
                  onFocus={(e) => (e.currentTarget.style.borderColor = accent)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "")}
                />
              </div>
            </div>

            {/* Password with show/hide toggle */}
            <div className="login-fade login-d3">
              <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-[#6b5b64] dark:text-white/65">Password</label>
              <div className="relative">
                <Lock aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a89ba2]" />
                <input
                  id="password" type={showPw ? "text" : "password"} required autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className={`${field} pl-10 pr-11`}
                  onFocus={(e) => (e.currentTarget.style.borderColor = accent)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "")}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  title={showPw ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[#a89ba2] transition hover:bg-black/5 hover:text-[#2a1e28] dark:hover:bg-white/10 dark:hover:text-white"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Remember + forgot */}
            <div className="login-fade login-d3 flex items-center justify-between text-sm">
              <label className="flex cursor-pointer select-none items-center gap-2 text-[#6b5b64] dark:text-white/65">
                <input
                  type="checkbox" checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-black/20"
                  style={{ accentColor: accent }}
                />
                Remember me
              </label>
              <button
                type="button" onClick={onForgot} disabled={resetting}
                className="font-medium transition hover:underline disabled:opacity-60"
                style={{ color: accent }}
              >
                {resetting ? "Sending…" : "Forgot password?"}
              </button>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="login-fade login-d4 login-shimmer group flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-70"
              style={{ backgroundImage: button, boxShadow: `0 14px 30px -8px ${accent}77` }}
            >
              {busy ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</>
              ) : (
                <>Sign in <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
              )}
            </button>
          </form>

          <div className="login-fade login-d4 mt-7 border-t border-black/10 pt-5 text-center text-sm text-[#6b5b64] dark:border-white/10 dark:text-white/65">
            {cfg.crossText}{" "}
            <Link to={cfg.crossTo} className="font-semibold hover:underline" style={{ color: accent }}>
              {cfg.crossCta} <ArrowRight className="inline h-3.5 w-3.5" />
            </Link>
          </div>

          <p className="mt-5 text-center text-[11px] text-[#a89ba2] dark:text-white/40">
            Protected workspace · Thursd Operations Cloud
          </p>
        </div>
      </div>
    </div>
  );
}
