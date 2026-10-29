"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { pill, Spinner } from "@/components/members/primitives";
import { PinField } from "@/components/auth/PinField";
import { ErrorNote } from "@/components/auth/SignupForm";
import { changeMyPinAction } from "@/lib/actions/pin";
import { changePinSchema, firstIssueCode, pinMessage } from "@/lib/auth/pin-validation";

/** Old PIN + new PIN twice. Only for PIN accounts (the server checks that again). */
export function ChangePinForm({ lang }: { lang: "ar" | "en" }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const router = useRouter();
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const input = { oldPin, newPin, newPinConfirm };
    const parsed = changePinSchema.safeParse(input);
    if (!parsed.success) {
      setErrorMsg(pinMessage(firstIssueCode(parsed.error), lang));
      return;
    }
    setLoading(true);
    try {
      const res = await changeMyPinAction(input);
      if (res.ok) {
        toast.success(t("Your PIN is changed.", "تم تغيير رمزك السري."));
        router.push("/");
        router.refresh();
        return;
      }
      setErrorMsg(res.error);
    } catch {
      setErrorMsg(pinMessage("failed", lang));
    }
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <PinField
        lang={lang}
        name="current-pin"
        label={t("Your current PIN", "رمزك الحالي")}
        length={4}
        autoComplete="current-password"
        value={oldPin}
        onChange={setOldPin}
        disabled={loading}
      />
      <PinField
        lang={lang}
        name="new-pin"
        label={t("Your new 4-digit PIN", "رمزك الجديد (٤ أرقام)")}
        hint={t("Avoid 1234 or 1111.", "تجنّب 1234 أو 1111.")}
        length={4}
        autoComplete="new-password"
        value={newPin}
        onChange={setNewPin}
        disabled={loading}
      />
      <PinField
        lang={lang}
        name="new-pin-confirm"
        label={t("Type the new PIN again", "أعد كتابة الرمز الجديد")}
        length={4}
        autoComplete="new-password"
        value={newPinConfirm}
        onChange={setNewPinConfirm}
        disabled={loading}
      />
      <ErrorNote message={errorMsg} />
      <button type="submit" disabled={loading} className={cn(pill.primary, "min-h-[52px] text-base")}>
        {loading ? <Spinner /> : null}
        {loading ? t("Saving…", "جارٍ الحفظ…") : t("Change my PIN", "غيّر رمزي السري")}
      </button>
    </form>
  );
}
