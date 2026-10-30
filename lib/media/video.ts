// Video links people paste into a post. Only YouTube, Facebook and Instagram
// are accepted, and the player address is always built here from the parsed
// id, never from text the user typed, so nothing else can be framed.

export type VideoProvider = "youtube" | "facebook" | "instagram";

export type ParsedVideo = {
  provider: VideoProvider;
  /** YouTube video id, Instagram post code, or the canonical Facebook URL. */
  ref: string;
  /** Tidy link to open the video on its own site. */
  url: string;
};

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const IG_CODE = /^[A-Za-z0-9_-]{5,40}$/;

function parseUrl(input: string): URL | null {
  const text = input.trim();
  if (!text || text.length > 1000) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

const host = (u: URL) => u.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.|web\.)/, "");

/** Recognise a YouTube, Facebook or Instagram video link; null for anything else. */
export function parseVideoLink(input: string): ParsedVideo | null {
  const u = parseUrl(input);
  if (!u) return null;
  const h = host(u);
  const parts = u.pathname.split("/").filter(Boolean);

  if (h === "youtu.be") {
    const id = parts[0];
    return id && YT_ID.test(id) ? youtube(id) : null;
  }
  if (h === "youtube.com" || h === "music.youtube.com" || h === "youtube-nocookie.com") {
    let id: string | null = null;
    if (parts[0] === "watch") id = u.searchParams.get("v");
    else if (["shorts", "embed", "live", "v"].includes(parts[0])) id = parts[1] ?? null;
    return id && YT_ID.test(id) ? youtube(id) : null;
  }

  if (h === "instagram.com") {
    const i = parts.findIndex((p) => p === "p" || p === "reel" || p === "reels" || p === "tv");
    const code = i >= 0 ? parts[i + 1] : null;
    if (!code || !IG_CODE.test(code)) return null;
    const kind = parts[i] === "reels" ? "reel" : parts[i];
    return { provider: "instagram", ref: `${kind}/${code}`, url: `https://www.instagram.com/${kind}/${code}/` };
  }

  if (h === "fb.watch" || h === "facebook.com") {
    const isVideo =
      h === "fb.watch" ||
      parts.includes("videos") ||
      parts[0] === "watch" ||
      parts[0] === "reel" ||
      (parts[0] === "share" && (parts[1] === "v" || parts[1] === "r")) ||
      u.pathname === "/video.php";
    if (!isVideo) return null;
    // Keep only what identifies the video; drop tracking parameters.
    const keep = new URLSearchParams();
    const v = u.searchParams.get("v");
    if (v && /^\d{5,25}$/.test(v)) keep.set("v", v);
    const path = u.pathname.replace(/\/+$/, "");
    if (!/^[A-Za-z0-9._\-/]*$/.test(path)) return null;
    const base = h === "fb.watch" ? "https://fb.watch" : "https://www.facebook.com";
    const url = `${base}${path}${keep.toString() ? `?${keep}` : ""}`;
    return { provider: "facebook", ref: url, url };
  }
  return null;
}

function youtube(id: string): ParsedVideo {
  return { provider: "youtube", ref: id, url: `https://www.youtube.com/watch?v=${id}` };
}

/** The player to frame. YouTube uses its no-cookie domain. */
export function embedUrl(provider: VideoProvider, ref: string): string | null {
  switch (provider) {
    case "youtube":
      return YT_ID.test(ref) ? `https://www.youtube-nocookie.com/embed/${ref}?autoplay=1&rel=0` : null;
    case "instagram":
      return /^(p|reel|tv)\/[A-Za-z0-9_-]{5,40}$/.test(ref) ? `https://www.instagram.com/${ref}/embed/` : null;
    case "facebook": {
      const parsed = parseVideoLink(ref);
      return parsed?.provider === "facebook"
        ? `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(parsed.url)}&show_text=false&autoplay=true`
        : null;
    }
  }
}

/** Still image shown before the video is played (YouTube only). */
export function posterUrl(provider: VideoProvider, ref: string): string | null {
  return provider === "youtube" && YT_ID.test(ref) ? `https://i.ytimg.com/vi/${ref}/hqdefault.jpg` : null;
}

export const PROVIDER_NAME: Record<VideoProvider, string> = { youtube: "YouTube", facebook: "Facebook", instagram: "Instagram" };
