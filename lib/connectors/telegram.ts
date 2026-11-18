/**
 * Telegram public channel web preview (t.me/s/<channel>) — free, no key.
 * Only works for public *channels* (announcements); group chats redirect and return nothing.
 */
import { htmlToText } from "@/lib/connectors/web";
import type { DatedPost } from "@/lib/signals/posts";

export function parseTelegramChannel(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/^https?:\/\/(?:t\.me|telegram\.me)\/(?:s\/)?([A-Za-z0-9_]{5,32})\/?$/i);
  return m && !["joinchat", "addstickers", "share"].includes(m[1].toLowerCase()) ? m[1] : null;
}

/** Split the preview page into message blocks; each has data-post, text and <time datetime>. */
export function parseTelegramHtml(html: string): DatedPost[] {
  const posts: DatedPost[] = [];
  for (const block of html.split(/(?=<div class="tgme_widget_message_wrap)/).filter((b) => b.startsWith(`<div class="tgme_widget_message_wrap`))) {
    const id = block.match(/data-post="([^"]+)"/)?.[1];
    const at = block.match(/<time[^>]*datetime="([^"]+)"/)?.[1];
    const body = block.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    if (!id || !at || !body) continue;
    const text = htmlToText(body.replace(/<br\s*\/?>/gi, "\n"));
    if (text) posts.push({ text, at: new Date(at).toISOString(), url: `https://t.me/${id}`, origin: "telegram" });
  }
  return posts;
}

export async function telegramPosts(channel: string, limit = 20): Promise<DatedPost[]> {
  try {
    const res = await fetch(`https://t.me/s/${channel}`, {
      redirect: "manual", // groups/private redirect away → treat as no channel
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": "Mozilla/5.0" },
    });
    if (res.status !== 200) return [];
    const html = await res.text();
    return parseTelegramHtml(html).slice(-limit).reverse(); // newest first
  } catch {
    return [];
  }
}
