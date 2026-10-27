"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Search } from "lucide-react";
import { toast } from "sonner";
import {
  cancelMyLinkRequest,
  searchClaimCandidatesAction,
  submitLinkRequest,
} from "@/lib/actions/members";
import { formatPersonSubline } from "@/lib/members/match";
import type { ClaimCandidate, CurrentPerson, PersonSummary } from "@/lib/members/types";
import { cn, getDisplayName } from "@/lib/utils";
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
};

type Step = "find" | "sent" | "linked";

function Progress({ step, label }: { step: 1 | 2; label: string }) {
  return (
    <div className="flex gap-1.5" role="img" aria-label={label}>
      <span className="h-1 flex-1 rounded-sm bg-[var(--primary)]" />
      <span className={cn("h-1 flex-1 rounded-sm", step === 2 ? "bg-[var(--primary)]" : "bg-[#E2D6D2]")} />
    </div>
  );
}

export function WelcomeFlow({ lang, fullName, initialResults, pending, linked }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const firstName = fullName.trim().split(/\s+/)[0] ?? "";

  const [step, setStep] = useState<Step>(linked ? "linked" : pending ? "sent" : "find");
  const [sentFor, setSentFor] = useState<PersonSummary | null>(pending?.person ?? null);

  const [query, setQuery] = useState(fullName);
  const [results, setResults] = useState<ClaimCandidate[]>(initialResults);
  const [searched, setSearched] = useState(true); // initial results came from the server
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [notInTree, setNotInTree] = useState(false);
  const [parentsNote, setParentsNote] = useState("");
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
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, step, retryTick]);

  async function send(personId: string | null, person: PersonSummary | null) {
    setBusyId(personId ?? "none");
    try {
      const res = await submitLinkRequest({
        personId,
        parentsNote: personId ? null : parentsNote,
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

  // ── already linked ─────────────────────────────────────────────────────────
  if (step === "linked" && linked) {
    const name = getDisplayName(linked, lang);
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-5 pb-10 pt-8">
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
      </main>
    );
  }

  // ── request sent ───────────────────────────────────────────────────────────
  if (step === "sent") {
    const name = sentFor ? getDisplayName(sentFor, lang) : null;
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-5 pb-10 pt-7">
        <Progress step={2} label={t("Step 2 of 2", "الخطوة 2 من 2")} />
        <div className="mt-8">
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
        <p className="text-center text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          {t(
            "It usually takes about a day. Until then you can explore the tree and read family stories.",
            "عادةً يستغرق الأمر يومًا تقريبًا. حتى ذلك الحين يمكنك استكشاف الشجرة وقراءة قصص العائلة.",
          )}
        </p>
        <Link href={ONBOARDING_TOUR_HREF} className={cn(pill.primary, "mt-4 min-h-[52px] text-base")}>
          {t("Explore the family tree", "استكشف شجرة العائلة")}
        </Link>
        <button type="button" onClick={wrongPerson} disabled={cancelling} className={cn(pill.link, "self-center")}>
          {cancelling ? <Spinner /> : null}
          {t("I picked the wrong person", "اخترت الشخص الخطأ")}
        </button>
      </main>
    );
  }

  // ── find yourself ──────────────────────────────────────────────────────────
  const count = results.length;
  const statusText = searching
    ? t("Searching…", "جارٍ البحث…")
    : !searched
      ? ""
      : count === 0
        ? t("No one matches yet", "لا توجد نتائج مطابقة بعد")
        : count === 1
          ? t("1 person matches", "شخص واحد مطابق")
          : t(`${count} people match`, `${count} أشخاص مطابقون`);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-5 pb-10 pt-7">
      <Progress step={1} label={t("Step 1 of 2", "الخطوة 1 من 2")} />

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
            "Search your name. An admin will confirm it's you, then the tree will show where you fit.",
            "ابحث عن اسمك. سيؤكد المشرف أنه أنت، ثم تُظهر الشجرة مكانك فيها.",
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
            placeholder={t("Type your name", "اكتب اسمك")}
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
            "Try just your first name, or the spelling a relative would use. Or tell us below.",
            "جرّب اسمك الأول فقط، أو الكتابة التي يستخدمها أقاربك. أو أخبرنا في الأسفل.",
          )}
        </p>
      ) : null}

      <section
        aria-labelledby={`${uid}-nit`}
        className="mt-2 flex flex-col gap-2.5 rounded-[18px] border border-dashed border-[#C9B8B3] bg-white p-4"
      >
        <h2 id={`${uid}-nit`} className="text-[15px] font-bold">
          {t("Not in the tree yet?", "لست في الشجرة بعد؟")}
        </h2>
        <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
          {t("Tell us who your parents are and an admin will add you.", "أخبرنا من هما والداك وسيضيفك المشرف.")}
        </p>

        {notInTree ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(null, null);
            }}
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-parents`} className="text-sm font-semibold">
                {t("Your parents' names (optional)", "اسما والديك (اختياري)")}
              </label>
              <textarea
                id={`${uid}-parents`}
                value={parentsNote}
                onChange={(e) => setParentsNote(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder={t("e.g. Samir Haddad and Dina", "مثال: سمير حداد ودينا")}
                className={cn(fieldClass, "min-h-24 resize-none py-3")}
              />
            </div>
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

      <Link href={ONBOARDING_TOUR_HREF} className={cn(pill.link, "self-center")}>
        {t("Skip for now, just look around", "تخطَّ الآن، أريد التجوّل فقط")}
      </Link>
    </main>
  );
}

function SuccessBadge() {
  return (
    <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-[#E3EEDF] text-[#2F5A27]">
      <Check aria-hidden="true" className="size-11" strokeWidth={2.4} />
    </div>
  );
}
