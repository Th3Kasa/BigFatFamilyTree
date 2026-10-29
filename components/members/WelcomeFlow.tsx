"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clock, Search } from "lucide-react";
import { toast } from "sonner";
import {
  cancelMyLinkRequest,
  searchClaimCandidatesAction,
  submitLinkRequest,
} from "@/lib/actions/members";
import { formatPersonSubline } from "@/lib/members/match";
import { hasFullName } from "@/lib/members/claim-query";
import type { JourneyScreen } from "@/lib/members/journey";
import type { ClaimCandidate, CurrentPerson, MySuggestion, PersonSummary } from "@/lib/members/types";
import { cn, getDisplayName } from "@/lib/utils";
import { InviteCard, SuggestRelativeCard } from "./JourneyCards";
import { cardClass, displayFont, fieldClass, Initials, pill, Spinner } from "./primitives";

/**
 * Where "/welcome" ends. The onboarding tour (built separately) hooks in at this
 * URL: the home page starts the tour when it sees `?tour=1`.
 */
export const ONBOARDING_TOUR_HREF = "/?tour=1";

type Lang = "ar" | "en";

export type PendingClaim = {
  /** The person they asked to be linked to; null = "not in the tree yet". */
  person: PersonSummary | null;
};

type Props = {
  lang: Lang;
  fullName: string;
  initialResults: ClaimCandidate[];
  pending: PendingClaim | null;
  /** Already confirmed as someone in the tree. */
  linked: CurrentPerson | null;
  /** From journeyScreen(): decides the first screen. */
  screen: JourneyScreen;
  /** An admin has let this account in. Unapproved accounts get no "explore" shortcuts. */
  approved: boolean;
  suggestions: MySuggestion[];
  /** First admin's display name, shown after a declined request. */
  adminName: string | null;
};

type Step = "find" | "sent" | "linked" | "declined";

/** Find yourself → Admin confirms → Explore. */
function Progress({ current, lang }: { current: 1 | 2 | 3; lang: Lang }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const steps = [t("Find yourself", "اعثر على نفسك"), t("Admin confirms", "المشرف يؤكد"), t("Explore", "استكشف")];
  return (
    <ol
      className="m-0 flex list-none gap-1.5 p-0"
      aria-label={t(`Step ${current} of 3`, `الخطوة ${current} من 3`)}
    >
      {steps.map((label, i) => {
        const n = i + 1;
        return (
          <li key={label} className="flex flex-1 flex-col gap-1" aria-current={n === current ? "step" : undefined}>
            <span className={cn("h-1 rounded-sm", n <= current ? "bg-[var(--primary)]" : "bg-[#E2D6D2]")} />
            <span
              className={cn(
                "text-xs",
                n === current ? "font-bold text-[#241517]" : "font-medium text-[var(--muted-foreground)]",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function initialStep(p: Pick<Props, "linked" | "pending" | "screen">): Step {
  if (p.linked) return "linked";
  if (p.pending) return "sent";
  if (p.screen === "declined") return "declined";
  return "find";
}

export function WelcomeFlow({
  lang,
  fullName,
  initialResults,
  pending,
  linked,
  screen,
  approved,
  suggestions,
  adminName,
}: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const router = useRouter();
  const firstName = fullName.trim().split(/\s+/)[0] ?? "";

  const [step, setStep] = useState<Step>(initialStep({ linked, pending, screen }));
  const [sentFor, setSentFor] = useState<PersonSummary | null>(pending?.person ?? null);

  const [query, setQuery] = useState(fullName);
  const [results, setResults] = useState<ClaimCandidate[]>(initialResults);
  const [searched, setSearched] = useState(initialResults.length > 0 || fullName.length > 0); // initial results came from the server
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [notInTree, setNotInTree] = useState(false);
  const [fatherName, setFatherName] = useState("");
  const [motherName, setMotherName] = useState("");
  const [invitedBy, setInvitedBy] = useState("");
  const [busyId, setBusyId] = useState<string | "none" | null>(null);
  const [cancelling, startCancel] = useTransition();

  const uid = useId();
  const requestSeq = useRef(0);
  const firstRun = useRef(true);
  const [retryTick, setRetryTick] = useState(0);

  // Debounced live search. Stale responses are dropped via the sequence number.
  useEffect(() => {
    if (step !== "find") return;
    if (firstRun.current && retryTick === 0) {
      firstRun.current = false;
      return; // server already searched for the pre-filled name
    }
    const seq = ++requestSeq.current;
    if (!hasFullName(query)) {
      // Not enough to search on yet: no request, and no stale results.
      setResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const res = await searchClaimCandidatesAction({ query });
        if (seq !== requestSeq.current) return;
        if (res.ok) {
          setResults(res.data ?? []);
          setSearched(true);
        } else {
          setSearchError(res.error);
        }
      } catch {
        if (seq === requestSeq.current) {
          setSearchError(t("Search didn't work. Check your connection and try again.", "لم ينجح البحث. تحقق من اتصالك وحاول مرة أخرى."));
        }
      } finally {
        if (seq === requestSeq.current) setSearching(false);
      }
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, step, retryTick]);

  // While waiting, quietly check whether an admin has answered.
  useEffect(() => {
    if (step !== "sent") return;
    const id = setInterval(() => router.refresh(), 45_000);
    return () => clearInterval(id);
  }, [step, router]);

  async function send(personId: string | null, person: PersonSummary | null) {
    setBusyId(personId ?? "none");
    try {
      const res = await submitLinkRequest({
        personId,
        fatherName: personId ? null : fatherName,
        motherName: personId ? null : motherName,
        invitedBy: personId ? null : invitedBy,
      });
      if (res.ok) {
        setSentFor(person);
        setStep("sent");
        window.scrollTo({ top: 0 });
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error(t("Couldn't send your request. Please try again.", "تعذّر إرسال طلبك. حاول مرة أخرى."));
    } finally {
      setBusyId(null);
    }
  }

  function wrongPerson() {
    startCancel(async () => {
      try {
        const res = await cancelMyLinkRequest();
        if (res.ok) {
          setStep("find");
          setSentFor(null);
          toast.success(t("Request cancelled. Pick again.", "تم إلغاء الطلب. اختر من جديد."));
        } else {
          toast.error(res.error);
        }
      } catch {
        toast.error(t("Couldn't cancel. Please try again.", "تعذّر الإلغاء. حاول مرة أخرى."));
      }
    });
  }

  // ── already linked (approved) ──────────────────────────────────────────────
  if (step === "linked" && linked) {
    const name = getDisplayName(linked, lang);
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-5 pb-10 pt-8">
        <Progress current={3} lang={lang} />
        <SuccessBadge />
        <h1 className="text-center text-[26px] font-bold leading-tight" style={displayFont(lang)}>
          {t(`You're in the tree as ${name}`, `أنت في الشجرة باسم ${name}`)}
        </h1>
        <p className="text-center text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          {t(
            "An admin has confirmed it's you. Find your branch and see who you're related to.",
            "أكّد المشرف أنك هذا الشخص. اعثر على فرعك وتعرّف على أقاربك.",
          )}
        </p>
        <Link href={ONBOARDING_TOUR_HREF} className={cn(pill.primary, "min-h-[52px] text-base")}>
          {t("Explore the family tree", "استكشف شجرة العائلة")}
        </Link>
        <InviteCard lang={lang} />
        <SuggestRelativeCard lang={lang} initial={suggestions} />
      </main>
    );
  }

  // ── request sent: waiting for an admin ─────────────────────────────────────
  if (step === "sent") {
    const name = sentFor ? getDisplayName(sentFor, lang) : null;
    const timeline: Array<{ state: "done" | "now" | "next"; label: string; detail?: string }> = [
      { state: "done", label: t("Request sent", "تم إرسال الطلب") },
      {
        state: "now",
        label: t("An admin confirms", "المشرف يؤكد"),
        detail: t("Usually within a day. We'll email you when you're in.", "عادةً خلال يوم. سنراسلك بالبريد عندما تدخل."),
      },
      { state: "next", label: t("Explore the family tree", "استكشف شجرة العائلة") },
    ];
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-5 pb-10 pt-7">
        <Progress current={2} lang={lang} />
        <div className="mt-6">
          <SuccessBadge />
        </div>
        <h1
          role="status"
          className="text-center text-[26px] font-bold leading-tight"
          style={displayFont(lang)}
        >
          {name
            ? t(`Thanks! An admin will confirm you're ${name}`, `شكرًا لك! سيؤكد المشرف أنك ${name}`)
            : t("Thanks! An admin will add you to the tree", "شكرًا لك! سيضيفك المشرف إلى الشجرة")}
        </h1>

        <ol className={cn(cardClass, "m-0 flex list-none flex-col gap-3 p-4")}>
          {timeline.map((s) => (
            <li key={s.label} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                  s.state === "done" && "bg-[#E3EEDF] text-[#2F5A27]",
                  s.state === "now" && "bg-[#FFF4EC] text-[#9A3412]",
                  s.state === "next" && "border-2 border-[#C9B8B3] text-transparent",
                )}
              >
                {s.state === "done" ? <Check className="size-4" strokeWidth={3} /> : null}
                {s.state === "now" ? <Clock className="size-4" /> : null}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-[15px] font-bold", s.state === "next" && "text-[var(--muted-foreground)]")}>
                  {s.label}
                  <span className="sr-only">
                    {s.state === "done" ? t(" (done)", " (تم)") : s.state === "now" ? t(" (in progress)", " (جارٍ)") : t(" (next)", " (التالي)")}
                  </span>
                </span>
                {s.detail ? <span className="block text-[13px] text-[var(--muted-foreground)]">{s.detail}</span> : null}
              </span>
            </li>
          ))}
        </ol>

        {approved ? (
          <Link href={ONBOARDING_TOUR_HREF} className={cn(pill.primary, "min-h-[52px] text-base")}>
            {t("Explore the family tree", "استكشف شجرة العائلة")}
          </Link>
        ) : null}

        <InviteCard lang={lang} />
        <SuggestRelativeCard lang={lang} initial={suggestions} />

        <button type="button" onClick={wrongPerson} disabled={cancelling} className={cn(pill.link, "self-center")}>
          {cancelling ? <Spinner /> : null}
          {t("I picked the wrong person", "اخترت الشخص الخطأ")}
        </button>
      </main>
    );
  }

  // ── declined: kind message, who to ask, try again ──────────────────────────
  if (step === "declined") {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-5 pb-10 pt-7">
        <Progress current={1} lang={lang} />
        <h1 className="mt-6 text-[26px] font-bold leading-tight" style={displayFont(lang)}>
          {t("We couldn't match that request", "لم نتمكن من مطابقة هذا الطلب")}
        </h1>
        <p className="text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          {t(
            "That's okay. It usually means the name didn't quite line up with the tree. You can try again with another spelling, or pick a different person.",
            "لا بأس. غالبًا لم يتطابق الاسم تمامًا مع الشجرة. يمكنك المحاولة بكتابة أخرى، أو اختيار شخص مختلف.",
          )}
        </p>
        <p className={cn(cardClass, "p-4 text-[15px] leading-relaxed")}>
          {adminName
            ? t(
                `Not sure why? Ask ${adminName}. They can sort it out in a minute.`,
                `لست متأكدًا من السبب؟ اسأل ${adminName}. يمكنه حلّها خلال دقيقة.`,
              )
            : t(
                "Not sure why? Ask the family admins. They can sort it out in a minute.",
                "لست متأكدًا من السبب؟ اسأل مشرفي العائلة. يمكنهم حلّها خلال دقيقة.",
              )}
        </p>
        <button
          type="button"
          onClick={() => {
            setStep("find");
            window.scrollTo({ top: 0 });
          }}
          className={cn(pill.primary, "min-h-[52px] text-base")}
        >
          {t("Try again", "حاول مرة أخرى")}
        </button>
      </main>
    );
  }

  // ── find yourself ──────────────────────────────────────────────────────────
  const count = results.length;
  const statusText = searching
    ? t("Searching…", "جارٍ البحث…")
    : !hasFullName(query)
      ? t("Type your first and family name", "اكتب اسمك الأول واسم العائلة")
      : !searched
      ? ""
      : count === 0
        ? t("No one matches yet", "لا توجد نتائج مطابقة بعد")
        : count === 1
          ? t("1 person matches", "شخص واحد مطابق")
          : t(`${count} people match`, `${count} أشخاص مطابقون`);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-5 pb-10 pt-7">
      <Progress current={1} lang={lang} />

      <div>
        {firstName ? (
          <p className="text-sm font-semibold text-[var(--primary)]">
            {t(`Welcome to the family, ${firstName}`, `أهلًا بك في العائلة يا ${firstName}`)}
          </p>
        ) : null}
        <h1 className="mt-1.5 text-[28px] font-bold leading-[1.15]" style={displayFont(lang)}>
          {t("Let's find you in the family tree", "لنجدك في شجرة العائلة")}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          {t(
            "Type your first and family name. An admin will confirm it's you, then the tree will show where you fit.",
            "اكتب اسمك الأول واسم العائلة. سيؤكد المشرف أنه أنت، ثم تُظهر الشجرة مكانك فيها.",
          )}
        </p>
      </div>

      <div>
        <label htmlFor={`${uid}-q`} className="sr-only">
          {t("Your name", "اسمك")}
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute start-4 top-1/2 size-[18px] -translate-y-1/2 text-[var(--muted-foreground)]"
          />
          <input
            id={`${uid}-q`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={120}
            autoComplete="name"
            enterKeyHint="search"
            placeholder={t("First and family name", "الاسم الأول واسم العائلة")}
            aria-describedby={`${uid}-status`}
            className={cn(fieldClass, "border-[var(--primary)] bg-white ps-11 font-semibold")}
          />
        </div>
      </div>

      <p id={`${uid}-status`} aria-live="polite" className="min-h-5 text-[13px] text-[var(--muted-foreground)]">
        {statusText}
      </p>

      {searchError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#F6D3BC] bg-[#FFF4EC] p-3 text-sm text-[#9A3412]">
          <span className="flex-1">{searchError}</span>
          <button type="button" className={pill.outline} onClick={() => setRetryTick((n) => n + 1)}>
            {t("Try again", "حاول مرة أخرى")}
          </button>
        </div>
      ) : null}

      {searching && results.length === 0 ? (
        <ul aria-hidden="true" className="flex flex-col gap-2.5">
          {[0, 1].map((i) => (
            <li key={i} className={cn(cardClass, "h-[74px] animate-pulse bg-[#F4EDEA]")} />
          ))}
        </ul>
      ) : (
        <ul className={cn("flex list-none flex-col gap-2.5 p-0", searching && "opacity-60")}>
          {results.map((p, i) => {
            const name = getDisplayName(p, lang);
            const busy = busyId === p.id;
            return (
              <li key={p.id} className={cn(cardClass, "flex items-center gap-3 rounded-[18px] p-3")}>
                <Initials name={name} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{name}</span>
                  <span className="block text-[13px] text-[var(--muted-foreground)]">
                    {formatPersonSubline(p, lang) || t("No details yet", "لا توجد تفاصيل بعد")}
                  </span>
                  {p.claimed ? (
                    <span className="mt-0.5 block text-xs font-semibold text-[#9A3412]">
                      {t("Already linked to an account", "مرتبط بحساب بالفعل")}
                    </span>
                  ) : p.dobMatch !== "none" ? (
                    <span className="mt-0.5 block text-xs font-semibold text-[#2F5A27]">
                      {p.dobMatch === "exact"
                        ? t("Same birthday as you", "نفس تاريخ ميلادك")
                        : t("Born the same year as you", "وُلد في نفس سنة ميلادك")}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  disabled={p.claimed || busyId !== null}
                  aria-label={t(`This is me: ${name}`, `هذا أنا: ${name}`)}
                  onClick={() => send(p.id, p)}
                  className={i === 0 && !p.claimed ? pill.primary : pill.outline}
                >
                  {busy ? <Spinner /> : null}
                  {t("This is me", "هذا أنا")}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {searched && !searching && count === 0 && !searchError ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          {t(
            "Try another spelling, the way a relative would write your first and family name. Or tell us below.",
            "جرّب كتابة أخرى، كما يكتب أقاربك اسمك الأول واسم العائلة. أو أخبرنا في الأسفل.",
          )}
        </p>
      ) : null}

      <section
        aria-labelledby={`${uid}-nit`}
        className="mt-2 flex flex-col gap-2.5 rounded-[18px] border border-dashed border-[#C9B8B3] bg-white p-4"
      >
        <h2 id={`${uid}-nit`} className="text-[15px] font-bold">
          {t("I'm not in the tree yet", "لست في الشجرة بعد")}
        </h2>
        <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
          {t(
            "Tell us a little about your family and an admin will add you. Everything below is optional.",
            "أخبرنا قليلًا عن عائلتك وسيضيفك المشرف. كل ما يلي اختياري.",
          )}
        </p>

        {notInTree ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(null, null);
            }}
          >
            <NoteField id={`${uid}-father`} label={t("Your father's name", "اسم والدك")} value={fatherName} onChange={setFatherName} />
            <NoteField id={`${uid}-mother`} label={t("Your mother's name", "اسم والدتك")} value={motherName} onChange={setMotherName} />
            <NoteField
              id={`${uid}-invited`}
              label={t("Who invited you?", "من دعاك؟")}
              value={invitedBy}
              onChange={setInvitedBy}
              placeholder={t("e.g. Aunt Dina", "مثال: عمتي دينا")}
            />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busyId !== null} className={pill.primary}>
                {busyId === "none" ? <Spinner /> : null}
                {t("Send request", "أرسل الطلب")}
              </button>
              <button type="button" onClick={() => setNotInTree(false)} className={pill.ghost}>
                {t("Cancel", "إلغاء")}
              </button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setNotInTree(true)} className={cn(pill.outline, "bg-[#FBF7F4]")}>
            {t("Ask an admin to add me", "اطلب من المشرف إضافتي")}
          </button>
        )}
      </section>

      {approved ? (
        <Link href={ONBOARDING_TOUR_HREF} className={cn(pill.link, "self-center")}>
          {t("Skip for now, just look around", "تخطَّ الآن، أريد التجوّل فقط")}
        </Link>
      ) : null}
    </main>
  );
}

function NoteField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={120}
        autoComplete="off"
        placeholder={placeholder}
        className={fieldClass}
      />
    </div>
  );
}

function SuccessBadge() {
  return (
    <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-[#E3EEDF] text-[#2F5A27]">
      <Check aria-hidden="true" className="size-11" strokeWidth={2.4} />
    </div>
  );
}
