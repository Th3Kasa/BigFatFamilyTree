"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { makeNewFamilyPin } from "@/lib/actions/pin";
import { familyInviteMessage } from "@/lib/members/family-invite";
import { cn } from "@/lib/utils";
import { cardClass, pill, Spinner } from "./primitives";

type Props = {
  lang: "ar" | "en";
  /** The current family PIN (6 digits). */
  pin: string;
};

/**
 * Owner only. The family PIN is the 6-digit invite code shared in the family
 * group: it proves a joiner is family, nothing more (new accounts still wait for
 * approval). A new PIN only affects NEW joins; members stay signed in.
 */
export function FamilyPinCard({ lang, pin: initialPin }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const router = useRouter();
  const [pin, setPin] = useState(initialPin);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState<"pin" | "message" | null>(null);
  const message = familyInviteMessage(pin, lang);

  async function copy(what: "pin" | "message", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error(t("Couldn't copy. Select the text and copy it by hand.", "تعذّر النسخ. حدّد النص وانسخه يدويًا."));
    }
  }

  async function makeNew() {
    setBusy(true);
    try {
      const res = await makeNewFamilyPin();
      if (res.ok && res.data) {
        setPin(res.data.pin);
        setConfirming(false);
        toast.success(t("New family PIN is ready.", "رمز العائلة الجديد جاهز."));
        router.refresh();
      } else if (!res.ok) {
        toast.error(res.error);
      }
    } catch {
      toast.error(t("Something went wrong. Please try again.", "حدث خطأ ما. حاول مرة أخرى."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="family-pin-h" className={cn(cardClass, "flex flex-col gap-4 p-4 sm:p-5")}>
      <div>
        <h2 id="family-pin-h" className="text-base font-bold">
          {t("Family PIN", "رمز العائلة")}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {t(
            "Share this in the family group. It only proves someone is family; new accounts still wait for your approval.",
            "شاركه في مجموعة العائلة. هو يثبت فقط أن الشخص من العائلة؛ والحسابات الجديدة تبقى بانتظار موافقتك.",
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <output
          dir="ltr"
          aria-label={t("Current family PIN", "رمز العائلة الحالي")}
          className="rounded-2xl bg-[#F4EDEA] px-5 py-2 text-3xl font-bold tracking-[0.3em] text-[#241517]"
        >
          {pin}
        </output>
        <button type="button" onClick={() => copy("pin", pin)} className={pill.outline}>
          {copied === "pin" ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
          {copied === "pin" ? t("Copied", "تم النسخ") : t("Copy", "انسخ")}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">{t("Ready for WhatsApp", "جاهز لواتساب")}</p>
        <p className="rounded-2xl bg-[#F4EDEA] px-4 py-3 text-sm text-[#241517]" dir={lang === "ar" ? "rtl" : "ltr"}>
          {message}
        </p>
        <div>
          <button type="button" onClick={() => copy("message", message)} className={pill.outline}>
            {copied === "message" ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
            {copied === "message" ? t("Copied", "تم النسخ") : t("Copy message", "انسخ الرسالة")}
          </button>
        </div>
      </div>

      <div className="border-t border-[#ECE2DE] pt-4">
        {confirming ? (
          <div role="alertdialog" aria-label={t("Make a new family PIN?", "إنشاء رمز عائلة جديد؟")} className="flex flex-col gap-3">
            <p className="text-sm font-medium">
              {t(
                "The old PIN stops working for new people joining. Everyone already in stays signed in and keeps their own PIN.",
                "يتوقف الرمز القديم عن العمل للمنضمّين الجدد. من هم داخل الموقع بالفعل يبقون مسجّلين ويحتفظون برموزهم.",
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={makeNew} disabled={busy} className={pill.primary}>
                {busy ? <Spinner /> : null}
                {t("Yes, make a new PIN", "نعم، أنشئ رمزًا جديدًا")}
              </button>
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={pill.ghost}>
                {t("Cancel", "إلغاء")}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className={pill.outline}>
            {t("Make a new family PIN", "أنشئ رمز عائلة جديدًا")}
          </button>
        )}
      </div>
    </section>
  );
}
