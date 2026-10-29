"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, CalendarPlus, ImagePlus, PenLine, Search, ShieldQuestion, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { shell, useShell, type ContextPerson } from "@/lib/client/shell-store";
import { directoryName, matchPeople, useFamilyDirectory } from "@/lib/client/family-directory";
import { lifeYears } from "@/lib/people/display";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import type { Lang } from "@/lib/lang/server";

type Action = "event" | "photos" | "memory";

type Step = { kind: "menu" } | { kind: "pick"; then: Action | "context" };

function hrefFor(action: Action, p: { id: string; slug: string | null }) {
  const ref = encodeURIComponent(p.slug ?? p.id);
  if (action === "event") return `/person/${ref}/event/new`;
  if (action === "memory") return `/person/${ref}/event/new?kind=memory`;
  return `/person/${ref}?tab=photos`;
}

/**
 * The single "Add" entry point (top-bar button and the mobile bar's round +).
 * Bottom sheet on phones, centred dialog on larger screens.
 *
 * Roles follow the database rules: only editors and admins may create people,
 * events (RLS `events_write_editor`) and photos (storage `photos_editor_insert`),
 * so viewers get a friendly note instead of tiles that would fail.
 */
export function AddMenu({ lang, role }: { lang: Lang; role?: string }) {
  const open = useShell((s) => s.addOpen);
  const pagePerson = useShell((s) => s.pagePerson);
  const canvasPerson = useShell((s) => s.canvasPerson);
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "menu" });
  const [override, setOverride] = useState<ContextPerson | null>(null);
  const [query, setQuery] = useState("");
  const dir = useFamilyDirectory(open && step.kind === "pick");
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const canEdit = role === "admin" || role === "editor";
  const context = override ?? pagePerson ?? canvasPerson;

  const people = useMemo(() => {
    if (!dir) return [];
    if (query.trim()) return matchPeople(dir.people, query, 50);
    return [...dir.people]
      .sort((a, b) => directoryName(a, lang).localeCompare(directoryName(b, lang), lang))
      .slice(0, 50);
  }, [dir, query, lang]);

  function reset() {
    setStep({ kind: "menu" });
    setOverride(null);
    setQuery("");
  }

  function onOpenChange(next: boolean) {
    shell.setAddOpen(next);
    if (!next) reset();
  }

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  function runAction(action: Action) {
    if (context) go(hrefFor(action, context));
    else setStep({ kind: "pick", then: action });
  }

  function pick(p: { id: string; slug: string | null; name: string }) {
    if (step.kind !== "pick") return;
    if (step.then === "context") {
      setOverride(p);
      setStep({ kind: "menu" });
      setQuery("");
      return;
    }
    go(hrefFor(step.then, p));
  }

  const Back = lang === "ar" ? ArrowRight : ArrowLeft;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(36_21_23/0.45)]" />
        <DialogPrimitive.Content
          dir={lang === "ar" ? "rtl" : "ltr"}
          aria-describedby={undefined}
          className={cn(
            "fixed z-50 flex max-h-[90svh] flex-col gap-4 overflow-y-auto bg-[var(--card)] shadow-[var(--shadow-deep)] focus:outline-none",
            // Phone: bottom sheet
            "inset-x-0 bottom-0 rounded-t-[28px] px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-2.5",
            // Tablet and up: centred dialog
            "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[min(30rem,calc(100vw-2rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[28px] md:p-6",
          )}
        >
          <span aria-hidden className="mx-auto h-[5px] w-11 shrink-0 rounded-full bg-[var(--border-strong)] md:hidden" />

          <div className="flex items-center justify-between gap-3">
            {step.kind === "pick" ? (
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep({ kind: "menu" });
                    setQuery("");
                  }}
                  aria-label={t("Back", "رجوع")}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <Back className="h-5 w-5" aria-hidden />
                </button>
                <DialogPrimitive.Title className="font-heading truncate text-2xl font-bold text-[var(--foreground)]">
                  {t("Who is it about?", "عمّن هذا؟")}
                </DialogPrimitive.Title>
              </div>
            ) : (
              <DialogPrimitive.Title className="font-heading text-2xl font-bold text-[var(--foreground)]">
                {t("Add to the family", "أضف إلى العائلة")}
              </DialogPrimitive.Title>
            )}
            <DialogPrimitive.Close
              aria-label={t("Close", "إغلاق")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <X className="h-5 w-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          {!canEdit ? (
            <ViewerNote lang={lang} onFinder={() => go("/relationships")} />
          ) : step.kind === "menu" ? (
            <>
              <p className="text-sm text-[var(--muted-foreground)]">
                {context ? (
                  <>
                    {t("Adding to ", "الإضافة إلى ")}
                    <strong className="font-semibold text-[var(--foreground)]">{context.name}</strong>
                    {" · "}
                    <button
                      type="button"
                      onClick={() => setStep({ kind: "pick", then: "context" })}
                      className="rounded font-semibold text-[var(--primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      {t("change", "تغيير")}
                    </button>
                  </>
                ) : (
                  t("Pick what you'd like to add. We'll ask who it's about.", "اختر ما تريد إضافته، وسنسألك عمّن يكون.")
                )}
              </p>

              <div className="grid grid-cols-2 gap-2.5">
                <Tile
                  icon={<UserPlus className="h-5 w-5" aria-hidden />}
                  tone={{ bg: "#DDE7F1", fg: "#1F4467" }}
                  title={t("A person", "شخص")}
                  hint={t("Someone new in the family", "فرد جديد في العائلة")}
                  onClick={() => go("/person/new")}
                />
                <Tile
                  icon={<CalendarPlus className="h-5 w-5" aria-hidden />}
                  tone={{ bg: "#E3EEDF", fg: "#2F5A27" }}
                  title={t("A life event", "حدث في الحياة")}
                  hint={t("Birth, wedding, move, graduation", "ميلاد، زواج، انتقال، تخرّج")}
                  onClick={() => runAction("event")}
                />
                <Tile
                  icon={<ImagePlus className="h-5 w-5" aria-hidden />}
                  tone={{ bg: "#EFE3D3", fg: "#6A4A1F" }}
                  title={t("Upload photos", "رفع صور")}
                  hint={t("A profile photo for someone", "صورة شخصية لأحد الأفراد")}
                  onClick={() => runAction("photos")}
                />
                <Tile
                  icon={<PenLine className="h-5 w-5" aria-hidden />}
                  tone={{ bg: "#F7E7EB", fg: "#7A1631" }}
                  title={t("Write a memory", "اكتب ذكرى")}
                  hint={t("A story or moment you remember", "قصة أو لحظة تتذكرها")}
                  onClick={() => runAction("memory")}
                />
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-col gap-3">
              <label className="flex h-11 items-center gap-2.5 rounded-full bg-[var(--input)] px-4 text-[var(--muted-foreground)] focus-within:bg-[var(--card)] focus-within:ring-2 focus-within:ring-[var(--ring)]">
                <Search className="h-[18px] w-[18px] shrink-0" aria-hidden />
                <span className="sr-only">{t("Search by name", "ابحث بالاسم")}</span>
                <input
                  type="search"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("Search by name", "ابحث بالاسم")}
                  autoComplete="off"
                  className="h-full min-w-0 flex-1 bg-transparent text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
                />
              </label>
              <div className="max-h-[50svh] overflow-y-auto md:max-h-[22rem]">
                {dir === null ? (
                  <p role="status" className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                    {t("Loading the family…", "جارٍ تحميل العائلة…")}
                  </p>
                ) : people.length === 0 ? (
                  <p role="status" className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                    {query.trim()
                      ? t(`No one called “${query.trim()}”.`, `لا يوجد أحد باسم «${query.trim()}».`)
                      : t("Add a person first.", "أضف شخصًا أولًا.")}
                  </p>
                ) : (
                  <ul className="flex flex-col">
                    {people.map((p) => {
                      const name = directoryName(p, lang);
                      const years = lifeYears(p.birth_date, p.death_date, lang);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => pick({ id: p.id, slug: p.slug, name })}
                            className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-start transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                          >
                            <PersonAvatar person={p} lang={lang} className="h-10 w-10" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-semibold text-[var(--foreground)]">{name}</span>
                              {years && <span className="block text-xs text-[var(--muted-foreground)]">{years}</span>}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Tile({
  icon,
  tone,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  tone: { bg: string; fg: string };
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[112px] flex-col items-start justify-between gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--background)] p-3.5 text-start text-[var(--foreground)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: tone.bg, color: tone.fg }}>
        {icon}
      </span>
      <span>
        <span className="block text-[15px] font-bold leading-tight">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-[var(--muted-foreground)]">{hint}</span>
      </span>
    </button>
  );
}

function ViewerNote({ lang, onFinder }: { lang: Lang; onFinder: () => void }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--background)] p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
          <ShieldQuestion className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-[15px] font-semibold text-[var(--foreground)]">{t("Ask an admin to add things", "اطلب من المشرف إضافة ما تريد")}</p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">
            {t(
              "Your account can explore the whole family. To add people, photos or memories, ask one of the family admins to make you an editor.",
              "يمكنك من حسابك استكشاف العائلة كلها. لإضافة أشخاص أو صور أو ذكريات، اطلب من أحد مشرفي العائلة أن يجعلك محرّرًا.",
            )}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onFinder}
        className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--card)] px-5 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        {t("Explore how you're related", "اكتشف صلة القرابة")}
      </button>
    </div>
  );
}
