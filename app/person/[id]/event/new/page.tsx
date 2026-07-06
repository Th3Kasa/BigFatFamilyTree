import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { getDisplayName } from "@/lib/utils";
import { createEvent } from "@/lib/actions/events";
import { EventForm } from "@/components/forms/EventForm";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Viewers cannot author events (RLS enforces this too — this is UX).
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = (profile as { role?: string } | null)?.role;

  const personQuery = UUID_RE.test(id)
    ? supabase.from("people").select("id, slug, given_en, given_ar, family_name_en, family_name_ar").eq("id", id).is("deleted_at", null).single()
    : supabase.from("people").select("id, slug, given_en, given_ar, family_name_en, family_name_ar").eq("slug", id).is("deleted_at", null).single();
  const { data: person } = await personQuery;
  if (!person) notFound();

  const returnHref = `/person/${person.slug ?? person.id}`;
  if (role !== "admin" && role !== "editor") redirect(returnHref);

  const boundCreate = createEvent.bind(null, person.id as string);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1
        className="text-2xl font-semibold tracking-tight"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {lang === "ar" ? "إضافة حدث" : "Add event"}
      </h1>
      <p className="mt-1 mb-6 text-sm text-[var(--muted-foreground)]">
        {getDisplayName(person, lang)}
      </p>
      <EventForm action={boundCreate} returnHref={returnHref} lang={lang} />
    </div>
  );
}
