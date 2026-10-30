import { cache } from "react";
import { withSignedPhotos } from "@/lib/storage/photos";
import { fetchBirthOrders, withBirthOrder } from "@/lib/people/birth-order";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Camera, PenLine, Plus, UserPen, Waypoints } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getLang, type Lang } from "@/lib/lang/server";
import { deletePerson } from "@/lib/actions/people";
import { createRelationship } from "@/lib/actions/relationships";
import { deleteEvent } from "@/lib/actions/events";
import { RelationshipForm } from "@/components/forms/RelationshipForm";
import { AvatarPhotoUpload } from "@/components/forms/AvatarPhotoUpload";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { PagePersonContext } from "@/components/shell/PagePersonContext";
import { canEditPerson } from "@/lib/people/edit-scope";
import { signPhotoValues } from "@/lib/storage/sign";
import { ProfileMoreMenu } from "@/components/person/ProfileMoreMenu";
import { ConfirmDeleteButton } from "@/components/person/ConfirmDeleteButton";
import { cn, getDisplayName, getNameParts } from "@/lib/utils";
import { avatarTone, formatEventDate, initialsOf, lifeYears } from "@/lib/people/display";
import { familyOf, kinLabel, type FamilyMember, type FamilyPerson, type FamilyRelationship } from "@/lib/people/family";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FAMILY_COLUMNS =
  "id, slug, given_en, given_ar, family_name_en, family_name_ar, father_id, mother_id, gender, is_placeholder, photo_url, birth_date, death_date";

const EVENT_STYLE: Record<string, { en: string; ar: string; bg: string; fg: string }> = {
  birth: { en: "Born", ar: "الميلاد", bg: "#E3EEDF", fg: "#2F5A27" },
  death: { en: "Passed away", ar: "الوفاة", bg: "#ECE2DE", fg: "#4A3B3D" },
  marriage: { en: "Married", ar: "الزواج", bg: "#F7E7EB", fg: "#7A1631" },
  divorce: { en: "Divorced", ar: "الطلاق", bg: "#ECE2DE", fg: "#4A3B3D" },
  engagement: { en: "Engaged", ar: "الخطوبة", bg: "#F7E7EB", fg: "#7A1631" },
  migration: { en: "Moved", ar: "الانتقال", bg: "#DDE7F1", fg: "#1F4467" },
  education: { en: "Education", ar: "التعليم", bg: "#E8E1F2", fg: "#4A3470" },
  notable_story: { en: "Memory", ar: "ذكرى", bg: "#EFE3D3", fg: "#6A4A1F" },
  custom: { en: "Life event", ar: "حدث", bg: "#F4EDEA", fg: "#4A3B3D" },
};

type TabKey = "life" | "family" | "photos";

function pickTab(v: string | string[] | undefined): TabKey {
  return v === "family" || v === "photos" ? v : "life";
}

// Memoised per request: generateMetadata and the page share one lookup.
const loadPerson = cache(async (id: string) => {
  const supabase = await createClient();
  const q = supabase.from("people").select("*").is("deleted_at", null);
  const { data } = await (UUID_RE.test(id) ? q.eq("id", id) : q.eq("slug", id)).maybeSingle();
  // Photos are private: swap the stored path for a short-lived signed URL.
  const person = data ? (await withSignedPhotos(supabase, [data]))[0] : data;
  return { supabase, person };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, lang] = await Promise.all([params, getLang()]);
  const { person } = await loadPerson(id);
  if (!person) return { title: lang === "ar" ? "غير موجود · شجرة العائلة" : "Not found · Big Fat Family Tree" };
  return { title: `${getDisplayName(person, lang)} · ${lang === "ar" ? "شجرة العائلة" : "Big Fat Family Tree"}` };
}

/** Title for a life-story card, e.g. "Moved to Beirut" or the custom label. */
function eventTitle(e: { type: string; custom_label: string | null; location: string | null }, lang: Lang) {
  const at = e.location?.trim();
  if (e.type === "custom" && e.custom_label) return e.custom_label;
  if (lang === "ar") {
    switch (e.type) {
      case "birth": return at ? `وُلد في ${at}` : "الميلاد";
      case "death": return at ? `توفي في ${at}` : "الوفاة";
      case "migration": return at ? `انتقل إلى ${at}` : "انتقال إلى مكان جديد";
      case "marriage": return "الزواج";
      case "notable_story": return "ذكرى";
      default: return EVENT_STYLE[e.type]?.ar ?? "حدث";
    }
  }
  switch (e.type) {
    case "birth": return at ? `Born in ${at}` : "Born";
    case "death": return at ? `Passed away in ${at}` : "Passed away";
    case "migration": return at ? `Moved to ${at}` : "Moved somewhere new";
    case "marriage": return "Got married";
    case "notable_story": return "A memory";
    default: return EVENT_STYLE[e.type]?.en ?? "Life event";
  }
}

export default async function PersonPage({ params, searchParams }: Props) {
  const [{ id }, sp, lang] = await Promise.all([params, searchParams, getLang()]);
  const { supabase, person } = await loadPerson(id);
  if (!person) notFound();
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  const personId = person.id as string;
  const ref = encodeURIComponent((person.slug as string | null) ?? personId);

  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: viewerProfile }, { data: events }, { data: peopleRows }, { data: relRows }, birthOrders] = await Promise.all([
    user ? supabase.from("profiles").select("role").eq("id", user.id).single() : Promise.resolve({ data: null }),
    supabase.from("events").select("*").eq("person_id", personId),
    supabase.from("people").select(FAMILY_COLUMNS).is("deleted_at", null),
    supabase.from("relationships").select("id, person_a_id, person_b_id, type, status, order_index"),
    fetchBirthOrders(supabase),
  ]);
  const role = (viewerProfile as { role?: string } | null)?.role ?? "";
  const isAdmin = role === "admin";
  // Details, photo, family links and life events: only the editor's close family
  // (can_edit_person). Memories: any editor, on any page.
  const canEdit = await canEditPerson(supabase, role, personId);
  // Every approved member may write a memory (with photos) on anyone's page.
  const canWriteMemory = !!user;
  // Deleting: admins, or an editor removing an unclaimed person they added (delete_person enforces it).
  let canDelete = isAdmin;
  if (!canDelete && canEdit && user && person.created_by === user.id) {
    const { data: claimed } = await supabase.rpc("claimed_person_ids");
    canDelete = !((claimed ?? []) as string[]).includes(personId);
  }

  const allPeople = withBirthOrder(await withSignedPhotos(supabase, (peopleRows ?? []) as FamilyPerson[]), birthOrders);
  const family = familyOf(personId, allPeople, (relRows ?? []) as FamilyRelationship[]);

  async function handleDelete() {
    "use server";
    const result = await deletePerson(personId);
    if (result && !result.success) throw new Error(result.error ?? "Delete failed");
  }

  // ── Names ──────────────────────────────────────────────────────────────
  const { given } = getNameParts(person, lang);
  const displayName = getDisplayName(person, lang);
  const otherLang: Lang = lang === "ar" ? "en" : "ar";
  const otherName = (() => {
    const g = otherLang === "ar" ? person.given_ar : person.given_en;
    const f = otherLang === "ar" ? person.family_name_ar : person.family_name_en;
    const n = [g, f].filter(Boolean).join(" ").trim();
    return n && n !== displayName ? n : null;
  })();
  const pick = (en: string | null, ar: string | null) => (lang === "ar" ? ar ?? en : en ?? ar);
  const fullNameChain = [
    given,
    pick(person.father_name_en, person.father_name_ar),
    pick(person.grandfather_name_en, person.grandfather_name_ar),
    getNameParts(person, lang).family,
  ]
    .filter(Boolean)
    .join(" ");
  const notes = pick(person.notes_en, person.notes_ar);
  const firstName = given || displayName;

  // ── Life story ─────────────────────────────────────────────────────────
  // Memory photos live in the private bucket: sign them all in one request.
  const memoryPhotoUrls = await signPhotoValues(
    supabase,
    (events ?? []).flatMap((e) => ((e as { photo_paths?: string[] | null }).photo_paths ?? [])),
  );
  const sorted = [...(events ?? [])].sort((a, b) => {
    if (!a.date_value && !b.date_value) return 0;
    if (!a.date_value) return 1;
    if (!b.date_value) return -1;
    return a.date_value < b.date_value ? 1 : -1;
  });
  const birthEvent = sorted.find((e) => e.type === "birth");
  const deathEvent = sorted.find((e) => e.type === "death");
  const birthText =
    formatEventDate(person.birth_date ?? birthEvent?.date_value, person.birth_date ? "exact" : birthEvent?.date_precision, lang);
  const deathText =
    formatEventDate(person.death_date ?? deathEvent?.date_value, person.death_date ? "exact" : deathEvent?.date_precision, lang);
  const years = lifeYears(person.birth_date ?? birthEvent?.date_value, person.death_date ?? deathEvent?.date_value, lang);

  // Places in order: where they were born, moved, and passed away.
  const places: string[] = [];
  for (const e of [...sorted].reverse()) {
    if (!["birth", "migration", "death"].includes(e.type)) continue;
    const place = e.location?.trim();
    if (place && !places.includes(place)) places.push(place);
  }
  const placesLine = places.join(lang === "ar" ? " ← " : " → ");

  const tab = pickTab(sp.tab);
  const tone = avatarTone(personId);
  const BackIcon = lang === "ar" ? ArrowRight : ArrowLeft;

  const circles: FamilyMember[] = [...family.partners, ...family.parents, ...family.children, ...family.siblings];

  return (
    <div className="mx-auto w-full max-w-[1040px] px-3 pb-10 sm:px-5">
      <PagePersonContext id={personId} slug={person.slug ?? null} name={displayName} />

      <Tabs key={tab} defaultValue={tab} dir={lang === "ar" ? "rtl" : "ltr"} className="flex flex-col gap-5">
        {/* ── Header card ─────────────────────────────────────────────── */}
        <section
          aria-labelledby="person-name"
          className="overflow-hidden rounded-b-[24px] border border-t-0 border-[var(--border)] bg-[var(--card)]"
        >
          <div className="relative h-[132px] bg-[#EFE3D3] sm:h-[180px]">
            <Link
              href={`/?focus=${encodeURIComponent(personId)}`}
              className="absolute start-3 top-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--card)] px-4 text-sm font-semibold text-[var(--foreground)] shadow-sm transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:start-4 sm:top-4"
            >
              <BackIcon className="h-4 w-4" aria-hidden />
              {t("Back to tree", "العودة إلى الشجرة")}
            </Link>
          </div>

          <div className="flex flex-wrap items-end gap-x-5 gap-y-4 px-4 pb-5 sm:px-7">
            <div className="-mt-16 shrink-0">
              {canEdit ? (
                <AvatarPhotoUpload
                  personId={personId}
                  currentUrl={person.photo_url ?? null}
                  alt={displayName}
                  initials={initialsOf(person, lang)}
                  fallbackGender={person.gender as "m" | "f" | "unknown" | undefined}
                  sizeClass="h-32 w-32 sm:h-36 sm:w-36"
                  wrapperClassName="border-[5px] border-[var(--card)] shadow-[0_6px_20px_rgba(36,21,23,0.12)]"
                  fallbackClassName={cn("font-heading text-[44px] font-bold", tone.className)}
                  lang={lang}
                />
              ) : (
                <span className="flex rounded-full border-[5px] border-[var(--card)] shadow-[0_6px_20px_rgba(36,21,23,0.12)]">
                  <PersonAvatar
                    person={person}
                    lang={lang}
                    alt={person.photo_url ? displayName : undefined}
                    className="h-32 w-32 sm:h-36 sm:w-36"
                    textClassName="font-heading text-[44px]"
                  />
                </span>
              )}
            </div>

            <div className="min-w-0 flex-[1_1_18rem] pb-1">
              <h1 id="person-name" className="font-heading text-[28px] font-bold leading-tight text-[var(--foreground)] sm:text-[34px]">
                {displayName}
              </h1>
              {otherName && (
                <p
                  lang={otherLang}
                  dir={otherLang === "ar" ? "rtl" : "ltr"}
                  className={cn(
                    "mt-1 text-lg font-semibold text-[#3D2B2E]",
                    otherLang === "ar" ? "font-[family-name:var(--font-arabic)]" : "font-heading",
                  )}
                  style={{ textAlign: "start" }}
                >
                  {otherName}
                </p>
              )}
              {(years || placesLine) && (
                <p className="mt-1.5 text-[15px] text-[var(--muted-foreground)]">
                  {[years, placesLine].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pb-1.5">
              {canWriteMemory && (
                <Link
                  href={`/person/${ref}/event/new?kind=memory`}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--primary)] px-5 text-sm font-semibold text-[var(--primary-foreground)] transition-colors hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
                >
                  <PenLine className="h-4 w-4" aria-hidden />
                  {t("Add a memory", "أضف ذكرى")}
                </Link>
              )}
              {canEdit && (
                <Link
                  href={`/person/${ref}/edit`}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--card)] px-5 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
                >
                  <UserPen className="h-4 w-4" aria-hidden />
                  {t("Edit details", "تعديل البيانات")}
                </Link>
              )}
              <Link
                href={`/relationships?b=${encodeURIComponent(personId)}`}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--card)] px-5 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
              >
                <Waypoints className="h-4 w-4" aria-hidden />
                {t("How are we related?", "ما صلة القرابة بيننا؟")}
              </Link>
              {canEdit && (
                <ProfileMoreMenu
                  lang={lang}
                  name={displayName}
                  eventHref={`/person/${ref}/event/new`}
                  treeHref={`/?focus=${encodeURIComponent(personId)}`}
                  deleteAction={canDelete ? handleDelete : undefined}
                />
              )}
            </div>
          </div>

          {/* Family circles */}
          {(circles.length > 0 || canEdit) && (
            <nav aria-label={t(`${firstName}'s close family`, `عائلة ${firstName} القريبة`)} className="px-4 pb-5 sm:px-7">
              <ul className="scrollbar-none -mx-1 flex gap-4 overflow-x-auto px-1 py-1">
                {circles.map((m) => (
                  <li key={`${m.kin}-${m.person.id}`} className="shrink-0">
                    <FamilyCircle member={m} lang={lang} />
                  </li>
                ))}
                {canEdit && (
                  <li className="shrink-0">
                    <Link
                      href={`/?focus=${encodeURIComponent(personId)}`}
                      className="flex w-[76px] flex-col items-center gap-1.5 rounded-2xl text-center text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-[#C9B8B3] text-[var(--primary)]">
                        <Plus className="h-6 w-6" aria-hidden />
                      </span>
                      <span className="text-[13px] font-semibold leading-tight">{t("Add family", "أضف للعائلة")}</span>
                      <span className="sr-only">{t("on the tree", "على الشجرة")}</span>
                    </Link>
                  </li>
                )}
              </ul>
            </nav>
          )}

          <TabsList className="scrollbar-none flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-t border-[var(--border)] bg-transparent p-0 px-3 sm:px-5">
            {(
              [
                ["life", t("Life story", "قصة الحياة")],
                ["family", t("Family", "العائلة")],
                ["photos", t("Photos", "الصور")],
              ] as const
            ).map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="min-h-12 rounded-none border-b-[3px] border-transparent bg-transparent px-3.5 text-[15px] font-medium text-[var(--muted-foreground)] shadow-none data-[state=active]:border-[var(--primary)] data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-[var(--primary)] data-[state=active]:shadow-none"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </section>

        {/* ── Life story ──────────────────────────────────────────────── */}
        <TabsContent value="life" className="mt-0">
          <div className="flex flex-col-reverse gap-5 lg:flex-row lg:items-start">
            <aside className="flex flex-col gap-4 lg:w-[320px] lg:shrink-0">
              <section aria-labelledby="about-title" className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5">
                <h2 id="about-title" className="mb-3 text-[17px] font-bold text-[var(--foreground)]">
                  {t("About", "نبذة")}
                </h2>
                <dl className="grid gap-3 text-sm">
                  <AboutRow
                    label={t("Born", "الميلاد")}
                    value={[birthText, birthEvent?.location].filter(Boolean).join(" · ") || null}
                  />
                  <AboutRow
                    label={t("Passed away", "الوفاة")}
                    value={[deathText, deathEvent?.location].filter(Boolean).join(" · ") || null}
                  />
                  <AboutRow
                    label={t("Married to", "الزواج")}
                    value={family.partners.map((m) => getDisplayName(m.person, lang)).join(", ") || null}
                  />
                  <AboutRow label={t("Lived in", "عاش في")} value={places.join(lang === "ar" ? "، " : ", ") || null} />
                  {fullNameChain && fullNameChain !== displayName && (
                    <AboutRow label={t("Full name", "الاسم الكامل")} value={fullNameChain} />
                  )}
                </dl>
                {!birthText && !deathText && family.partners.length === 0 && places.length === 0 && (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {canEdit
                      ? t("No details yet. Use “Edit details” to add a birth date.", "لا توجد تفاصيل بعد. استخدم «تعديل البيانات» لإضافة تاريخ الميلاد.")
                      : t("No details have been added yet.", "لم تُضف أي تفاصيل بعد.")}
                  </p>
                )}
                {notes && (
                  <div className="mt-4 border-t border-[var(--border)] pt-4">
                    <h3 className="mb-1 text-[13px] text-[var(--muted-foreground)]">{t("Notes", "ملاحظات")}</h3>
                    <p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">
                      {notes}
                    </p>
                  </div>
                )}
              </section>
            </aside>

            <section aria-label={t("Life story", "قصة الحياة")} className="flex min-w-0 flex-1 flex-col gap-4">
              {canWriteMemory && (
                <div className="flex items-center gap-3 rounded-[20px] border border-[var(--border)] bg-[var(--card)] px-4 py-3.5">
                  <PersonAvatar person={person} lang={lang} className="h-10 w-10" textClassName="text-[13px]" />
                  <Link
                    href={`/person/${ref}/event/new?kind=memory`}
                    className="flex h-11 min-w-0 flex-1 items-center rounded-full bg-[var(--input)] px-4 text-[15px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <span className="truncate">{t(`Share a memory of ${firstName}…`, `شارك ذكرى عن ${firstName}…`)}</span>
                  </Link>
                  <Link
                    href={`/person/${ref}?tab=photos`}
                    aria-label={t("Add a photo", "أضف صورة")}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <Camera className="h-5 w-5" aria-hidden />
                  </Link>
                </div>
              )}

              {sorted.length > 0 ? (
                <ol className="flex flex-col gap-3.5">
                  {sorted.map((e) => {
                    const style = EVENT_STYLE[e.type] ?? EVENT_STYLE.custom;
                    const story = pick(e.story_en, e.story_ar);
                    const date = formatEventDate(e.date_value, e.date_precision, lang);
                    const meta = [date, e.type === "migration" || e.type === "birth" || e.type === "death" ? null : e.location]
                      .filter(Boolean)
                      .join(" · ");
                    const removeEvent = async () => {
                      "use server";
                      await deleteEvent(e.id as string, personId);
                    };
                    return (
                      <li key={e.id} className="flex flex-col gap-2.5 rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5">
                        <div className="flex items-center gap-3">
                          <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: style.bg, color: style.fg }}>
                            {lang === "ar" ? style.ar : style.en}
                          </span>
                          <p className="min-w-0 flex-1 truncate text-sm text-[var(--muted-foreground)]">
                            {meta || t("Date not known", "التاريخ غير معروف")}
                          </p>
                          {(canEdit || (e.type === "notable_story" && !!user && e.contributed_by === user.id)) && (
                            <ConfirmDeleteButton
                              action={removeEvent}
                              label={t("Delete this entry", "حذف هذا الإدخال")}
                              confirmText={t("Delete this from the life story?", "حذف هذا من قصة الحياة؟")}
                              className="-my-2 -me-2"
                            />
                          )}
                        </div>
                        <h3 className="text-lg font-bold text-[var(--foreground)]">{eventTitle(e, lang)}</h3>
                        {story && (
                          <p dir="auto" className="whitespace-pre-wrap text-[15px] leading-relaxed text-[#3D2B2E]">
                            {story}
                          </p>
                        )}
                        <MemoryPhotos
                          urls={((e as { photo_paths?: string[] | null }).photo_paths ?? [])
                            .map((p) => memoryPhotoUrls.get(p))
                            .filter((u): u is string => !!u)}
                          lang={lang}
                        />
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="rounded-[20px] border border-dashed border-[var(--border-strong)] bg-[var(--card)] px-6 py-10 text-center">
                  <p className="text-[15px] font-semibold text-[var(--foreground)]">
                    {t(`${firstName}'s story hasn't been written yet`, `لم تُكتب قصة ${firstName} بعد`)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {canWriteMemory
                      ? t("Start with a memory, a move, a wedding: anything worth remembering.", "ابدأ بذكرى أو انتقال أو زفاف: أي شيء يستحق أن يُذكر.")
                      : t("When the family adds memories and life events, they'll appear here.", "عندما تضيف العائلة ذكريات وأحداثًا، ستظهر هنا.")}
                  </p>
                  {canWriteMemory && (
                    <Link
                      href={`/person/${ref}/event/new?kind=memory`}
                      className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--primary)] px-5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
                    >
                      <PenLine className="h-4 w-4" aria-hidden />
                      {t("Write the first memory", "اكتب أول ذكرى")}
                    </Link>
                  )}
                </div>
              )}
            </section>
          </div>
        </TabsContent>

        {/* ── Family ──────────────────────────────────────────────────── */}
        <TabsContent value="family" className="mt-0 flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <FamilyGroup
              title={t("Parents", "الوالدان")}
              members={family.parents}
              lang={lang}
              empty={
                family.missingParent.father || family.missingParent.mother
                  ? t("Not recorded yet.", "غير مسجّلين بعد.")
                  : null
              }
              action={
                canEdit && (family.missingParent.father || family.missingParent.mother) ? (
                  <Link href={`/?focus=${encodeURIComponent(personId)}`} className="text-sm font-semibold text-[var(--primary)] hover:underline">
                    {t("Add a parent on the tree", "أضف أحد الوالدين على الشجرة")}
                  </Link>
                ) : null
              }
            />
            <FamilyGroup title={t("Partners", "الأزواج")} members={family.partners} lang={lang} empty={t("No marriages recorded.", "لا يوجد زواج مسجّل.")} />
            <FamilyGroup title={t("Children", "الأبناء")} members={family.children} lang={lang} empty={t("No children recorded.", "لا يوجد أبناء مسجّلون.")} />
            <FamilyGroup title={t("Brothers and sisters", "الإخوة والأخوات")} members={family.siblings} lang={lang} empty={t("No brothers or sisters recorded.", "لا يوجد إخوة مسجّلون.")} />
            {family.others.length > 0 && (
              <FamilyGroup title={t("Other family links", "صلات عائلية أخرى")} members={family.others} lang={lang} empty={null} />
            )}
          </div>

          {canEdit && (
            <section aria-labelledby="add-rel-title" className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5">
              <h2 id="add-rel-title" className="text-[17px] font-bold text-[var(--foreground)]">
                {t("Add a marriage or other link", "أضف زواجًا أو صلة أخرى")}
              </h2>
              <p className="mb-4 mt-1 text-sm text-[var(--muted-foreground)]">
                {t(
                  "Parents and children are easiest to add on the tree. Use this for marriages, adoption, guardians and godparents.",
                  "إضافة الوالدين والأبناء أسهل على الشجرة. استخدم هذا للزواج والتبني والأوصياء والعرّابين.",
                )}
              </p>
              <RelationshipForm
                people={allPeople.filter((p) => p.id !== personId && !p.is_placeholder)}
                lang={lang}
                action={createRelationship.bind(null, personId)}
              />
            </section>
          )}
        </TabsContent>

        {/* ── Photos ──────────────────────────────────────────────────── */}
        <TabsContent value="photos" className="mt-0">
          <section aria-labelledby="photos-title" className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
            <h2 id="photos-title" className="text-[17px] font-bold text-[var(--foreground)]">
              {t("Profile photo", "الصورة الشخصية")}
            </h2>
            <p className="mb-5 mt-1 text-sm text-[var(--muted-foreground)]">
              {canEdit
                ? t(
                    `Tap the photo to choose a new one. It shows on the tree, in search and on ${firstName}'s page.`,
                    `اضغط على الصورة لاختيار صورة جديدة. تظهر على الشجرة وفي البحث وفي صفحة ${firstName}.`,
                  )
                : person.photo_url
                  ? t(`${firstName}'s photo on the tree.`, `صورة ${firstName} على الشجرة.`)
                  : t("No photo yet. An editor can add one.", "لا توجد صورة بعد. يمكن للمحرّر إضافة واحدة.")}
            </p>
            {canEdit ? (
              <AvatarPhotoUpload
                personId={personId}
                currentUrl={person.photo_url ?? null}
                alt={displayName}
                initials={initialsOf(person, lang)}
                fallbackGender={person.gender as "m" | "f" | "unknown" | undefined}
                sizeClass="h-44 w-44"
                wrapperClassName="ring-1 ring-[var(--border)]"
                fallbackClassName={cn("font-heading text-5xl font-bold", tone.className)}
                lang={lang}
              />
            ) : (
              <PersonAvatar
                person={person}
                lang={lang}
                alt={person.photo_url ? displayName : undefined}
                className="h-44 w-44"
                textClassName="font-heading text-5xl"
              />
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AboutRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[13px] text-[var(--muted-foreground)]">{label}</dt>
      <dd dir="auto" className="mt-0.5 font-semibold text-[var(--foreground)]">
        {value}
      </dd>
    </div>
  );
}

function FamilyCircle({ member, lang }: { member: FamilyMember; lang: Lang }) {
  const p = member.person;
  const { given } = getNameParts(p, lang);
  const ringed = member.kin === "partner";
  return (
    <Link
      href={`/person/${encodeURIComponent(p.slug ?? p.id)}`}
      className="flex w-[76px] flex-col items-center gap-1.5 rounded-2xl text-center text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      {/* flex (not inline/block) so the avatar sits exactly centred, with no text-baseline gap under it */}
      <span className={cn("flex rounded-full p-[3px]", ringed ? "bg-[var(--primary)]" : "bg-[#D9C6C0]")}>
        <span className="flex rounded-full border-[3px] border-[var(--card)]">
          <PersonAvatar person={p} lang={lang} className="h-[52px] w-[52px]" textClassName="text-[15px]" />
        </span>
      </span>
      <span className="w-full truncate text-[13px] font-semibold leading-tight">{given || getDisplayName(p, lang)}</span>
      <span className="-mt-1 w-full truncate text-xs text-[var(--muted-foreground)]">{kinLabel(member, lang)}</span>
    </Link>
  );
}

function FamilyGroup({
  title,
  members,
  lang,
  empty,
  action,
}: {
  title: string;
  members: FamilyMember[];
  lang: Lang;
  empty: string | null;
  action?: React.ReactNode;
}) {
  if (members.length === 0 && !empty) return null;
  return (
    <section className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5">
      <h2 className="mb-3 text-[17px] font-bold text-[var(--foreground)]">{title}</h2>
      {members.length > 0 && (
        <ul className="flex flex-col gap-1">
          {members.map((m) => {
            const years = lifeYears(m.person.birth_date, m.person.death_date, lang);
            return (
              <li key={`${m.kin}-${m.person.id}`}>
                <Link
                  href={`/person/${encodeURIComponent(m.person.slug ?? m.person.id)}`}
                  className="-mx-2 flex min-h-[56px] items-center gap-3 rounded-2xl px-2 py-1.5 transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <PersonAvatar person={m.person} lang={lang} className="h-11 w-11" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-[var(--foreground)]">{getDisplayName(m.person, lang)}</span>
                    <span className="block truncate text-[13px] text-[var(--muted-foreground)]">
                      {[kinLabel(m, lang), years, m.inferred ? (lang === "ar" ? "مستنتج من الزواج" : "from the marriage record") : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {members.length === 0 && empty && <p className="text-sm text-[var(--muted-foreground)]">{empty}</p>}
      {action && <div className="mt-3">{action}</div>}
    </section>
  );
}

/** A memory's photos: a small grid; each opens full size in a new tab. */
function MemoryPhotos({ urls, lang }: { urls: string[]; lang: Lang }) {
  if (urls.length === 0) return null;
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  return (
    <ul className={cn("grid gap-2", urls.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3")}>
      {urls.map((url, i) => (
        <li key={url}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-2xl bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs from the private photos bucket */}
            <img
              src={url}
              alt={t(`Photo ${i + 1} of ${urls.length}`, `الصورة ${i + 1} من ${urls.length}`)}
              loading="lazy"
              decoding="async"
              className={cn("w-full object-cover", urls.length === 1 ? "max-h-[420px]" : "aspect-square")}
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
