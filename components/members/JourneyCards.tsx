"use client";

import { useId, useState, useSyncExternalStore, useTransition } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { suggestRelative } from "@/lib/actions/members";
import { SUGGESTION_STATUS_LABEL } from "@/lib/members/suggestions";
import type { MySuggestion } from "@/lib/members/types";
import { cn } from "@/lib/utils";
import { cardClass, displayFont, fieldClass, pill, Spinner } from "./primitives";

type Lang = "ar" | "en";

export const SITE_URL = "https://www.bigfatfamilytree.com.au";

/** The message shared with a relative (WhatsApp, share sheet, copy). */
export function inviteMessage(lang: Lang): string {
  return lang === "ar" ? `انضم إلى شجرة عائلتنا: ${SITE_URL}` : `Join our family tree: ${SITE_URL}`;
}

export function whatsappHref(lang: Lang): string {
  return `https://wa.me/?text=${encodeURIComponent(inviteMessage(lang))}`;
}

const noopSubscribe = () => () => {};
function useCanShare(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  );
}

// ── Invite family ────────────────────────────────────────────────────────────

/** Share the site link: the system share sheet when there is one, else copy + WhatsApp. */
export function InviteCard({ lang }: { lang: Lang }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const canShare = useCanShare();
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      await navigator.share({
        title: "Big Fat Family",
        text: inviteMessage(lang),
        url: SITE_URL,
      });
    } catch (e) {
      // Closing the share sheet is not an error.
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error(t("Couldn't open sharing. Try copying the link.", "تعذّر فتح المشاركة. جرّب نسخ الرابط."));
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(SITE_URL);
      setCopied(true);
      toast.success(t("Link copied", "تم نسخ الرابط"));
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error(t(`Copy this link: ${SITE_URL}`, `انسخ هذا الرابط: ${SITE_URL}`));
    }
  }

  return (
    <section id="invite" aria-labelledby="invite-h" className={cn(cardClass, "scroll-mt-20 p-4")}>
      <h2 id="invite-h" className="text-[17px] font-bold" style={displayFont(lang)}>
        {t("Invite family", "ادعُ العائلة")}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">
        {t(
          "Know a relative who isn't here yet? Send them the link. An admin will welcome them too.",
          "تعرف قريبًا ليس هنا بعد؟ أرسل له الرابط وسيرحّب به المشرف أيضًا.",
        )}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {canShare ? (
          <button type="button" onClick={share} className={pill.primary}>
            <Share2 aria-hidden="true" className="size-4" />
            {t("Share the link", "شارك الرابط")}
          </button>
        ) : null}
        <button type="button" onClick={copy} className={canShare ? pill.outline : pill.primary}>
          {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
          {copied ? t("Copied", "تم النسخ") : t("Copy link", "انسخ الرابط")}
        </button>
        <a href={whatsappHref(lang)} target="_blank" rel="noopener noreferrer" className={pill.outline}>
          {t("Send on WhatsApp", "أرسل عبر واتساب")}
          <span className="sr-only">{t(" (opens in a new tab)", " (يفتح في نافذة جديدة)")}</span>
        </a>
      </div>
    </section>
  );
}

// ── Suggest a relative ───────────────────────────────────────────────────────

/** "Suggest a relative": for people who are not on the site (or in the tree) yet. */
export function SuggestRelativeCard({ lang, initial }: { lang: Lang; initial: MySuggestion[] }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const uid = useId();
  const [sent, setSent] = useState<MySuggestion[]>(initial);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startSend] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError(t("Enter their name.", "أدخل اسمه."));
      return;
    }
    if (relation.trim().length < 2) {
      setError(t("Tell us how they're related to you.", "أخبرنا ما صلة قرابته بك."));
      return;
    }
    startSend(async () => {
      try {
        const res = await suggestRelative({ name, relation, note: note || null });
        if (res.ok) {
          toast.success(res.message ?? t("Sent.", "تم الإرسال."));
          setSent((s) => [
            { id: `local-${s.length}-${name}`, name: name.trim(), relation: relation.trim(), status: "pending", createdAt: new Date().toISOString() },
            ...s,
          ]);
          setName("");
          setRelation("");
          setNote("");
        } else {
          setError(res.error);
        }
      } catch {
        setError(t("Couldn't send that. Please try again.", "تعذّر الإرسال. حاول مرة أخرى."));
      }
    });
  }

  return (
    <section id="suggest" aria-labelledby={`${uid}-h`} className={cn(cardClass, "scroll-mt-20 p-4")}>
      <h2 id={`${uid}-h`} className="text-[17px] font-bold" style={displayFont(lang)}>
        {t("Suggest a relative", "اقترح قريبًا")}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">
        {t(
          "Someone missing from the tree? Tell us who they are and an admin will add them.",
          "هناك من ينقص الشجرة؟ أخبرنا من هو وسيضيفه المشرف.",
        )}
      </p>

      <form onSubmit={submit} className="mt-3 flex flex-col gap-3" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-name`} className="text-sm font-semibold">
            {t("Their name", "اسمه")}
          </label>
          <input
            id={`${uid}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            autoComplete="off"
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-rel`} className="text-sm font-semibold">
            {t("How are they related to you?", "ما صلة قرابته بك؟")}
          </label>
          <input
            id={`${uid}-rel`}
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
            maxLength={120}
            autoComplete="off"
            placeholder={t("e.g. my mother's cousin", "مثال: ابن خالة أمي")}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-note`} className="text-sm font-semibold">
            {t("Anything else? (optional)", "أي شيء آخر؟ (اختياري)")}
          </label>
          <textarea
            id={`${uid}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            className={cn(fieldClass, "min-h-20 resize-none py-3")}
          />
        </div>
        {error ? (
          <p role="alert" className="rounded-2xl border border-[#F6D3BC] bg-[#FFF4EC] px-4 py-3 text-sm font-medium text-[#9A3412]">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className={cn(pill.primary, "self-start")}>
          {busy ? <Spinner /> : null}
          {t("Send suggestion", "أرسل الاقتراح")}
        </button>
      </form>

      {sent.length > 0 ? (
        <div className="mt-4 border-t border-[#ECE2DE] pt-3">
          <h3 className="text-sm font-bold">{t("Your suggestions", "اقتراحاتك")}</h3>
          <ul className="mt-1.5 flex list-none flex-col gap-1.5 p-0">
            {sent.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold">{s.name}</span>{" "}
                  <span className="text-[var(--muted-foreground)]">({s.relation})</span>
                </span>
                <span className="text-xs font-semibold text-[var(--muted-foreground)]">
                  {t(SUGGESTION_STATUS_LABEL[s.status].en, SUGGESTION_STATUS_LABEL[s.status].ar)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
