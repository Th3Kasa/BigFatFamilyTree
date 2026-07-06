import Image from "next/image";
import Link from "next/link";
import { ArrowRight, GitFork, Mic, Users } from "lucide-react";

type Props = {
  lang: "ar" | "en";
};

const COPY = {
  en: {
    title: "Big Fat Family",
    tagline: "One tree. Every story. All of us.",
    lede: "A living archive of our family — the people, the marriages, the migrations, and the stories told in Grandma's own voice. Built to grow with every generation that comes after us.",
    signIn: "Sign in",
    signInHint: "Family members only — sign in with your invited email.",
    features: [
      {
        icon: GitFork,
        title: "The family canvas",
        body: "An interactive tree you can pan, zoom, and rearrange — marriages, siblings, and generations laid out the way our family actually is.",
      },
      {
        icon: Mic,
        title: "Stories in her voice",
        body: "Original audio recordings and Arabic transcripts, preserved alongside the facts they tell us.",
      },
      {
        icon: Users,
        title: "Everyone contributes",
        body: "Aunts, uncles, cousins — anyone invited can add photos, dates, and the stories only they remember.",
      },
    ],
  },
  ar: {
    title: "عائلتنا الكبيرة",
    tagline: "شجرة واحدة. كل حكاية. كلّنا.",
    lede: "أرشيف حيّ لعائلتنا — الأشخاص، الزيجات، الهجرات، والحكايات بصوت تيتا نفسها. صُمم لينمو مع كل جيل يأتي بعدنا.",
    signIn: "تسجيل الدخول",
    signInHint: "لأفراد العائلة فقط — سجّل الدخول بالبريد الإلكتروني المدعو.",
    features: [
      {
        icon: GitFork,
        title: "لوحة العائلة",
        body: "شجرة تفاعلية يمكنك تحريكها وتكبيرها وإعادة ترتيبها — الزيجات والأشقاء والأجيال كما هي عائلتنا فعلاً.",
      },
      {
        icon: Mic,
        title: "حكايات بصوتها",
        body: "تسجيلات صوتية أصلية ونصوص عربية، محفوظة إلى جانب الحقائق التي تحكيها.",
      },
      {
        icon: Users,
        title: "الكل يشارك",
        body: "العمّات والأعمام وأولاد العم — كل مدعوّ يمكنه إضافة الصور والتواريخ والحكايات التي لا يتذكرها سواه.",
      },
    ],
  },
} as const;

export function Landing({ lang }: Props) {
  const t = COPY[lang];

  return (
    <div className="relative min-h-svh overflow-hidden bg-[var(--background)]">
      {/* Warm ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[480px]"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, oklch(0.68 0.18 38 / 0.14) 0%, transparent 70%)",
        }}
      />

      {/* Minimal header: brand + sign in */}
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo-mark.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-full ring-1 ring-[var(--border)]"
            priority
          />
          <span
            className="text-sm font-semibold tracking-tight text-[var(--foreground)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t.title}
          </span>
        </div>
        <Link
          href="/login"
          className="rounded-full border border-[var(--border)] px-4 py-1.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
        >
          {t.signIn}
        </Link>
      </header>

      {/* Hero */}
      <main className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-24 pt-16 text-center sm:pt-24">
        <h1
          className="text-4xl font-semibold leading-tight tracking-tight text-[var(--foreground)] sm:text-5xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {t.tagline}
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[var(--muted-foreground)] sm:text-lg">
          {t.lede}
        </p>

        <div className="mt-10 flex flex-col items-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-[var(--primary-foreground)] shadow-[var(--shadow-floating)] transition-transform hover:-translate-y-0.5"
          >
            {t.signIn}
            <ArrowRight className={lang === "ar" ? "h-4 w-4 rotate-180" : "h-4 w-4"} />
          </Link>
          <p className="text-xs text-[var(--muted-foreground)]">{t.signInHint}</p>
        </div>

        {/* Feature cards */}
        <div className="mt-20 grid gap-4 text-start sm:grid-cols-3">
          {t.features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-floating)]"
            >
              <Icon className="h-5 w-5 text-[var(--accent)]" />
              <h2 className="mt-3 text-sm font-semibold text-[var(--foreground)]">
                {title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted-foreground)]">
                {body}
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
