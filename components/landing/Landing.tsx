import Link from "next/link";
import Image from "next/image";
import { Heart, Search, Waypoints } from "lucide-react";
import { TopBar } from "@/components/shell/TopBar";
import type { Lang } from "@/lib/lang/server";

/**
 * What a signed-out visitor sees at "/". It is a plain presentational component:
 * no Supabase, no queries, no family data. Strangers learn nothing about the
 * family until an admin lets them in.
 */
export function Landing({ lang }: { lang: Lang }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  const tiles = [
    {
      icon: Search,
      title: t("Find yourself in the tree", "اعثر على نفسك في الشجرة"),
      body: t("Search your name and see where you belong.", "ابحث عن اسمك وانظر أين مكانك."),
    },
    {
      icon: Waypoints,
      title: t("See how you're related", "اعرف صلة القرابة"),
      body: t("Pick any two people and we'll show the way between them.", "اختر أي شخصين وسنُظهر لك الطريق بينهما."),
    },
    {
      icon: Heart,
      title: t("Keep memories alive", "حافظ على الذكريات"),
      body: t("Stories, photos and voices, saved for every generation.", "قصص وصور وأصوات محفوظة لكل الأجيال."),
    },
  ];

  const ctaBase =
    "inline-flex h-12 min-w-[11rem] items-center justify-center rounded-full px-7 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2";

  return (
    <div className="flex min-h-svh flex-col bg-[var(--background)]">
      <TopBar user={null} lang={lang} />
      <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-5 py-10 text-center sm:py-16">
        <Image
          src="/logo-mark.png"
          alt=""
          width={96}
          height={96}
          priority
          className="h-20 w-20 rounded-full border border-[var(--border)] bg-white p-1 shadow-[var(--shadow-floating)] sm:h-24 sm:w-24"
        />
        <h1 className="font-heading mt-6 text-balance text-[32px] font-bold leading-[1.15] text-[var(--foreground)] sm:text-5xl">
          {t("Our family's story, all in one place", "قصة عائلتنا كلها في مكان واحد")}
        </h1>
        <p className="mt-4 max-w-xl text-balance text-base leading-relaxed text-[var(--muted-foreground)] sm:text-lg">
          {t(
            "The Big Fat Family tree is private to our relatives. Join to find your branch, meet cousins you haven't met yet, and keep our stories safe.",
            "شجرة Big Fat Family خاصة بأقاربنا. انضم لتجد فرعك، وتتعرف على أبناء العم الذين لم تلتقِ بهم بعد، وتحفظ حكاياتنا.",
          )}
        </p>

        <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/login?mode=signup"
            className={`${ctaBase} w-full bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] sm:w-auto`}
          >
            {t("Join the family", "انضم إلى العائلة")}
          </Link>
          <Link
            href="/login"
            className={`${ctaBase} w-full border border-[var(--border-strong)] bg-white text-[var(--foreground)] hover:bg-[var(--muted)] sm:w-auto`}
          >
            {t("Sign in", "تسجيل الدخول")}
          </Link>
        </div>
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">
          {t("An admin confirms every new member, usually within a day.", "يؤكد المشرف كل عضو جديد، عادةً خلال يوم.")}
        </p>

        <ul className="mt-12 grid w-full list-none gap-3 p-0 text-start sm:grid-cols-3">
          {tiles.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="mt-3 text-base font-bold text-[var(--foreground)]">{title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">{body}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
