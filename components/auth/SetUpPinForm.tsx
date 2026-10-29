"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { pill, Spinner } from "@/components/members/primitives";
import { IdentityFields, type Identity } from "@/components/auth/IdentityFields";
import { PinField } from "@/components/auth/PinField";
import { ErrorNote } from "@/components/auth/SignupForm";
import { setUpMyPinAction } from "@/lib/actions/pin";
import { firstIssueCode, pinMessage } from "@/lib/auth/pin-validation";
import { pinSetupSchema, type SetupMode } from "@/lib/auth/pin-setup";

type Props = {
  lang: "ar" | "en";
  mode: SetupMode;
  /** Prefilled from the profile (first/last name, or full_name split; date of birth). */
  initial: Identity;
};

/**
 * "convert": an email account switches to name + birthday + PIN sign-in.
 * "recover": a PIN account that signed in with an email link sets a new PIN
 * without the old one (name and birthday stay as they are, so they are not asked).
 * The server decides who may do either; this form only collects the input.
 */
export function SetUpPinForm({ lang, mode, initial }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const router = useRouter();
  const [who, setWho] = useState<Identity>(initial);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const input = {
      firstName: who.firstName,
      lastName: who.lastName,
      dateOfBirth: who.dob,
      pin,
      pinConfirm,
    };
    const parsed = pinSetupSchema.safeParse(input);
    if (!parsed.success) {
      setErrorMsg(pinMessage(firstIssueCode(parsed.error), lang));
      return;
    }
    setLoading(true);
    try {
      const res = await setUpMyPinAction(input);
      if (res.ok) {
        toast.success(
          mode === "convert"
            ? t("Done! Next time, sign in with your name, birthday and PIN.", "تم! في المرة القادمة ادخل باسمك وتاريخ ميلادك ورمزك السري.")
            : t("Your new PIN is set.", "تم تعيين رمزك السري الجديد."),
        );
        router.push(res.redirectTo);
        router.refresh();
        return;
      }
      setErrorMsg(res.error);
    } catch {
      setErrorMsg(pinMessage("failed", lang));
    }
    setPin("");
    setPinConfirm("");
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {mode === "convert" ? (
        <IdentityFields
          lang={lang}
          value={who}
          onChange={setWho}
          disabled={loading}
          dobHint={t("Your birthday is part of how you'll sign in.", "تاريخ ميلادك جزء من طريقة دخولك.")}
        />
      ) : (
        <p className="rounded-2xl bg-[var(--muted)] px-4 py-3 text-sm">
          {t("You'll keep signing in as", "ستواصل الدخول باسم")}{" "}
          <strong>
            {who.firstName} {who.lastName}
          </strong>
          .
        </p>
      )}
      <PinField
        lang={lang}
        name="new-pin"
        label={t("Your new 4-digit PIN", "رمزك الجديد (٤ أرقام)")}
        hint={t("Avoid 1234 or 1111.", "تجنّب 1234 أو 1111.")}
        length={4}
        autoComplete="new-password"
        value={pin}
        onChange={setPin}
        disabled={loading}
      />
      <PinField
        lang={lang}
        name="new-pin-confirm"
        label={t("Type the new PIN again", "أعد كتابة الرمز الجديد")}
        length={4}
        autoComplete="new-password"
        value={pinConfirm}
        onChange={setPinConfirm}
        disabled={loading}
      />
      {mode === "convert" ? (
        <p className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
          {t(
            "After this you'll sign in with your name, birthday and PIN. Your email password will stop working, but you can still get in with an email link from \"Admins: sign in with email\".",
            "بعد ذلك ستدخل باسمك وتاريخ ميلادك ورمزك السري. ستتوقف كلمة مرور بريدك عن العمل، لكن يمكنك الدخول برابط البريد من «للمشرفين: سجّل الدخول بالبريد».",
          )}
        </p>
      ) : null}
      <ErrorNote message={errorMsg} />
      <button type="submit" disabled={loading} className={cn(pill.primary, "min-h-[52px] text-base")}>
        {loading ? <Spinner /> : null}
        {loading
          ? t("Saving…", "جارٍ الحفظ…")
          : mode === "convert"
            ? t("Switch to PIN sign-in", "انتقل إلى الدخول بالرمز")
            : t("Set my new PIN", "عيّن رمزي الجديد")}
      </button>
    </form>
  );
}
