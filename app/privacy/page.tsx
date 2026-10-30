import type { Metadata } from "next";
import Link from "next/link";
import { getLang } from "@/lib/lang/server";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return { title: lang === "ar" ? "الخصوصية · شجرة العائلة" : "Privacy · Big Fat Family Tree" };
}

type Section = { title: string; body: string[] };

const EN: Section[] = [
  {
    title: "Who this site is for",
    body: [
      "The Big Fat Family Tree is a private website for one family. Only relatives an admin has approved can sign in and see anything beyond this page and the home page.",
    ],
  },
  {
    title: "What we keep",
    body: [
      "Your account: your name, email address (if you use one), date of birth (used to help match you to your place on the tree), your sign-in PIN (stored only as a secure hash) and the devices you asked us to remember.",
      "The family tree: names, family links, birth and death dates, places and notes about relatives.",
      "What members share: photos, stories, video links, tags, hearts and comments on profile timelines.",
    ],
  },
  {
    title: "Who can see it",
    body: [
      "Only approved family members, after signing in. Nothing is public, nothing is sold, and there is no advertising or tracking. Videos from YouTube, Facebook or Instagram only load from those sites when someone presses play.",
    ],
  },
  {
    title: "Where it's stored",
    body: [
      "The site runs on Vercel. The tree, accounts and posts are stored in Supabase. Sign-in limits use Upstash. Timeline photos are stored in a Google Drive belonging to one of the family's admins (see below). Each of these services only processes the data to run this site.",
    ],
  },
  {
    title: "Google Drive",
    body: [
      "An admin connects the family's Google Drive once. The site asks Google only for permission to the files it creates itself (the \"drive.file\" permission), which it keeps in a single \"Big Fat Family Tree\" folder. It cannot see, change or delete any other files in that Drive. It also reads the admin's email address to show which account is connected.",
      "Photos are never shared publicly from Drive. Approved members see them through this site after signing in. The Google sign-in is stored encrypted, and the admin can disconnect at any time from the admin page or from their Google account settings.",
      "The site's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "You can edit or delete anything you posted. The member linked to a profile, and admins, can delete posts on that profile. To correct or remove information about you, or to close your account, ask one of the family's admins through the site. Deleted posts are hidden straight away; their photos stay in the family's Drive until an admin removes them.",
    ],
  },
];

const AR: Section[] = [
  {
    title: "لمن هذا الموقع",
    body: ["شجرة Big Fat Family موقع خاص بعائلة واحدة. لا يمكن تسجيل الدخول ورؤية أي شيء غير هذه الصفحة والصفحة الرئيسية إلا للأقارب الذين وافق عليهم أحد المشرفين."],
  },
  {
    title: "ما الذي نحتفظ به",
    body: [
      "حسابك: اسمك، وبريدك الإلكتروني (إن استخدمته)، وتاريخ ميلادك (للمساعدة في إيجاد مكانك على الشجرة)، ورمز PIN الخاص بك (محفوظ بشكل مشفّر فقط)، والأجهزة التي طلبت تذكّرها.",
      "شجرة العائلة: الأسماء وصلات القرابة وتواريخ الميلاد والوفاة والأماكن والملاحظات عن الأقارب.",
      "ما يشاركه الأعضاء: الصور والقصص وروابط الفيديو والوسوم والإعجابات والتعليقات على صفحات الأشخاص.",
    ],
  },
  {
    title: "من يمكنه رؤيته",
    body: ["أفراد العائلة المعتمدون فقط، بعد تسجيل الدخول. لا شيء عام، ولا نبيع أي بيانات، ولا توجد إعلانات أو تتبّع. لا تُحمَّل فيديوهات يوتيوب وفيسبوك وإنستغرام من تلك المواقع إلا عند الضغط على تشغيل."],
  },
  {
    title: "أين تُحفظ",
    body: ["يعمل الموقع على Vercel. تُحفظ الشجرة والحسابات والمنشورات في Supabase. تُستخدم خدمة Upstash لحدود تسجيل الدخول. تُحفظ صور الخط الزمني في Google Drive لأحد مشرفي العائلة (انظر أدناه). تعالج كل خدمة البيانات لتشغيل هذا الموقع فقط."],
  },
  {
    title: "Google Drive",
    body: [
      "يربط أحد المشرفين Google Drive الخاص بالعائلة مرة واحدة. يطلب الموقع من Google إذنًا بالملفات التي ينشئها بنفسه فقط (إذن drive.file)، ويحفظها في مجلد واحد باسم «Big Fat Family Tree». لا يمكنه رؤية أي ملفات أخرى في ذلك الحساب أو تغييرها أو حذفها. ويقرأ أيضًا البريد الإلكتروني للمشرف لعرض الحساب المرتبط.",
      "لا تُشارك الصور علنًا من Drive أبدًا. يراها الأعضاء المعتمدون عبر هذا الموقع بعد تسجيل الدخول. يُحفظ تسجيل الدخول إلى Google مشفّرًا، ويمكن للمشرف فصل الربط في أي وقت من صفحة الإدارة أو من إعدادات حسابه في Google.",
      "يلتزم الموقع في استخدام المعلومات الواردة من واجهات Google ونقلها بسياسة بيانات مستخدمي خدمات Google API، بما في ذلك متطلبات الاستخدام المحدود.",
    ],
  },
  {
    title: "خياراتك",
    body: ["يمكنك تعديل أو حذف أي شيء نشرته. ويمكن للعضو المرتبط بالصفحة وللمشرفين حذف المنشورات على تلك الصفحة. لتصحيح معلومات عنك أو إزالتها، أو لإغلاق حسابك، اطلب ذلك من أحد مشرفي العائلة عبر الموقع. تختفي المنشورات المحذوفة فورًا، وتبقى صورها في Drive العائلة حتى يزيلها أحد المشرفين."],
  },
];

/** Public privacy notice (also the policy link Google asks for on the Drive sign-in screen). */
export default async function PrivacyPage() {
  const lang = await getLang();
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const sections = lang === "ar" ? AR : EN;
  return (
    <main dir={lang === "ar" ? "rtl" : "ltr"} className="mx-auto w-full max-w-[720px] px-4 py-10 sm:py-14">
      <Link href="/" className="text-sm font-semibold text-[var(--primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
        {t("← Big Fat Family Tree", "شجرة Big Fat Family →")}
      </Link>
      <h1 className="font-heading mt-4 text-[32px] font-bold leading-tight text-[var(--foreground)]">{t("Privacy", "الخصوصية")}</h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">{t("Last updated 30 October 2026", "آخر تحديث 30 أكتوبر 2026")}</p>
      {sections.map((s) => (
        <section key={s.title} className="mt-8">
          <h2 className="text-xl font-bold text-[var(--foreground)]">{s.title}</h2>
          {s.body.map((p) => (
            <p key={p.slice(0, 32)} className="mt-3 text-[16px] leading-relaxed text-[var(--foreground)]">
              {p}
            </p>
          ))}
        </section>
      ))}
    </main>
  );
}
