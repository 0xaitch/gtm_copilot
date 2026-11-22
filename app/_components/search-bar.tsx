"use client";

import type { RefObject } from "react";
import { Icon } from "./ui";

/** The search box: large on the landing hero, compact in the top bar. */
export function SearchBar({ value, onChange, onSubmit, loading, size, inputRef, hints }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  size: "lg" | "sm";
  inputRef?: RefObject<HTMLInputElement | null>;
  hints?: { active: boolean; open: boolean; toggle: () => void };
}) {
  const lg = size === "lg";
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className={lg ? "flex flex-col gap-3 rounded-[1.4rem] border border-line bg-panel/80 p-3 shadow-[0_0_60px_-20px_rgb(195_242_61/0.25)] sm:flex-row" : "flex w-full gap-2"}
    >
      <label className={`group relative flex flex-1 items-center rounded-xl border bg-bg/70 transition focus-within:border-accent/60 ${lg ? "border-accent/25 px-4 py-3.5" : "border-line-2 px-3 py-2"}`}>
        <Icon.search width={lg ? 22 : 16} height={lg ? 22 : 16} className="shrink-0 text-muted" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Project website or @xhandle"
          aria-label="Project website or X handle"
          className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint ${lg ? "ml-3 text-xl" : "ml-2.5 font-mono text-sm"}`}
        />
        <kbd className="ml-2 rounded-md border border-line-2 px-1.5 text-xs text-faint">/</kbd>
      </label>
      {hints && (
        <button type="button" onClick={hints.toggle} aria-expanded={hints.open}
          className={`inline-flex items-center justify-center gap-2 rounded-xl border px-5 ${lg ? "py-3.5 text-lg" : "py-2 text-sm"} ${hints.open || hints.active ? "border-accent/40 text-accent" : "border-line-2 text-ink/90 hover:border-white/25"}`}>
          <Icon.lines width={18} height={18} /> Hints{hints.active ? " •" : ""}
        </button>
      )}
      <button
        disabled={loading || !value.trim()}
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-40 ${lg
          ? "px-8 py-3.5 text-xl shadow-[0_0_32px_-6px_rgb(195_242_61/0.6)]"
          : "px-4 py-2 text-sm"}`}
      >
        {loading ? "Researching…" : <>Analyze <Icon.arrow width={lg ? 22 : 16} height={lg ? 22 : 16} /></>}
      </button>
    </form>
  );
}
