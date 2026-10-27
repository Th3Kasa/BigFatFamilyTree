import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDisplayName } from "@/lib/utils";

/**
 * Client-side family directory used by the top-bar search, the mobile people
 * sheet and the Add menu's person picker. Loaded lazily (on first focus/open)
 * with the signed-in user's session, so RLS applies exactly as on the server.
 * Results are cached briefly so opening search twice doesn't refetch.
 */

export type DirectoryPerson = {
  id: string;
  slug: string | null;
  given_en: string | null;
  given_ar: string | null;
  family_name_en: string | null;
  family_name_ar: string | null;
  photo_url: string | null;
  gender: "m" | "f" | "unknown" | null;
  birth_date: string | null;
  death_date: string | null;
};

export type DirectoryStory = {
  id: string;
  person_id: string;
  type: string;
  location: string | null;
  story_en: string | null;
  story_ar: string | null;
};

export type Directory = {
  people: DirectoryPerson[];
  stories: DirectoryStory[];
};

const STALE_MS = 30_000;
let cache: { at: number; promise: Promise<Directory> } | null = null;

async function fetchDirectory(): Promise<Directory> {
  const supabase = createClient();
  const [peopleRes, eventsRes] = await Promise.all([
    supabase
      .from("people")
      .select(
        "id, slug, given_en, given_ar, family_name_en, family_name_ar, photo_url, gender, birth_date, death_date, is_placeholder",
      )
      .is("deleted_at", null)
      .order("given_en"),
    supabase
      .from("events")
      .select("id, person_id, type, location, story_en, story_ar")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  const people: DirectoryPerson[] = ((peopleRes.data ?? []) as (DirectoryPerson & { is_placeholder?: boolean })[])
    .filter((p) => !p.is_placeholder);
  const stories = (eventsRes.data ?? []) as DirectoryStory[];
  return { people, stories };
}

export function loadDirectory(): Promise<Directory> {
  const now = Date.now();
  if (cache && now - cache.at < STALE_MS) return cache.promise;
  const promise = fetchDirectory().catch(() => {
    cache = null;
    return { people: [], stories: [] };
  });
  cache = { at: now, promise };
  return promise;
}

/** Load the directory once `enabled` turns true. `null` while loading. */
export function useFamilyDirectory(enabled: boolean): Directory | null {
  const [dir, setDir] = useState<Directory | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadDirectory().then((d) => {
      if (!cancelled) setDir(d);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return dir;
}

function norm(s: string) {
  return s.toLocaleLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

export function personHaystack(p: DirectoryPerson) {
  return norm(
    [p.given_en, p.given_ar, p.family_name_en, p.family_name_ar].filter(Boolean).join(" "),
  );
}

export function matchPeople(people: DirectoryPerson[], query: string, limit = 8) {
  const q = norm(query.trim());
  if (!q) return [];
  const starts: DirectoryPerson[] = [];
  const contains: DirectoryPerson[] = [];
  for (const p of people) {
    const hay = personHaystack(p);
    if (!hay.includes(q)) continue;
    if (hay.split(" ").some((w) => w.startsWith(q))) starts.push(p);
    else contains.push(p);
  }
  return [...starts, ...contains].slice(0, limit);
}

export type StoryMatch = {
  story: DirectoryStory;
  person: DirectoryPerson;
  /** Short text around the match (place or story excerpt). */
  snippet: string;
  kind: "place" | "story";
};

export function matchStories(dir: Directory, query: string, lang: "ar" | "en", limit = 5): StoryMatch[] {
  const q = norm(query.trim());
  if (q.length < 2) return [];
  const byId = new Map(dir.people.map((p) => [p.id, p]));
  const out: StoryMatch[] = [];
  const seenPlaces = new Set<string>();
  for (const s of dir.stories) {
    const person = byId.get(s.person_id);
    if (!person) continue;
    if (s.location && norm(s.location).includes(q)) {
      const key = `${person.id}:${norm(s.location)}`;
      if (seenPlaces.has(key)) continue;
      seenPlaces.add(key);
      out.push({ story: s, person, snippet: s.location, kind: "place" });
    } else {
      const text = (lang === "ar" ? s.story_ar ?? s.story_en : s.story_en ?? s.story_ar) ?? "";
      if (!norm(text).includes(q)) continue;
      // Position in the original text (normalising can shift indices for accented letters).
      const at = Math.max(0, text.toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase()));
      const start = Math.max(0, at - 24);
      const excerpt = (start > 0 ? "…" : "") + text.slice(start, start + 72).trim() + (start + 72 < text.length ? "…" : "");
      out.push({ story: s, person, snippet: excerpt, kind: "story" });
    }
    if (out.length >= limit) break;
  }
  return out;
}

export function directoryName(p: DirectoryPerson, lang: "ar" | "en") {
  return getDisplayName(p, lang);
}
