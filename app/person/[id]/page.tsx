import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { deletePerson } from "@/lib/actions/people";
import { createRelationship } from "@/lib/actions/relationships";
import { RelationshipForm } from "@/components/forms/RelationshipForm";
import { AvatarPhotoUpload } from "@/components/forms/AvatarPhotoUpload";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  Edit2,
  MapPin,
  Music,
  Plus,
  User,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DeletePersonButton } from "@/components/person/DeletePersonButton";

type Props = { params: Promise<{ id: string }> };

const EVENT_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  birth:         { ar: "الميلاد",    en: "Birth" },
  death:         { ar: "الوفاة",     en: "Death" },
  marriage:      { ar: "الزواج",     en: "Marriage" },
  divorce:       { ar: "الطلاق",     en: "Divorce" },
  engagement:    { ar: "الخطوبة",    en: "Engagement" },
  migration:     { ar: "الهجرة",     en: "Migration" },
  education:     { ar: "التعليم",    en: "Education" },
  notable_story: { ar: "قصة بارزة", en: "Notable Story" },
  custom:        { ar: "حدث",        en: "Event" },
};

const REL_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  spouse:     { ar: "زوج/زوجة",       en: "Spouse" },
  adopted_by: { ar: "متبنَّى بواسطة", en: "Adopted by" },
  raised_by:  { ar: "تربى بواسطة",    en: "Raised by" },
  godparent:  { ar: "عرّاب",           en: "Godparent" },
};

export default async function PersonPage({ params }: Props) {
  const { id } = await params;
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  // Accept slug or UUID
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const personQuery = UUID_RE.test(id)
    ? supabase.from("people").select("*").eq("id", id).is("deleted_at", null).single()
    : supabase.from("people").select("*").eq("slug", id).is("deleted_at", null).single();

  const { data: person } = await personQuery;
  if (!person) notFound();

  const personId = person.id as string;

  const [
    { data: events },
    { data: people },
    { data: relationships },
  ] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("person_id", personId)
      .order("date_value", { ascending: true }),
    supabase
      .from("people")
      .select("id, given_en, given_ar, family_name_en, family_name_ar")
      .is("deleted_at", null)
      .neq("id", personId),
    supabase
      .from("relationships")
      .select(
        "*, person_a:people!relationships_person_a_id_fkey(id,given_en,given_ar), person_b:people!relationships_person_b_id_fkey(id,given_en,given_ar)"
      )
      .or(`person_a_id.eq.${personId},person_b_id.eq.${personId}`),
  ]);

  async function handleDelete() {
    "use server";
    const result = await deletePerson(person.id);
    if (result && !result.success) throw new Error(result.error ?? "Delete failed");
  }

  // Derived display values
  const given =
    lang === "ar"
      ? (person.given_ar ?? person.given_en)
      : (person.given_en ?? person.given_ar);
  const fatherName =
    lang === "ar"
      ? (person.father_name_ar ?? person.father_name_en)
      : (person.father_name_en ?? person.father_name_ar);
  const grandfatherName =
    lang === "ar"
      ? (person.grandfather_name_ar ?? person.grandfather_name_en)
      : (person.grandfather_name_en ?? person.grandfather_name_ar);
  const familyName =
    lang === "ar"
      ? (person.family_name_ar ?? person.family_name_en)
      : (person.family_name_en ?? person.family_name_ar);

  const fullNameChain = [given, fatherName, grandfatherName, familyName]
    .filter(Boolean)
    .join(" ");
  const initials = (given ?? "?").slice(0, 2).toUpperCase();
  const notes =
    lang === "ar"
      ? (person.notes_ar ?? person.notes_en)
      : (person.notes_en ?? person.notes_ar);

  // Birth / death year — prefer person record fields, fall back to events
  const birthYear = person.birth_date
    ? String(person.birth_date).slice(0, 4)
    : events?.find((e) => e.type === "birth")?.date_value
      ? String(events.find((e) => e.type === "birth")!.date_value).slice(0, 4)
      : null;
  const deathYear = person.death_date
    ? String(person.death_date).slice(0, 4)
    : events?.find((e) => e.type === "death")?.date_value
      ? String(events.find((e) => e.type === "death")!.date_value).slice(0, 4)
      : null;

  const genderLabel =
    person.gender === "m"
      ? lang === "ar" ? "ذكر" : "Male"
      : person.gender === "f"
        ? lang === "ar" ? "أنثى" : "Female"
        : null;

  // Linked transcript IDs via events
  const transcriptIds = Array.from(
    new Set((events ?? []).map((e) => e.source_transcript_id).filter(Boolean))
  ) as string[];
  const { data: linkedTranscriptsData } = transcriptIds.length
    ? await supabase.from("transcripts").select("id, recorded_at").in("id", transcriptIds)
    : { data: [] };
  const uniqueTranscripts = linkedTranscriptsData ?? [];

  return (
    <main className="min-h-screen bg-[var(--background)]">
      {/* Back nav */}
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors mb-6"
        >
          <span aria-hidden>{lang === "ar" ? "→" : "←"}</span>
          {lang === "ar" ? "العودة" : "Back"}
        </Link>
      </div>

      {/* Hero */}
      <div className="max-w-2xl mx-auto px-4 pb-6">
        <Card className="overflow-hidden">
          {/* Top bar with edit button */}
          <div className="flex justify-end px-6 pt-4 gap-2">
            <Link href={`/person/${(person as { slug?: string | null }).slug ?? id}/edit`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Edit2 className="h-3.5 w-3.5" />
                {lang === "ar" ? "تعديل" : "Edit"}
              </Button>
            </Link>
            <DeletePersonButton action={handleDelete} lang={lang} />
          </div>

          {/* Avatar + name */}
          <div className="flex flex-col items-center gap-3 px-6 pb-6 pt-2 text-center">
            <AvatarPhotoUpload
              personId={person.id}
              currentUrl={person.photo_url ?? null}
              alt={given ?? ""}
              initials={initials}
              fallbackGender={person.gender as "m" | "f" | "unknown" | undefined}
              sizeClass="h-[120px] w-[120px]"
              wrapperClassName={cn(
                "border-4",
                person.gender === "f"
                  ? "border-rose-200 bg-rose-50"
                  : "border-sky-200 bg-sky-50"
              )}
              fallbackClassName={cn(
                "text-3xl font-bold",
                person.gender === "f"
                  ? "bg-rose-50 text-rose-400"
                  : "bg-sky-50 text-sky-400"
              )}
              lang={lang}
            />

            <div className="space-y-1">
              <h1 className="text-[28px] font-bold text-[var(--foreground)] font-[Fraunces,serif] leading-tight">
                {given ?? "—"}
              </h1>
              {fullNameChain !== given && (
                <p className="text-sm text-[var(--muted-foreground)]">{fullNameChain}</p>
              )}
            </div>

            {/* Meta badges */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
              {(birthYear || deathYear) && (
                <Badge variant="outline" className="gap-1.5">
                  <Calendar className="h-3 w-3" />
                  {birthYear ?? "?"}
                  {deathYear ? ` – ${deathYear}` : ""}
                </Badge>
              )}
              {genderLabel && (
                <Badge
                  variant="secondary"
                  className={cn(
                    person.gender === "f"
                      ? "bg-rose-50 text-rose-600 border-rose-100"
                      : "bg-sky-50 text-sky-600 border-sky-100"
                  )}
                >
                  {genderLabel}
                </Badge>
              )}
              {familyName && (
                <Badge variant="outline" className="gap-1.5">
                  <Users className="h-3 w-3" />
                  {familyName}
                </Badge>
              )}
            </div>
          </div>

          <Separator />

          {/* Tabs */}
          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="w-full rounded-none border-b border-[var(--border)] bg-transparent h-auto p-0">
              <TabsTrigger
                value="profile"
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--primary)] data-[state=active]:bg-transparent py-3 text-sm"
              >
                <User className="h-3.5 w-3.5 mr-1.5" />
                {lang === "ar" ? "الملف" : "Profile"}
              </TabsTrigger>
              <TabsTrigger
                value="events"
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--primary)] data-[state=active]:bg-transparent py-3 text-sm"
              >
                <Calendar className="h-3.5 w-3.5 mr-1.5" />
                {lang === "ar" ? "الأحداث" : "Events"}
              </TabsTrigger>
              <TabsTrigger
                value="relations"
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--primary)] data-[state=active]:bg-transparent py-3 text-sm"
              >
                <Users className="h-3.5 w-3.5 mr-1.5" />
                {lang === "ar" ? "العلاقات" : "Relations"}
              </TabsTrigger>
              <TabsTrigger
                value="sources"
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--primary)] data-[state=active]:bg-transparent py-3 text-sm"
              >
                <Music className="h-3.5 w-3.5 mr-1.5" />
                {lang === "ar" ? "المصادر" : "Sources"}
              </TabsTrigger>
            </TabsList>

            {/* ─── Profile Tab ─── */}
            <TabsContent value="profile" className="p-6 space-y-6">
              {/* Bilingual name fields as read-only cards */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
                  {lang === "ar" ? "الأسماء" : "Names"}
                </p>
                {[
                  {
                    labelEn: "Given name",
                    labelAr: "الاسم الأول",
                    en: person.given_en,
                    ar: person.given_ar,
                  },
                  {
                    labelEn: "Father's name",
                    labelAr: "اسم الأب",
                    en: person.father_name_en,
                    ar: person.father_name_ar,
                  },
                  {
                    labelEn: "Grandfather's name",
                    labelAr: "اسم الجد",
                    en: person.grandfather_name_en,
                    ar: person.grandfather_name_ar,
                  },
                  {
                    labelEn: "Family name",
                    labelAr: "اسم العائلة",
                    en: person.family_name_en,
                    ar: person.family_name_ar,
                  },
                ]
                  .filter((row) => row.en || row.ar)
                  .map((row) => (
                    <div
                      key={row.labelEn}
                      className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3 flex items-center justify-between gap-4"
                    >
                      <span className="text-xs text-[var(--muted-foreground)] w-32 shrink-0">
                        {lang === "ar" ? row.labelAr : row.labelEn}
                      </span>
                      <div className="flex gap-6 text-sm font-medium text-[var(--foreground)]">
                        {row.en && <span>{row.en}</span>}
                        {row.ar && (
                          <span dir="rtl" className="text-[var(--muted-foreground)]">
                            {row.ar}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>

              {/* Notes */}
              {notes && (
                <div>
                  <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-2">
                    {lang === "ar" ? "ملاحظات" : "Notes"}
                  </p>
                  <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-4 py-3">
                    <p className="text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">
                      {notes}
                    </p>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ─── Events Tab ─── */}
            <TabsContent value="events" className="p-6">
              {events && events.length > 0 ? (
                <ol className="relative border-s border-[var(--border)] space-y-0">
                  {events.map((e, i) => {
                    const label =
                      lang === "ar"
                        ? (EVENT_TYPE_LABELS[e.type]?.ar ?? e.type)
                        : (EVENT_TYPE_LABELS[e.type]?.en ?? e.type);
                    const story =
                      lang === "ar"
                        ? (e.story_ar ?? e.story_en)
                        : (e.story_en ?? e.story_ar);
                    return (
                      <li key={e.id} className="ms-5 pb-8 last:pb-0">
                        <span className="absolute -start-[9px] flex h-4 w-4 items-center justify-center rounded-full bg-[var(--background)] border-2 border-[var(--primary)]" />
                        <time className="text-xs text-[var(--muted-foreground)]">
                          {e.date_value ??
                            (lang === "ar" ? "تاريخ غير معروف" : "Date unknown")}
                          {(e.date_precision as string) !== "exact" &&
                            ` (${e.date_precision})`}
                        </time>
                        <p className="text-sm font-semibold text-[var(--foreground)] mt-0.5">
                          {label}
                        </p>
                        {story && (
                          <p className="text-sm text-[var(--muted-foreground)] mt-1 leading-relaxed">
                            {story}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-sm text-[var(--muted-foreground)] py-4">
                  {lang === "ar"
                    ? "لا توجد أحداث مسجّلة."
                    : "No events recorded yet."}
                </p>
              )}

              {/* Placeholder add event button */}
              <div className="mt-6 pt-4 border-t border-[var(--border)]">
                <Link href={`/person/${(person as { slug?: string | null }).slug ?? id}/event/new`}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    {lang === "ar" ? "إضافة حدث" : "Add event"}
                  </Button>
                </Link>
              </div>
            </TabsContent>

            {/* ─── Relations Tab ─── */}
            <TabsContent value="relations" className="p-6 space-y-6">
              {/* Parents row from person record */}
              {(person.father_id || person.mother_id) && (
                <div>
                  <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-3">
                    {lang === "ar" ? "الوالدان" : "Parents"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {person.father_id && (
                      <Link href={`/person/${person.father_id}`}>
                        <Badge variant="outline" className="px-3 py-1.5 text-sm cursor-pointer hover:bg-[var(--accent)] transition-colors">
                          <User className="h-3 w-3 mr-1.5" />
                          {lang === "ar" ? "الأب" : "Father"}
                        </Badge>
                      </Link>
                    )}
                    {person.mother_id && (
                      <Link href={`/person/${person.mother_id}`}>
                        <Badge variant="outline" className="px-3 py-1.5 text-sm cursor-pointer hover:bg-[var(--accent)] transition-colors">
                          <User className="h-3 w-3 mr-1.5" />
                          {lang === "ar" ? "الأم" : "Mother"}
                        </Badge>
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/* Explicit relationships */}
              {relationships && relationships.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-3">
                    {lang === "ar" ? "علاقات أخرى" : "Relationships"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {relationships.map((r) => {
                      const other =
                        r.person_a_id === personId
                          ? (r.person_b as {
                              id: string;
                              given_en: string | null;
                              given_ar: string | null;
                            } | null)
                          : (r.person_a as {
                              id: string;
                              given_en: string | null;
                              given_ar: string | null;
                            } | null);
                      const otherName = other
                        ? (lang === "ar"
                            ? (other.given_ar ?? other.given_en)
                            : (other.given_en ?? other.given_ar)) ?? "?"
                        : "?";
                      const typeLabel =
                        lang === "ar"
                          ? (REL_TYPE_LABELS[r.type]?.ar ?? r.type)
                          : (REL_TYPE_LABELS[r.type]?.en ?? r.type);
                      return (
                        <Link key={r.id} href={`/person/${other?.id}`}>
                          <div className="flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm cursor-pointer hover:bg-[var(--accent)] transition-colors">
                            <span className="font-medium text-[var(--foreground)]">
                              {otherName}
                            </span>
                            <span className="text-[var(--muted-foreground)] text-xs">
                              · {typeLabel}
                            </span>
                            {r.status !== "current" && (
                              <span className="text-xs text-[var(--muted-foreground)]">
                                ({r.status})
                              </span>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : !person.father_id && !person.mother_id ? (
                <p className="text-sm text-[var(--muted-foreground)] py-4">
                  {lang === "ar"
                    ? "لا توجد علاقات مسجّلة."
                    : "No relationships recorded yet."}
                </p>
              ) : null}

              {/* Add relationship form */}
              <div className="pt-4 border-t border-[var(--border)]">
                <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-3">
                  {lang === "ar" ? "إضافة علاقة" : "Add relationship"}
                </p>
                <RelationshipForm
                  people={people ?? []}
                  lang={lang}
                  action={createRelationship.bind(null, person.id)}
                />
              </div>
            </TabsContent>

            {/* ─── Sources Tab ─── */}
            <TabsContent value="sources" className="p-6 space-y-3">
              {uniqueTranscripts.length > 0 ? (
                uniqueTranscripts.map((t) => (
                  <Link key={t.id} href={`/transcripts/${t.id}`}>
                    <Card className="hover:border-[var(--primary)]/40 transition-colors cursor-pointer">
                      <CardContent className="flex items-center gap-3 p-4">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10">
                          <Music className="h-4 w-4 text-[var(--primary)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--foreground)] truncate">
                            {(t as { id: string; recorded_at: string | null }).recorded_at
                              ? new Date((t as { id: string; recorded_at: string | null }).recorded_at!).toLocaleDateString()
                              : lang === "ar" ? "تسجيل صوتي" : "Audio transcript"}
                          </p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {lang === "ar" ? "انقر للاستماع" : "Click to listen"}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-[var(--muted-foreground)] py-4">
                  {lang === "ar"
                    ? "لا توجد مصادر صوتية مرتبطة."
                    : "No audio sources linked yet."}
                </p>
              )}
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </main>
  );
}
