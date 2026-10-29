import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { getDisplayName } from "@/lib/utils";
import { createEvent } from "@/lib/actions/events";
import { EventForm } from "@/components/forms/EventForm";
import { PersonAvatar } from "@/components/people/PersonAvatar";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Add to someone's life story. `?kind=memory` is the "Write a memory" flow
 * (a notable_story event with friendlier wording); otherwise any life event.
 */
export default async function NewEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string | string[] }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);
  const memory = sp.kind === "memory";
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Viewers cannot author events (RLS enforces this too — this is UX).
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = (profile as { role?: string } | null)?.role;

  const columns = "id, slug, given_en, given_ar, family_name_en, family_name_ar, photo_url";
  const personQuery = UUID_RE.test(id)
    ? supabase.from("people").select(columns).eq("id", id).is("deleted_at", null).single()
    : supabase.from("people").select(columns).eq("slug", id).is("deleted_at", null).single();
  const { data: person } = await personQuery;
  if (!person) notFound();

  const returnHref = `/person/${encodeURIComponent(person.slug ?? person.id)}`;
  if (role !== "admin" && role !== "editor") redirect(returnHref);

  const boundCreate = createEvent.bind(null, person.id as string);
  const name = getDisplayName(person, lang);
  const BackIcon = lang === "ar" ? ArrowRight : ArrowLeft;

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-6 sm:px-5 sm:py-8">
      <Link
        href={returnHref}
        className="mb-4 inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <BackIcon className="h-4 w-4" aria-hidden />
        {t(`Back to ${name}`, `العودة إلى ${name}`)}
      </Link>

      <div className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5 sm:p-7">
        <div className="mb-6 flex items-center gap-3">
          <PersonAvatar person={person} lang={lang} className="h-12 w-12" />
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-bold text-[var(--foreground)]">
              {memory ? t("Write a memory", "اكتب ذكرى") : t("Add a life event", "أضف حدثًا في الحياة")}
            </h1>
            <p className="truncate text-sm text-[var(--muted-foreground)]">
              {memory ? t(`About ${name}`, `عن ${name}`) : t(`For ${name}'s life story`, `لقصة حياة ${name}`)}
            </p>
          </div>
        </div>
        <EventForm action={boundCreate} returnHref={returnHref} lang={lang} kind={memory ? "memory" : "event"} />
      </div>
    </div>
  );
}
