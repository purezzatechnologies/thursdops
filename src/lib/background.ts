// Per-user background gradient theme. Sets --bg-1..4 CSS variables (used by the
// body gradient in styles.css) and persists the choice in localStorage.

export interface BgPreset {
  id: string;
  name: string;
  swatch: string[];         // hex colours for the preview swatch
  colors: string[] | null;  // rgba orb colours, or null to use the CSS defaults
}

const A = 0.22; // alpha applied to custom colours

export const BG_PRESETS: BgPreset[] = [
  { id: "default", name: "Thursd",  swatch: ["#FE4E5C", "#FFBA8A", "#FF96B9", "#8CC8A0"], colors: null },
  { id: "ocean",   name: "Ocean",   swatch: ["#38BDF8", "#3B82F6", "#2DD4BF", "#818CF8"], colors: ["rgba(56,189,248,0.22)", "rgba(59,130,246,0.20)", "rgba(45,212,191,0.20)", "rgba(129,140,248,0.18)"] },
  { id: "sunset",  name: "Sunset",  swatch: ["#FB923C", "#F43F5E", "#D946EF", "#FACC15"], colors: ["rgba(251,146,60,0.24)", "rgba(244,63,94,0.20)", "rgba(217,70,239,0.18)", "rgba(250,204,21,0.18)"] },
  { id: "forest",  name: "Forest",  swatch: ["#22C55E", "#84CC16", "#14B8A6", "#A3E635"], colors: ["rgba(34,197,94,0.22)", "rgba(132,204,22,0.18)", "rgba(20,184,166,0.18)", "rgba(163,230,53,0.16)"] },
  { id: "aurora",  name: "Aurora",  swatch: ["#6366F1", "#A855F7", "#EC4899", "#2DD4BF"], colors: ["rgba(99,102,241,0.24)", "rgba(168,85,247,0.20)", "rgba(236,72,153,0.18)", "rgba(45,212,191,0.18)"] },
  { id: "minimal", name: "Minimal", swatch: ["#B8C0CC", "#B8C0CC", "#B8C0CC", "#B8C0CC"], colors: ["rgba(148,163,184,0.10)", "rgba(148,163,184,0.08)", "rgba(148,163,184,0.08)", "rgba(148,163,184,0.06)"] },
];

const KEY = "thursd-bg";
export type BgConfig = { preset: string } | { custom: string[] };

export function hexToRgba(hex: string, a = A): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${a})`;
}

function setVars(colors: string[] | null) {
  const root = document.documentElement;
  if (!colors) {
    for (let i = 1; i <= 4; i++) root.style.removeProperty(`--bg-${i}`);
    return;
  }
  colors.slice(0, 4).forEach((c, i) => root.style.setProperty(`--bg-${i + 1}`, c));
}

export function applyBackground(cfg: BgConfig | null) {
  if (typeof document === "undefined") return;
  if (!cfg || ("preset" in cfg && cfg.preset === "default")) { setVars(null); return; }
  if ("custom" in cfg) { setVars(cfg.custom.map((h) => hexToRgba(h))); return; }
  const p = BG_PRESETS.find((x) => x.id === cfg.preset);
  setVars(p?.colors ?? null);
}

export function getStoredBackground(): BgConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(KEY);
    return v ? (JSON.parse(v) as BgConfig) : null;
  } catch {
    return null;
  }
}

export function saveBackground(cfg: BgConfig) {
  localStorage.setItem(KEY, JSON.stringify(cfg));
  applyBackground(cfg);
}

export function resetBackground() {
  localStorage.removeItem(KEY);
  applyBackground(null);
}

export function applyStoredBackground() {
  applyBackground(getStoredBackground());
}

// NOTE: intentionally not applied at module load. Mutating <html> before React
// hydrates causes a hydration mismatch, so the saved background is applied from
// a useEffect in __root.tsx (after hydration) instead.
