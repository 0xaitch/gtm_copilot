/**
 * Optional hints from the user: team X handles and links they spotted while researching
 * (e.g. on the project's X profile). Handles are checked like any other lead; URLs are read
 * through the same SSRF-guarded fetcher as everything else.
 */
import { isLocalTarget } from "@/lib/connectors/web";
import type { AnalysisContext } from "./types";

export const MAX_HINT_HANDLES = 10;
export const MAX_HINT_URLS = 5;
const X_PROFILE = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?(?:\?.*)?$/i;
const RESERVED = new Set(["home", "intent", "share", "search", "i", "explore", "hashtag"]);

/** Common and crypto-popular TLDs. A dotted word ending in anything else isn't read as a link. */
const KNOWN_TLDS = new Set((
  "com org net io xyz fi finance co ai app dev gg so me tech network money exchange foundation capital " +
  "fund ventures labs world global club live site online info biz pro cc to sh ly gl im is it la vc " +
  "trade markets cash credit bank inc ltd group systems solutions digital cloud tools build " +
  "us uk de fr es nl ch se no dk fi pl pt be at ie ca au nz jp kr cn hk sg in ae il br mx ar za tr ru ua eu asia"
).split(" "));
function isBareDomain(token: string): boolean {
  const m = token.match(/^([a-z0-9-]+(?:\.[a-z0-9-]+)+)(\/\S*)?$/i);
  if (!m) return false;
  const labels = m[1].toLowerCase().split(".");
  return KNOWN_TLDS.has(labels[labels.length - 1]);
}

export function parseHints(text?: string): AnalysisContext["hints"] {
  const handles = new Set<string>();
  const urls = new Set<string>();
  for (const raw of (text ?? "").split(/[\s,;]+/).filter(Boolean)) {
    const token = raw.replace(/[)\].]+$/, "");
    const at = token.match(/^@([A-Za-z0-9_]{1,15})$/);
    const prof = token.match(X_PROFILE);
    if (at || prof) {
      const h = (at ?? prof)![1];
      if (!RESERVED.has(h.toLowerCase())) handles.add(h);
      continue;
    }
    // URLs (with or without scheme). Bare words are ignored: "jane" could be anything, and so is
    // "jane.doe", "node.js" or "e.g" — a scheme-less link needs a known top-level domain.
    if (!/^https?:\/\//i.test(token) && !isBareDomain(token)) continue;
    try {
      const u = new URL(/^https?:\/\//i.test(token) ? token : `https://${token}`);
      if (/(^|\.)(x|twitter)\.com$/i.test(u.hostname)) continue; // posts/lists on X can't be read
      if (isLocalTarget(u.toString())) continue;
      urls.add(u.toString());
    } catch { /* not a URL */ }
  }
  return { handles: [...handles].slice(0, MAX_HINT_HANDLES), urls: [...urls].slice(0, MAX_HINT_URLS) };
}
