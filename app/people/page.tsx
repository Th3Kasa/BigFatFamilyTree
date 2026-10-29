import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { cn, getDisplayName } from "@/lib/utils";
import { PeopleDirectory } from "@/components/people/PeopleDirectory";
import { withSignedPhotos } from "@/lib/storage/photos";
import type { DirectoryPerson } from "@/lib/client/family-directory";

type SearchParams = Promise<{ sort?: string | string[] }>;

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return { title: lang === "ar" ? "الأشخاص · شجرة العائلة" : "People · Big Fat Family Tree" };
}

const COLUMNS =
  "id, slug, given_en, given_ar, family_name_en, family_name_ar, photo_url, gender, birth_date, death_date";

/** Everyone in the family as a searchable grid: A–Z, or most recently added first. */
export default async function PeoplePage({ searchParams }: { searchParams: SearchParams }) {
  const [supabase, lang, sp] = await Promise.all([createClient(), getLang(), searchParams]);
  const sort = sp.sort === "recent" ? "recent" : "az";
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: rows }, { data: profile }] = await Promise.all([
    supabase
      .from("people")
      .select(COLUMNS)
      .is("deleted_at", null)
      .eq("is_placeholder", false)
      .order("created_at", { ascending: false }),
    user ? supabase.from("profiles").select("role").eq("id", user.id).single() : Promise.resolve({ data: null }),
  ]);
  const role = (profile as { role?: string } | null)?.role;
  const canEdit = role === "admin" || role === "editor";

  const people = await withSignedPhotos(supabase, (rows ?? []) as DirectoryPerson[]);
  if (sort === "az") {
    people.sort((a, b) => getDisplayName(a, lang).localeCompare(getDisplayName(b, lang), lang));
  }

  const tabs = [
    { key: "az", href: "/people", label: t("A–Z", "أ–ي") },
    { key: "recent", href: "/people?sort=recent", label: t("Recently added", "أضيف مؤخرًا") },
  ] as const;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-3 py-5 sm:px-6 sm:py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[28px] font-bold leading-tight text-[var(--foreground)]">
            {t("People", "الأشخاص")}
          </h1>
          <p className="mt-1 text-[15px] text-[var(--muted-foreground)]">
            {people.length === 1
              ? t("1 person in the family", "شخص واحد في العائلة")
              : t(`${people.length} people in the family`, `${people.length} شخصًا في العائلة`)}
          </p>
        </div>
        <nav aria-label={t("Sort people", "ترتيب الأشخاص")} className="flex gap-1 rounded-full bg-[var(--muted)] p-1">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={sort === tab.key ? "page" : undefined}
              className={cn(
                "inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-[var(--foreground)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                sort === tab.key ? "bg-[var(--card)] shadow-[0_1px_3px_rgba(36,21,23,0.12)]" : "hover:bg-[var(--card)]/60",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>

      {people.length === 0 ? (
        <div className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
            <Users className="h-7 w-7" aria-hidden />
          </span>
          <p className="text-lg font-semibold text-[var(--foreground)]">{t("No one has been added yet", "لم تتم إضافة أحد بعد")}</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {canEdit
              ? t("Add the first person and the family grows from there.", "أضف أول شخص وستكبر العائلة من هناك.")
              : t("An admin or editor can add the first person.", "يمكن للمشرف أو المحرّر إضافة أول شخص.")}
          </p>
          {canEdit && (
            <Link
              href="/person/new"
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--primary)] px-5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
            >
              <UserPlus className="h-4 w-4" aria-hidden />
              {t("Add a person", "أضف شخصًا")}
            </Link>
          )}
        </div>
      ) : (
        <PeopleDirectory people={people} lang={lang} sort={sort} />
      )}
    </div>
  );
}
