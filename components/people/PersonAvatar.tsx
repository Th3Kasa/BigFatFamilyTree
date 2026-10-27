import { cn } from "@/lib/utils";
import { avatarTone, initialsOf, type Lang } from "@/lib/people/display";
import type { NameablePerson } from "@/lib/utils";

type Props = {
  person: NameablePerson & { id: string; photo_url?: string | null };
  lang: Lang;
  /** Tailwind size classes, e.g. "h-14 w-14". */
  className?: string;
  /** Font size for the initials, e.g. "text-base". */
  textClassName?: string;
  /** Accessible name for the photo; omit when the name is shown next to it. */
  alt?: string;
};

/**
 * Round person avatar: the photo when there is one, otherwise initials on a
 * soft colour that is stable for that person across the whole app.
 * Server-safe (no client hooks).
 */
export function PersonAvatar({ person, lang, className, textClassName, alt = "" }: Props) {
  const tone = avatarTone(person.id);
  const labelled = !person.photo_url && alt;
  return (
    <span
      role={labelled ? "img" : undefined}
      aria-label={labelled ? alt : undefined}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold",
        className ?? "h-10 w-10",
        textClassName ?? "text-sm",
      )}
      style={{ background: tone.bg, color: tone.fg }}
    >
      {person.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- user photos come from Supabase storage at arbitrary sizes
        <img
          src={person.photo_url}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden>{initialsOf(person, lang)}</span>
      )}
    </span>
  );
}
