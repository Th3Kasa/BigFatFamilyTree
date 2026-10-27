import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/lang/server";

// Shared look for the member screens (palette from the approved design):
// ground #FBF7F4, ink #241517, muted #6B5B5E, border #ECE2DE, field #F4EDEA,
// primary #7A1631, primary-soft #F7E7EB. Logical (start/end) classes only so
// everything mirrors in Arabic.

const pillBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

export const pill = {
  primary: cn(pillBase, "bg-[var(--primary)] text-white hover:bg-[#5C0F24]"),
  outline: cn(pillBase, "border border-[#E2D6D2] bg-white text-[#241517] hover:bg-[#F4EDEA]"),
  ghost: cn(pillBase, "text-[var(--muted-foreground)] hover:bg-[#F4EDEA] hover:text-[#241517]"),
  link: cn(pillBase, "px-3 text-[var(--primary)] hover:bg-[#F7E7EB]"),
} as const;

export const fieldClass =
  "block w-full min-h-[52px] rounded-2xl border-2 border-transparent bg-[#F4EDEA] px-4 text-base text-[#241517] placeholder:text-[var(--muted-foreground)] transition-colors focus:border-[var(--primary)] focus:bg-white focus:outline-none disabled:opacity-60 aria-[invalid=true]:border-[var(--destructive)]";

export const cardClass = "rounded-[20px] border border-[#ECE2DE] bg-white";

export function displayFont(lang: Lang): React.CSSProperties {
  return { fontFamily: lang === "ar" ? "var(--font-arabic)" : "var(--font-display)" };
}

const TONES = [
  { bg: "#E9D4C4", fg: "#5C3A21" },
  { bg: "#DDE7F1", fg: "#1F4467" },
  { bg: "#F7E7EB", fg: "#7A1631" },
  { bg: "#E3EEDF", fg: "#2F5A27" },
] as const;

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0] ?? "?";
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function toneFor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.codePointAt(0)!) % 997;
  return TONES[h % TONES.length];
}

export function Initials({
  name,
  size = 44,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const tone = toneFor(name);
  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center rounded-full font-bold", className)}
      style={{
        width: size,
        height: size,
        background: tone.bg,
        color: tone.fg,
        fontSize: Math.round(size * 0.32),
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}
