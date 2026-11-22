import type { ReactNode } from "react";
import type { Tone } from "./types";

const TONE: Record<Tone, string> = {
  good: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/20",
  warn: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/20",
  bad: "bg-rose-50 text-rose-800 ring-rose-600/20 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-400/20",
  muted: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-400/20",
  info: "bg-sky-50 text-sky-800 ring-sky-600/20 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-400/20",
};

export function Badge({ tone = "muted", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONE[tone]}`}>
      {children}
    </span>
  );
}

/** Score 1–10 as a compact chip; colour carries the band, the number carries the value. */
export function ScoreChip({ score, size = "md" }: { score: number; size?: "md" | "lg" }) {
  const band = score >= 8 ? "bg-emerald-600" : score >= 6 ? "bg-amber-500" : score >= 5 ? "bg-amber-400 text-amber-950" : "bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200";
  const dims = size === "lg" ? "h-10 w-10 text-lg" : "h-7 w-7 text-sm";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-md font-semibold tabular-nums text-white ${band} ${dims}`} aria-label={`score ${score} of 10`}>
      {score}
    </span>
  );
}

export const PRIORITY_TONE = { A: "good", B: "warn", C: "muted" } as const;

export function Label({ children }: { children: ReactNode }) {
  return <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{children}</h4>;
}

export function ExtLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`text-sky-700 hover:underline dark:text-sky-400 ${className}`}>
      {children}
    </a>
  );
}

export const xUrl = (handle: string) => `https://x.com/${handle.replace(/^@/, "")}`;

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>{children}</section>;
}
