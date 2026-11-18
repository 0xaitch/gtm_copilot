/**
 * Classify a person's role and their affiliation with a project from public bio text.
 * Deterministic + explainable: every classification carries the phrase that triggered it.
 */

const ROLE_PATTERNS: [RegExp, string][] = [
  [/\bco-?founder\s*(?:&|and|\/|,)\s*CTO\b|\bCTO\s*(?:&|and|\/|,)\s*co-?founder\b/i, "Co-founder & CTO"],
  [/\bco-?founder\s*(?:&|and|\/|,)\s*CEO\b|\bCEO\s*(?:&|and|\/|,)\s*co-?founder\b/i, "Co-founder & CEO"],
  [/\b(CISO|chief information security officer)\b/i, "CISO"],
  [/\b(CTO|chief technology officer)\b/i, "CTO"],
  [/\b(CEO|chief executive officer)\b/i, "CEO"],
  [/\b(COO|chief operating officer)\b/i, "COO"],
  [/\b(CFO|chief financial officer)\b/i, "CFO"],
  [/\b(chief compliance officer|CCO)\b/i, "Chief Compliance Officer"],
  [/\bhead of (security|protocol|engineering|smart contracts?|research|product|technology|bd|business development|growth|operations|legal|compliance|tokenomics)\b/i, "Head of $1"],
  [/\b(VP|vice president),? (of )?(engineering|security|product|bd|business development|growth|operations)\b/i, "VP $3"],
  [/\b(lead|principal|senior|sr\.?) (smart contract|solidity|protocol|security|blockchain) (engineer|developer|dev|researcher)\b/i, "$2 Lead"],
  [/\b(smart contract|solidity|protocol|security|blockchain|rust) (engineer|developer|dev|researcher)\b/i, "$1 Engineer"],
  [/\bco-?founder\b|\bfounder\b/i, "Co-founder"],
  [/\b(core contributor|contributor)\b/i, "Core Contributor"],
  [/\b(business development|BD lead|BD)\b/i, "BD"],
  [/\b(advisor|adviser)\b/i, "Advisor"],
];

export interface RoleHit { role: string; phrase: string }

export function roleFromBio(bio?: string | null): RoleHit | null {
  if (!bio) return null;
  for (const [re, label] of ROLE_PATTERNS) {
    const m = bio.match(re);
    if (m) {
      const role = label.replace(/\$(\d)/g, (_, i: string) => cap(m[Number(i)] ?? ""));
      return { role: role.trim(), phrase: m[0] };
    }
  }
  return null;
}
const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bBd\b/, "BD");

/** Does the bio point at this project (@handle, name, or domain)? */
export function bioMentionsProject(bio: string | null | undefined, p: { handle?: string; name?: string; domain?: string }): string | null {
  if (!bio) return null;
  if (p.handle && new RegExp(`@${p.handle}\\b`, "i").test(bio)) return `@${p.handle}`;
  if (p.domain && bio.toLowerCase().includes(p.domain.toLowerCase())) return p.domain;
  if (p.name && p.name.length >= 3) {
    const esc = p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = bio.match(new RegExp(`(?:@|at |\\b)${esc}\\b`, "i"));
    if (m) return m[0].trim();
  }
  return null;
}

/** Former roles shouldn't count ("ex-CTO @foo", "prev. founder"). */
export const isFormer = (bio: string, phrase: string) =>
  new RegExp(`\\b(ex[- ]?|former|prev(iously|\\.)?|past)\\s*${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(bio);
