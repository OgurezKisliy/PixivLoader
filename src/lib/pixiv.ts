import type { ParsedLink, TaskKind } from "../types";

export function sanitizeFolder(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\r\n\t]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "без_тега";
}

/** Распознаёт поддерживаемые ссылки Pixiv и извлекает тег / автора / пост. */
export function parsePixivUrl(raw: string): ParsedLink | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (!/(^|\.)pixiv\.net$/i.test(url.hostname)) return null;

  const path = url.pathname.replace(/\/+$/, "");
  const seg = path.split("/").filter(Boolean); // убираем ведущий /en/ и т.п.
  const clean = seg[0] === "en" || seg[0] === "ja" ? seg.slice(1) : seg;

  // /tags/{tag}/artworks
  if (clean[0] === "tags" && clean[1]) {
    const tag = decodeURIComponent(clean[1]);
    return { kind: "tag", label: `#${tag}`, folder: sanitizeFolder(tag), key: `tag:${tag}` };
  }

  // /search?q=...
  if (clean[0] === "search") {
    const q = url.searchParams.get("q");
    if (!q) return null;
    return { kind: "tag", label: `#${q}`, folder: sanitizeFolder(q), key: `tag:${q}` };
  }

  // /users/{id}[/illustrations]
  if (clean[0] === "users" && /^\d+$/.test(clean[1] || "")) {
    const id = clean[1];
    const illus = clean[2] === "illustrations" || clean[2] === "artworks";
    const kind: TaskKind = illus ? "user_illustrations" : "user";
    return {
      kind,
      label: `Автор ${id} · иллюстрации`,
      folder: `user_${id}`,
      key: `user:${id}`,
    };
  }

  // /artworks/{id}
  if (clean[0] === "artworks" && /^\d+$/.test(clean[1] || "")) {
    const id = clean[1];
    return { kind: "illust", label: `Пост ${id}`, folder: `illust_${id}`, key: `illust:${id}` };
  }

  // member_illust.php?mode=medium&illust_id=...
  if (clean[0] === "member_illust.php") {
    const id = url.searchParams.get("illust_id");
    if (id && /^\d+$/.test(id)) {
      return { kind: "illust", label: `Пост ${id}`, folder: `illust_${id}`, key: `illust:${id}` };
    }
  }

  return null;
}

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    return u.toString();
  } catch {
    return raw.trim();
  }
}
