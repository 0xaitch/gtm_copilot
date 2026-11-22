import type { ReactNode, SVGProps } from "react";
import type { Tone } from "./types";

/* ---------------- tones ---------------- */

const TONE: Record<Tone, string> = {
  good: "bg-accent/10 text-accent ring-accent/25",
  warn: "bg-amber-400/10 text-amber-300 ring-amber-400/25",
  bad: "bg-rose-400/10 text-rose-300 ring-rose-400/25",
  muted: "bg-white/5 text-muted ring-white/10",
  info: "bg-sky-400/10 text-sky-300 ring-sky-400/25",
};

export function Badge({ tone = "muted", children, title, className = "" }: { tone?: Tone; children: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** Small outlined chip (segments, metrics, tags). */
export function Chip({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md border border-line-2 px-2 py-0.5 text-xs text-muted ${mono ? "font-mono" : ""}`}>
      {children}
    </span>
  );
}

/** FACT (sourced) / INFERENCE (reasoning) label. */
export function KindTag({ kind }: { kind: "fact" | "inference" }) {
  return kind === "fact"
    ? <span className="inline-flex w-24 shrink-0 justify-center rounded-md bg-accent/10 py-1 font-mono text-[11px] font-semibold tracking-wider text-accent">FACT</span>
    : <span className="inline-flex w-24 shrink-0 justify-center rounded-md bg-violet-400/10 py-1 font-mono text-[11px] font-semibold tracking-wider text-violet-300">INFERENCE</span>;
}

export const PRIORITY_TONE = { A: "good", B: "warn", C: "muted" } as const;
export const PRIORITY_LABEL = { A: "Hot lead", B: "Warm lead", C: "Long shot" } as const;

/** 1–10 score → accent (strong), amber (worth a look), grey (weak). */
export const scoreColor = (n: number) => (n >= 7 ? "text-accent" : n >= 5 ? "text-amber-300" : "text-faint");
const barColor = (n: number) => (n >= 7 ? "bg-accent" : n >= 5 ? "bg-amber-300" : "bg-faint");

export function Bar({ value, max = 10, color }: { value: number; max?: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
      <div className={`h-full rounded-full ${color ?? barColor(value)}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Circular score out of 10. */
export function ScoreRing({ score, size = 96 }: { score: number; size?: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const stroke = score >= 7 ? "stroke-accent" : score >= 5 ? "stroke-amber-300" : "stroke-faint";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`score ${score} of 10`}>
      <circle cx="50" cy="50" r={r} className="fill-none stroke-white/8" strokeWidth="9" />
      <circle cx="50" cy="50" r={r} className={`fill-none ${stroke}`} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - score / 10)} transform="rotate(-90 50 50)" />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="fill-ink text-[28px] font-semibold">{score}</text>
    </svg>
  );
}

/* ---------------- layout ---------------- */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-panel/90 backdrop-blur ${className}`}>{children}</section>;
}

/** Card header: icon tile, title, optional right-side note. */
export function CardHead({ icon, title, note, tone = "accent" }: { icon: ReactNode; title: ReactNode; note?: ReactNode; tone?: "accent" | "amber" | "sky" | "violet" }) {
  const tile = { accent: "bg-accent/10 text-accent", amber: "bg-amber-400/10 text-amber-300", sky: "bg-sky-400/10 text-sky-300", violet: "bg-violet-400/10 text-violet-300" }[tone];
  return (
    <div className="flex items-center gap-3">
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tile}`}>{icon}</span>
      <h3 className="shrink-0 whitespace-nowrap font-semibold">{title}</h3>
      {note && <span className="ml-auto min-w-0 truncate text-right text-sm text-faint" title={typeof note === "string" ? note : undefined}>{note}</span>}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-faint">{children}</h4>;
}

export function ExtLink({ href, children, className = "", title }: { href: string; children: ReactNode; className?: string; title?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" title={title} className={`text-ink/90 underline decoration-white/20 underline-offset-4 hover:text-accent hover:decoration-accent/60 ${className}`}>
      {children}
    </a>
  );
}

/** Square icon link (X, Telegram, GitHub…). */
export function IconLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={label} title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line-2 text-muted hover:border-accent/50 hover:text-accent">
      {children}
    </a>
  );
}

export function Button({ children, variant = "ghost", className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  const v = variant === "primary"
    ? "bg-accent text-accent-ink font-semibold shadow-[0_0_24px_-4px_rgb(195_242_61/0.5)] hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
    : "border border-line-2 text-ink/90 hover:border-white/25 hover:bg-white/5 disabled:opacity-40";
  return <button {...rest} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm transition ${v} ${className}`}>{children}</button>;
}

/** Initials avatar, colour picked from the name so it's stable. */
export function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const initials = name.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  const palettes = ["bg-sky-500/15 text-sky-300", "bg-amber-500/15 text-amber-300", "bg-violet-500/15 text-violet-300", "bg-emerald-500/15 text-emerald-300", "bg-rose-500/15 text-rose-300"];
  const pick = palettes[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % palettes.length];
  const dims = size === "lg" ? "h-16 w-16 rounded-2xl text-2xl" : "h-10 w-10 rounded-full text-sm";
  return <span className={`inline-flex shrink-0 items-center justify-center font-semibold ${dims} ${pick}`}>{initials}</span>;
}

export const xUrl = (handle: string) => `https://x.com/${handle.replace(/^@/, "")}`;

/* ---------------- icons (inline, stroke = currentColor) ---------------- */

const base = (p: SVGProps<SVGSVGElement>) => ({ width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p });
export const Icon = {
  shield: (p: SVGProps<SVGSVGElement> = {}) => <svg {...base(p)}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /></svg>,
  shieldCheck: (p: SVGProps<SVGSVGElement> = {}) => <svg {...base(p)}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>,
  bolt: (p: SVGProps<SVGSVGElement> = {}) => <svg {...base(p)}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>,
  user: (p: SVGProps<SVGSVGElement> = {}) => <svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>,
  users: (p: SVGProps<SVGSVGElement> = {}) => <svg {...base(p)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5" /><path d="M16 4.5a3.5 3.5 0 010 7M18 15c2 .7 3.2 2.3 3.5 5" /></svg>,
  send: (p: SVGProps<SVGSVGElement> = {}) => <svg {...base(p)}><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>,
  search: (p: SVGProps<SVGSVGElement> = {}) => <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>,
  refresh: (p: SVGProps<SVGSVGElement> = {}) => <svg {...base(p)}><path d="M21 12a9 9 0 11-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>,
  download: (p: SVGProps<SVGSVGElement> = {}) => <svg {...base(p)}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>,
  arrow: (p: SVGProps<SVGSVGElement> = {}) => <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  lines: (p: SVGProps<SVGSVGElement> = {}) => <svg {...base(p)}><path d="M4 6h16M4 12h10M4 18h6" /></svg>,
  check: (p: SVGProps<SVGSVGElement> = {}) => <svg {...base(p)}><path d="M5 12.5l4.5 4.5L19 7" /></svg>,
  copy: (p: SVGProps<SVGSVGElement> = {}) => <svg {...base(p)}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></svg>,
  doc: (p: SVGProps<SVGSVGElement> = {}) => <svg {...base(p)}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>,
  x: (p: SVGProps<SVGSVGElement> = {}) => <svg {...base({ ...p, fill: "currentColor", stroke: "none" })}><path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.3L1.8 3h6.4l4.4 5.9L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z" /></svg>,
  telegram: (p: SVGProps<SVGSVGElement> = {}) => <svg {...base(p)}><path d="M21.5 4.5L2.5 11.8l6.3 2.2 2.4 6.5 3.4-4.4 5 3.7 1.9-15.3z" /><path d="M8.8 14l9.2-6.8" /></svg>,
  github: (p: SVGProps<SVGSVGElement> = {}) => <svg {...base(p)}><path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 00-1.3-3.2 4.2 4.2 0 00-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 00-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 00-.1 3.2A4.6 4.6 0 004 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" /></svg>,
  globe: (p: SVGProps<SVGSVGElement> = {}) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></svg>,
};
