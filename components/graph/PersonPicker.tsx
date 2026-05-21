"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { UserPlus2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
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
  onPick: (personId: string) => void | Promise<void>;
  createHref?: string;
  createLabel?: string;
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

export function PersonPicker({
  open,
  onOpenChange,
  title,
  description,
  people,
  lang,
  excludeIds = [],
  onPick,
  createHref,
  createLabel,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const exclude = useMemo(() => new Set(excludeIds), [excludeIds]);
  const choices = useMemo(
    () => people.filter((p) => !exclude.has(p.id)),
    [people, exclude],
  );

  async function handlePick(id: string) {
    setBusy(id);
    try {
      await onPick(id);
    } finally {
      setBusy(null);
      onOpenChange(false);
      startTransition(() => router.refresh());
    }
  }

  function handleCreate() {
    if (!createHref) return;
    onOpenChange(false);
    router.push(createHref);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

        <Command className="border-t border-[var(--border)]">
          <CommandInput
            placeholder={
              lang === "ar" ? "ابحث بالاسم…" : "Search by name…"
            }
            className="h-11"
          />
          <CommandList className="scrollbar-thin max-h-72">
            <CommandEmpty className="py-6 text-center text-xs text-[var(--muted-foreground)]">
              {lang === "ar" ? "لا توجد نتائج" : "No matches"}
            </CommandEmpty>

            {choices.length > 0 && (
              <CommandGroup
                heading={lang === "ar" ? "موجودون" : "Existing people"}
              >
                {choices.map((p) => {
                  const { given, family } = display(p, lang);
                  const isBusy = busy === p.id;
                  return (
                    <CommandItem
                      key={p.id}
                      value={`${given} ${family}`}
                      onSelect={() => !isBusy && handlePick(p.id)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-2 py-2",
                        isBusy && "opacity-60",
                      )}
                    >
                      <Avatar
                        className={cn(
                          "h-8 w-8 ring-2 ring-offset-1 ring-offset-[var(--card)]",
                          p.gender === "f"
                            ? "ring-rose-200"
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
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {createHref && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value="__create_new__"
                    onSelect={handleCreate}
                    className="gap-3 rounded-lg px-2 py-2.5 text-[var(--primary)] data-[selected=true]:bg-[var(--primary)]/8"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-[var(--primary)]/40 bg-[var(--primary)]/8">
                      <UserPlus2 className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col leading-tight">
                      <span className="text-sm font-medium">
                        {createLabel ??
                          (lang === "ar" ? "إنشاء شخص جديد" : "Create a new person")}
                      </span>
                      <span className="text-[10px] text-[var(--muted-foreground)]">
                        {lang === "ar"
                          ? "إذا لم يكن في القائمة بعد"
                          : "if they're not in the list yet"}
                      </span>
                    </div>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
