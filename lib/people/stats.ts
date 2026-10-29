/** Summary facts for the home header: "The Haddad family · 214 people · 5 generations". */

type StatPerson = {
  id: string;
  father_id: string | null;
  mother_id: string | null;
  family_name_en: string | null;
  family_name_ar: string | null;
  is_placeholder: boolean;
};

/** The most common family name (in the active language, falling back to the other). */
export function commonFamilyName(people: StatPerson[], lang: "ar" | "en"): string | null {
  const counts = new Map<string, number>();
  for (const p of people) {
    if (p.is_placeholder) continue;
    const name = (lang === "ar" ? p.family_name_ar ?? p.family_name_en : p.family_name_en ?? p.family_name_ar)?.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, n] of counts) {
    if (n > bestCount || (n === bestCount && best !== null && name.localeCompare(best) < 0)) {
      best = name;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Longest parent → child chain, counted in people (a lone person is 1
 * generation). Cycles in bad data are ignored rather than looping forever.
 */
export function countGenerations(people: StatPerson[]): number {
  const byId = new Map(people.map((p) => [p.id, p]));
  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  function depth(id: string): number {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const p = byId.get(id);
    let best = 0;
    if (p) {
      for (const parent of [p.father_id, p.mother_id]) {
        if (parent && byId.has(parent)) best = Math.max(best, depth(parent));
      }
    }
    visiting.delete(id);
    const d = best + 1;
    memo.set(id, d);
    return d;
  }

  let max = 0;
  for (const p of people) max = Math.max(max, depth(p.id));
  return max;
}
