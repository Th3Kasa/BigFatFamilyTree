import Link from "next/link";
import type { Lang } from "@/lib/lang/server";
import type { Database } from "@/lib/db/types";

type PersonRow = Pick<
  Database["public"]["Tables"]["people"]["Row"],
  "id" | "slug" | "given_ar" | "given_en" | "family_name_ar" | "family_name_en" | "gender" | "is_placeholder"
>;

type Props = {
  people: PersonRow[];
  lang: Lang;
};

export function PeopleList({ people, lang }: Props) {
  // Group real people by family name; skip placeholders
  const groups = new Map<string, PersonRow[]>();
  for (const p of people) {
    if (p.is_placeholder) continue;
    const key =
      (lang === "ar" ? p.family_name_ar : p.family_name_en) ??
      (lang === "ar" ? p.family_name_en : p.family_name_ar) ??
      "—";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  return (
    <main className="p-4 pb-20">
      <h1 className="text-xl font-bold mb-4">
        {lang === "ar" ? "شجرة العائلة" : "Family Tree"}
      </h1>
      {[...groups.entries()].map(([group, members]) => (
        <section key={group} className="mb-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 px-1">
            {group}
          </h2>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
            {members.map((p) => {
              const name =
                lang === "ar"
                  ? (p.given_ar ?? p.given_en ?? "?")
                  : (p.given_en ?? p.given_ar ?? "?");
              return (
                <li key={p.id}>
                  <Link
                    href={`/person/${p.slug ?? p.id}`}
                    className="flex items-center gap-3 py-3 px-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    <span className="text-xl leading-none shrink-0">
                      {p.gender === "f" ? "👩" : "👨"}
                    </span>
                    <span className="text-sm text-gray-800">{name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
