import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { personName, type KinContext, type Lang, type RelationshipView } from "@/lib/kinship/view";

/** The route, one person per row: "1 Omar → 2 Khaled (Omar's father) → …". Numbers match the tree. */
export function StepList({ view, ctx, lang }: { view: RelationshipView; ctx: KinContext; lang: Lang }) {
  const other: Lang = lang === "ar" ? "en" : "ar";

  return (
    <ol className="m-0 list-none p-0" aria-label={lang === "ar" ? "الخطوات من الأول إلى الثاني" : "Steps from the first person to the second"}>
      {view.steps.map((step, i) => {
        const person = ctx.byId.get(step.personId);
        const name = personName(person, lang, true);
        const primary = lang === "ar" ? step.ar : step.en;
        const secondary = other === "ar" ? step.ar : step.en;
        const isLast = i === view.steps.length - 1;
        const href = person ? `/person/${person.slug ?? person.id}` : null;

        const body = (
          <>
            <span
              aria-hidden
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--path)] text-sm font-bold text-white"
            >
              {step.number}
            </span>
            <Avatar className="h-9 w-9">
              {person?.photo_url && <AvatarImage src={person.photo_url} alt="" className="object-cover" />}
              <AvatarFallback className="text-[11px] font-semibold">
                {name.split(" ").slice(0, 2).map((w) => w.charAt(0)).join("").toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-[var(--foreground)]">
                <span className="sr-only">{lang === "ar" ? `الخطوة ${step.number}: ` : `Step ${step.number}: `}</span>
                {name}
              </span>
              <span className="block text-sm text-[var(--muted-foreground)]">
                {primary ?? (lang === "ar" ? "نقطة البداية" : "Starting point")}
              </span>
              {secondary && (
                <span lang={other} dir={other === "ar" ? "rtl" : "ltr"} className="mt-0.5 inline-block max-w-full text-xs text-[var(--muted-foreground)]">
                  {secondary}
                </span>
              )}
            </span>
            {href && <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-[var(--muted-foreground)] rtl:rotate-180" aria-hidden />}
          </>
        );

        return (
          <li key={`${step.personId}-${step.number}`} className="relative">
            {!isLast && (
              <span aria-hidden className="absolute -bottom-3 start-[25px] top-10 w-0.5 rounded-full bg-[var(--path)]/30" />
            )}
            {href ? (
              <Link
                href={href}
                className="flex min-h-[44px] items-start gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                {body}
              </Link>
            ) : (
              <div className="flex min-h-[44px] items-start gap-3 rounded-2xl px-3 py-3">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
