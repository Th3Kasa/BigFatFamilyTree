"use client";

import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type PickablePerson = {
  id: string;
  slug?: string | null;
  given_en?: string | null;
  given_ar?: string | null;
  family_name_en?: string | null;
  family_name_ar?: string | null;
  photo_url?: string | null;
  gender?: "m" | "f" | "unknown" | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  people: PickablePerson[];
  lang: "ar" | "en";
  excludeIds?: string[];
  onPick: (personId: string) => boolean | void | Promise<boolean | void>;
};

function display(p: PickablePerson, lang: "ar" | "en") {
  const given =
    lang === "ar"
      ? (p.given_ar ?? p.given_en)
      : (p.given_en ?? p.given_ar);
  const family =
    lang === "ar"
      ? (p.family_name_ar ?? p.family_name_en)
      : (p.family_name_en ?? p.family_name_ar);
  return {
    given: given ?? (lang === "ar" ? "بدون اسم" : "Unnamed"),
    family: family ?? "",
  };
}

function initials(p: PickablePerson, lang: "ar" | "en") {
  const { given, family } = display(p, lang);
  return (given.charAt(0) + (family.charAt(0) || "")).toUpperCase();
}

function searchHaystack(p: PickablePerson) {
  return [
    p.given_en,
    p.given_ar,
    p.family_name_en,
    p.family_name_ar,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function PersonPicker({
  open,
  onOpenChange,
  title,
  description,
  people,
  lang,
  excludeIds = [],
  onPick,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const exclude = useMemo(() => new Set(excludeIds), [excludeIds]);
  const all = useMemo(
    () => people.filter((p) => !exclude.has(p.id)),
    [people, exclude],
  );

  const choices = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) => searchHaystack(p).includes(q));
  }, [all, query]);

  async function handlePick(id: string) {
    setBusy(id);
    try {
      const ok = await onPick(id);
      // false return = operation failed (caller already toasted), keep picker open
      if (ok !== false) {
        onOpenChange(false);
        setQuery("");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setQuery("");
        onOpenChange(o);
      }}
    >
      <DialogContent className="glass-2 max-w-md gap-0 overflow-hidden p-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle
            className="text-lg font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-xs text-[var(--muted-foreground)]">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Search */}
        <div className="flex items-center gap-2 border-y border-[var(--border)] px-4 py-2.5">
          <Search className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
          <input
            autoFocus
            aria-label={lang === "ar" ? "ابحث بالاسم" : "Search by name"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lang === "ar" ? "ابحث بالاسم…" : "Search by name…"}
            className="w-full bg-transparent text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none"
          />
          {choices.length > 0 && (
            <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">
              {choices.length}
            </span>
          )}
        </div>

        {/* List */}
        <div className="scrollbar-thin max-h-72 overflow-y-auto px-2 py-2">
          {choices.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">
              {all.length === 0
                ? lang === "ar"
                  ? "لا يوجد أشخاص بعد"
                  : "No people yet"
                : lang === "ar"
                  ? "لا توجد نتائج"
                  : "No matches"}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {choices.map((p) => {
                const { given, family } = display(p, lang);
                const isBusy = busy === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => !isBusy && handlePick(p.id)}
                      disabled={isBusy}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                        "hover:bg-[var(--muted)]/55",
                        isBusy && "opacity-60",
                      )}
                    >
                      <Avatar
                        className={cn(
                          "h-8 w-8 ring-2 ring-offset-1 ring-offset-[var(--card)]",
                          p.gender === "f"
                            ? "ring-[var(--highlight)]/40"
                            : p.gender === "m"
                              ? "ring-[oklch(0.86_0.07_38)]/70"
                              : "ring-[var(--border)]",
                        )}
                      >
                        {p.photo_url && (
                          <AvatarImage src={p.photo_url} alt={given} className="object-cover" />
                        )}
                        <AvatarFallback className="text-[10px] font-semibold">
                          {initials(p, lang)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span className="truncate text-sm font-medium text-[var(--foreground)]">
                          {given}
                        </span>
                        {family && (
                          <span className="truncate text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                            {family}
                          </span>
                        )}
                      </div>
                      {isBusy && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--muted-foreground)]" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

      </DialogContent>
    </Dialog>
  );
}
