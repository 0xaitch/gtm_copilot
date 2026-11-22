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

/**
 * Pages that list partners, customers or integrations. Their text is about other companies
 * ("we're excited to partner with X", "Jane Doe, CEO of OtherCo") or evergreen — not this
 * project's news or team.
 */
const EVERGREEN_PAGE = /\/(?:partners?|partner-program|partnerships|integrations?|ecosystem|customers?|case-stud(?:y|ies)|testimonials?|clients?|showcase)(?:[/?#.-]|$)/i;
export function isEvergreenPage(url?: string): boolean {
  if (!url) return false;
  try { return EVERGREEN_PAGE.test(new URL(url).pathname); } catch { return false; }
}

export const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
/** "SOC 2, HIPAA, ISO 27001 Compliance" — a tagline, not a name. */
const looksLikeTagline = (s: string) => s.length > 40 || s.split(/\s+/).length > 4 || /,/.test(s);

/**
 * The project's display name. Prefers the site's declared name (og:site_name), then the title part
 * matching the domain brand ("Home | Vanta" → "Vanta"), then a short first title part, then the brand.
 */
export function pickProjectName(title: string | undefined, siteName: string | undefined, domain: string | undefined): string | undefined {
  const brand = brandFromDomain(domain);
  if (siteName && !isGenericName(siteName) && !looksLikeTagline(siteName)) return siteName;
  const parts = (title ?? "").split(/\s+[|\-–—:·•]\s+/).map((p) => p.trim()).filter(Boolean);
  if (brand) {
    const match = parts.find((p) => squash(p) === squash(brand) || (squash(p).includes(squash(brand)) && !looksLikeTagline(p)));
    if (match) return match;
  }
  const first = parts[0];
  if (first && !isGenericName(first) && !looksLikeTagline(first)) return first;
  return brand ? titleCase(brand) : first;
}

/** "app.ethena.fi" → "ethena.fi", "www.example.co.uk" → "example.co.uk". */
export function rootDomain(domain?: string): string | undefined {
  if (!domain) return undefined;
  const parts = domain.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length < 2) return undefined;
  const n = parts.length >= 3 && SECOND_LEVEL.has(parts[parts.length - 2]) ? 3 : 2;
  return parts.slice(-n).join(".");
}
