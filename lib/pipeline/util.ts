let counter = 0;
export const newId = (prefix: string) => `${prefix}_${(++counter).toString(36)}_${Date.now().toString(36)}`;

/** Short quote around a regex match, for evidence. */
export function snippet(text: string, index: number, len: number, pad = 90): string {
  const start = Math.max(0, index - pad);
  const end = Math.min(text.length, index + len + pad);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";
const DATE_RE = new RegExp(`\\b(${MONTHS})[a-z]*\\.?\\s+(\\d{1,2})?,?\\s*(20\\d{2})\\b`, "i");

/** Best-effort date near a match ("Mar 12, 2026", "March 2026"). */
export function dateNear(text: string, index: number, window = 160): string | undefined {
  const slice = text.slice(Math.max(0, index - window), index + window);
  const m = slice.match(DATE_RE);
  if (!m) return undefined;
  const d = new Date(`${m[1]} ${m[2] ?? "1"} ${m[3]}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function parseUsdAmount(s: string): number | undefined {
  const m = s.match(/\$?\s?(\d+(?:\.\d+)?)\s?(k|m|mm|million|b|billion)\b/i);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === "k") return n * 1e3;
  if (unit.startsWith("b")) return n * 1e9;
  return n * 1e6;
}

/** Page titles that say nothing about the project ("App", "Home", "Dashboard"…). */
const GENERIC_NAMES = /^(app|home|homepage|dashboard|launch app|welcome|docs|documentation|swap|bridge|trade|earn|stake|portal|index|loading|untitled|web3|defi|crypto|official site|website)$/i;
export const isGenericName = (s?: string) => !s || s.trim().length < 3 || GENERIC_NAMES.test(s.trim());

const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "ac", "edu"]);
/** "app.ethena.fi" → "ethena", "www.example.co.uk" → "example". */
export function brandFromDomain(domain?: string): string | undefined {
  if (!domain) return undefined;
  const parts = domain.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length < 2) return undefined;
  const idx = parts.length >= 3 && SECOND_LEVEL.has(parts[parts.length - 2]) ? parts.length - 3 : parts.length - 2;
  return parts[idx];
}

export const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "app.ethena.fi" → "ethena.fi", "www.example.co.uk" → "example.co.uk". */
export function rootDomain(domain?: string): string | undefined {
  if (!domain) return undefined;
  const parts = domain.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length < 2) return undefined;
  const n = parts.length >= 3 && SECOND_LEVEL.has(parts[parts.length - 2]) ? 3 : 2;
  return parts.slice(-n).join(".");
}
