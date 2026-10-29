"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Nunito } from "next/font/google";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Search } from "lucide-react";
import { shell, useShell } from "@/lib/client/shell-store";
import { BigFatMascot } from "./BigFatMascot";

// The friendly rounded face is for the tour only; Arabic falls through to the app's Arabic font.
const nunito = Nunito({ subsets: ["latin"], weight: ["600", "700", "800", "900"], display: "swap" });

const DONE_KEY = "bft.tour.completed";
const LAST = 5;

const noopSubscribe = () => () => {};
function readCompleted() {
  try {
    return localStorage.getItem(DONE_KEY) != null;
  } catch {
    return false;
  }
}

/**
 * Six-step welcome tour hosted by Big Fat the cow. Opens when the address has
 * `?tour=1` (where /welcome lands) unless it was finished before, or any time
 * from "Replay the tour" in the user menu. Closing removes `tour=1` from the
 * address and remembers completion, so it never re-opens on its own.
 */
export function WelcomeTour({ lang }: { lang: "ar" | "en" }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const completed = useSyncExternalStore(noopSubscribe, readCompleted, () => true);
  const replay = useShell((s) => s.tourOpen);
  const [closed, setClosed] = useState(false);
  const wanted = params.get("tour") === "1";
  const open = replay || (wanted && !completed && !closed);

  function close() {
    try {
      localStorage.setItem(DONE_KEY, String(Date.now()));
    } catch {
      // Storage blocked: the tour may offer itself again next time, which is harmless.
    }
    setClosed(true);
    shell.setTourOpen(false);
    if (wanted) {
      const next = new URLSearchParams(params.toString());
      next.delete("tour");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }

  if (!open) return null;
  return <TourDialog lang={lang} onClose={close} />;
}

function TourDialog({ lang, onClose }: { lang: "ar" | "en"; onClose: () => void }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const go = (next: number) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
  };
  const ctas = [t("Let's go", "لنبدأ"), t("Next", "التالي"), t("Next", "التالي"), t("Next", "التالي"), t("Next", "التالي"), t("Start exploring", "ابدأ الاستكشاف")];
  const rtl = lang === "ar" ? -1 : 1;

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          dir={lang === "ar" ? "rtl" : "ltr"}
          aria-describedby={undefined}
          className="fixed inset-0 z-[80] overflow-y-auto bg-white text-[#241517] focus:outline-none"
          style={{ fontFamily: `${nunito.style.fontFamily}, var(--font-arabic), system-ui, sans-serif` }}
        >
          <DialogPrimitive.Title className="sr-only">
            {t(`Welcome tour, step ${step + 1} of 6`, `جولة الترحيب، الخطوة ${step + 1} من 6`)}
          </DialogPrimitive.Title>
          <div className="mx-auto flex min-h-full w-full max-w-[440px] flex-col">
            <header className="flex items-center gap-3.5 px-5 pb-2 pt-5">
              <DialogPrimitive.Close
                aria-label={t("Close the tour", "إغلاق الجولة")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[26px] font-extrabold text-[#6B5B5E] hover:bg-[#F4EDEA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A1631]"
              >
                <span aria-hidden>×</span>
              </DialogPrimitive.Close>
              <div
                role="progressbar"
                aria-label={t("Tour progress", "تقدّم الجولة")}
                aria-valuemin={1}
                aria-valuemax={6}
                aria-valuenow={step + 1}
                aria-valuetext={t(`Step ${step + 1} of 6`, `الخطوة ${step + 1} من 6`)}
                className="h-4 flex-1 overflow-hidden rounded-full bg-[#EFE7E4]"
              >
                <div
                  className="h-full rounded-full bg-[#7A1631] shadow-[inset_0_-4px_0_rgba(0,0,0,0.12)] transition-[width] duration-[450ms] ease-[cubic-bezier(.3,1.3,.5,1)]"
                  style={{ width: `${Math.max(6, Math.round((step / LAST) * 100))}%` }}
                />
              </div>
            </header>

            <div className="relative flex-1 overflow-hidden" aria-live="polite">
              <AnimatePresence mode="wait" initial={false} custom={dir}>
                <motion.main
                  key={step}
                  custom={dir}
                  initial={reduce ? false : { opacity: 0, x: 40 * dir * rtl }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduce ? undefined : { opacity: 0, x: -40 * dir * rtl }}
                  transition={{ duration: reduce ? 0 : 0.25, ease: "easeOut" }}
                  className="flex h-full flex-col px-6 py-4"
                >
                  <Step step={step} lang={lang} />
                </motion.main>
              </AnimatePresence>
            </div>

            <footer className="flex flex-col gap-2.5 border-t-2 border-[#F1E8E5] px-6 pb-7 pt-4">
              <button
                type="button"
                autoFocus
                onClick={() => (step >= LAST ? onClose() : go(step + 1))}
                className="tour-btn3d h-14 rounded-2xl bg-[#7A1631] text-lg font-black uppercase tracking-[0.04em] text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#7A1631]/40"
              >
                {ctas[step]}
              </button>
              {step > 0 && step < LAST && (
                <button
                  type="button"
                  onClick={() => go(step - 1)}
                  className="h-11 rounded-xl text-[15px] font-extrabold uppercase tracking-[0.04em] text-[#6B5B5E] hover:bg-[#F4EDEA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A1631]"
                >
                  {t("Back", "رجوع")}
                </button>
              )}
            </footer>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

const h1 = "tour-rise mt-2 text-[28px] font-black leading-[1.15]";
const body = "tour-rise2 m-0 text-lg font-bold leading-[1.45] text-[#3D2B2E]";
const dot = "flex items-center justify-center rounded-full font-black";

function Step({ step, lang }: { step: number; lang: "ar" | "en" }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  switch (step) {
    case 0:
      return (
        <div className="flex flex-col items-center gap-5 pt-6 text-center">
          <p className="tour-pop max-w-[290px] rounded-[18px] border-2 border-[#ECE2DE] px-4 py-4 text-xl font-extrabold leading-snug">
            {t("Hi! I'm Big Fat. Let me show you around your family tree.", "مرحبًا! أنا بيغ فات. دعني أعرّفك على شجرة عائلتك.")}
          </p>
          <BigFatMascot mood="hello" />
          <p className="tour-rise2 text-[17px] font-bold text-[#6B5B5E]">{t("It takes about 1 minute.", "يستغرق الأمر دقيقة تقريبًا.")}</p>
        </div>
      );
    case 1:
      return (
        <div className="flex flex-col gap-4">
          <h1 className={h1}>{t("This is your family tree", "هذه شجرة عائلتك")}</h1>
          <div aria-hidden className="tour-pop relative h-[270px] rounded-[22px] border-2 border-[#ECE2DE] bg-[#FBF7F4]" dir="ltr">
            <span className="absolute end-2.5 top-2.5 z-10 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-[#6B5B5E] ring-1 ring-[#ECE2DE]">{t("Example", "مثال")}</span>
            <div className="absolute left-1/2 top-[22px] flex -translate-x-1/2 gap-3.5">
              <span className={`${dot} h-[60px] w-[60px] bg-[#DDE7F1] text-[#1F4467]`}>EM</span>
              <span className={`${dot} h-[60px] w-[60px] bg-[#EFE3D3] text-[#6A4A1F]`}>HM</span>
            </div>
            <div className="absolute left-1/2 top-[82px] h-10 w-[3px] -translate-x-1/2 bg-[#B5A6A8]" />
            <div className="absolute left-1/4 right-1/4 top-[122px] h-[3px] bg-[#B5A6A8]" />
            <div className="absolute left-1/4 top-[122px] h-[26px] w-[3px] bg-[#B5A6A8]" />
            <div className="absolute right-1/4 top-[122px] h-[26px] w-[3px] bg-[#B5A6A8]" />
            <span className={`${dot} absolute left-[calc(25%-34px)] top-[150px] h-[70px] w-[70px] bg-[#E9D4C4] text-[#5C3A21] shadow-[0_0_0_4px_#fff,0_0_0_7px_#7A1631]`}>
              {t("You", "أنت")}
            </span>
            <span className={`${dot} absolute right-[calc(25%-30px)] top-[150px] h-[62px] w-[62px] bg-[#DDE7F1] text-[#1F4467]`}>AM</span>
            <span className="tour-bob absolute left-[calc(25%+16px)] top-[206px] h-[34px] w-[34px] rounded-full border-[3px] border-[#7A1631] bg-[rgba(122,22,49,.18)]" />
          </div>
          <p className={body}>
            {t("Tap anyone to see their photos and stories. Drag to move around, and use ", "انقر على أي شخص لترى صوره وقصصه. اسحب للتنقّل، واستخدم ")}
            <strong>+</strong>
            {t(" and ", " و")}
            <strong>−</strong>
            {t(" to zoom.", " للتكبير والتصغير.")}
          </p>
        </div>
      );
    case 2:
      return (
        <div className="flex flex-col gap-4">
          <h1 className={h1}>{t("Find anyone in seconds", "اعثر على أي شخص في ثوانٍ")}</h1>
          <div aria-hidden className="tour-pop relative flex flex-col gap-3 rounded-[22px] border-2 border-[#ECE2DE] bg-[#FBF7F4] px-4 py-[22px]">
            <span className="absolute end-2.5 top-2.5 z-10 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-[#6B5B5E] ring-1 ring-[#ECE2DE]">{t("Example", "مثال")}</span>
            <div className="flex h-[52px] items-center gap-2.5 rounded-full border-2 border-[#7A1631] bg-white px-4 text-[17px] font-extrabold">
              <Search className="h-5 w-5 text-[#6B5B5E]" strokeWidth={2.5} />
              {t("Ram", "رام")}
            </div>
            {[
              { i: t("RM", "ر م"), n: t("Ramy Morkos", "رامي مرقس"), bg: "#DDE7F1", fg: "#1F4467", c: "tour-rise2" },
              { i: t("RN", "ر ن"), n: t("Ramsis Nassif", "رمسيس نصيف"), bg: "#E3EEDF", fg: "#2F5A27", c: "tour-rise3" },
            ].map((r) => (
              <div key={r.n} className={`${r.c} flex items-center gap-3 rounded-2xl border-2 border-[#ECE2DE] bg-white px-3 py-2.5`}>
                <span className={`${dot} h-11 w-11`} style={{ background: r.bg, color: r.fg }}>{r.i}</span>
                <span className="text-[17px] font-extrabold">{r.n}</span>
                <span className="ms-auto font-black text-[#7A1631]">{lang === "ar" ? "‹" : "›"}</span>
              </div>
            ))}
          </div>
          <p className={body}>{t("Type a name in the search bar at the top and we'll fly straight to them on the tree.", "اكتب اسمًا في شريط البحث في الأعلى وسننقلك إليه مباشرة على الشجرة.")}</p>
        </div>
      );
    case 3:
      return (
        <div className="flex flex-col gap-4">
          <h1 className={h1}>{t("“How are we related?”", "«ما صلة القرابة بيننا؟»")}</h1>
          <div aria-hidden className="tour-pop relative h-[250px] rounded-[22px] border-2 border-[#ECE2DE] bg-[#FBF7F4]" dir="ltr">
            <span className="absolute end-2.5 top-2.5 z-10 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-[#6B5B5E] ring-1 ring-[#ECE2DE]">{t("Example", "مثال")}</span>
            <svg width="100%" height="100%" viewBox="0 0 342 250" className="absolute inset-0">
              <path className="tour-draw" d="M60 190 V125 H171 V60 M171 60 H282 V190" stroke="#C2410C" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={`${dot} absolute left-[136px] top-[26px] h-[70px] w-[70px] bg-[#DDE7F1] text-[#1F4467] shadow-[0_0_0_4px_#fff,0_0_0_7px_#C2410C]`}>{t("SL", "س ل")}</span>
            <span className={`${dot} absolute left-[26px] top-[160px] h-[66px] w-[66px] bg-[#E9D4C4] text-[#5C3A21] shadow-[0_0_0_4px_#fff,0_0_0_7px_#C2410C]`}>{t("PG", "ب ج")}</span>
            <span className={`${dot} absolute right-[26px] top-[160px] h-[66px] w-[66px] bg-[#DDE7F1] text-[#1F4467] shadow-[0_0_0_4px_#fff,0_0_0_7px_#C2410C]`}>{t("SE", "س ع")}</span>
          </div>
          <p className="tour-rise2 rounded-2xl bg-[#FFF4EC] px-3.5 py-3 text-center text-lg font-black text-[#9A3412]">
            {t("Samy is Paul's first cousin · ابن خالة", "سامي ابن خالة بول")}
          </p>
          <p className="tour-rise3 m-0 text-lg font-bold leading-[1.45] text-[#3D2B2E]">
            {t("Their mums, Samar and Merrit, are sisters, so they share grandad Sameer Labib. Pick any two people and we'll light up the connection like this.", "والدتاهما سمر وميريت أختان، فجدّهما المشترك سمير لبيب. اختر أي شخصين وسنضيء الصلة بينهما هكذا.")}
          </p>
        </div>
      );
    case 4:
      return (
        <div className="flex flex-col gap-4">
          <h1 className={h1}>{t("Keep the memories alive", "حافظ على الذكريات حيّة")}</h1>
          <div aria-hidden className="tour-pop relative flex flex-col gap-2.5 rounded-[22px] border-2 border-[#ECE2DE] bg-white p-4">
            <span className="absolute end-2.5 top-2.5 z-10 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-[#6B5B5E] ring-1 ring-[#ECE2DE]">{t("Example", "مثال")}</span>
            <div className="flex items-center gap-2.5">
              <span className={`${dot} h-10 w-10 bg-[#F7E7EB] text-[#7A1631]`}>HM</span>
              <span className="text-base font-extrabold">{t("Hanan shared a memory", "شاركت حنان ذكرى")}</span>
            </div>
            <div className="h-[120px] rounded-2xl bg-[#EFE3D3]" />
            <p className="text-base font-bold text-[#3D2B2E]">{t("“Grandpa carried the sewing machine the whole bus ride…”", "«حمل جدّي ماكينة الخياطة طوال الرحلة بالحافلة…»")}</p>
          </div>
          <p className={body}>
            {t("Tap the big ", "انقر على زر ")}
            <strong className="text-[#7A1631]">+</strong>
            {t(" button to share a story or old photos on anyone's page.", " الكبير لمشاركة قصة أو صور قديمة في صفحة أي شخص.")}
          </p>
        </div>
      );
    default:
      return (
        <div className="relative flex flex-col items-center gap-3.5 pt-2 text-center">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px]" dir="ltr">
            {[
              ["8%", "#7A1631", "0s"],
              ["24%", "#F59E0B", ".4s"],
              ["42%", "#6BAF4E", ".9s"],
              ["60%", "#C2410C", ".2s"],
              ["78%", "#1F4467", ".7s"],
              ["90%", "#F59E0B", "1.2s"],
            ].map(([left, bg, delay]) => (
              <span key={left} className="tour-confetti" style={{ left, background: bg, animationDelay: delay }} />
            ))}
          </div>
          <BigFatMascot mood="happy" size={140} className="mt-10" />
          <h1 className="tour-pop text-[32px] font-black text-[#7A1631]">{t("You're all set!", "كل شيء جاهز!")}</h1>
          <div className="tour-rise2 flex gap-3">
            <div className="rounded-2xl border-2 border-[#F59E0B] px-4 py-2.5">
              <div className="text-xs font-black tracking-[0.06em] text-[#92400E]">{t("TOUR", "الجولة")}</div>
              <div className="text-xl font-black">{t("Done", "تمّت")}</div>
            </div>
            <div className="rounded-2xl border-2 border-[#6BAF4E] px-4 py-2.5">
              <div className="text-xs font-black tracking-[0.06em] text-[#2F6B2A]">{t("NEXT", "التالي")}</div>
              <div className="text-xl font-black">{t("Explore", "استكشف")}</div>
            </div>
          </div>
          <p className="tour-rise3 text-[17px] font-bold text-[#6B5B5E]">
            {t("You can replay this tour any time from your profile menu.", "يمكنك إعادة هذه الجولة في أي وقت من قائمة حسابك.")}
          </p>
        </div>
      );
  }
}
