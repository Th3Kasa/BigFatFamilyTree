"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Languages, LogOut, Network, Plus, Users, Waypoints } from "lucide-react";
import { getDisplayName } from "@/lib/utils";
import { shell } from "@/lib/client/shell-store";
import { useFocusPerson } from "@/lib/client/use-focus-person";
import { loadDirectory, type DirectoryPerson } from "@/lib/client/family-directory";
import { switchLanguage } from "@/lib/lang/client";

interface CommandProviderProps {
  children: React.ReactNode;
  lang?: "ar" | "en";
}

const CommandContext = React.createContext<{
  openCommand: () => void;
  closeCommand: () => void;
}>({
  openCommand: () => {},
  closeCommand: () => {},
});

export function useCommandPalette() {
  return React.useContext(CommandContext);
}

/**
 * Keyboard command palette (Ctrl/⌘ K when the top-bar search isn't on screen).
 * People, navigation and a few actions; every label is bilingual.
 */
export function CommandProvider({ children, lang = "en" }: CommandProviderProps) {
  const [open, setOpen] = React.useState(false);
  const [people, setPeople] = React.useState<DirectoryPerson[]>([]);
  const router = useRouter();
  const focusPerson = useFocusPerson();
  const signOutRef = React.useRef<HTMLFormElement>(null);
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadDirectory().then((d) => {
      if (!cancelled) setPeople(d.people);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <CommandContext.Provider value={{ openCommand: () => setOpen(true), closeCommand: () => setOpen(false) }}>
      {children}
      <form ref={signOutRef} action="/auth/signout" method="post" hidden />
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder={t("Search people or jump to a page…", "ابحث عن شخص أو انتقل إلى صفحة…")} />
        <CommandList>
          <CommandEmpty>{t("Nothing found.", "لا توجد نتائج.")}</CommandEmpty>

          {people.length > 0 && (
            <CommandGroup heading={t("People", "الأشخاص")}>
              {people.slice(0, 50).map((p) => {
                const name = getDisplayName(p, lang);
                return (
                  <CommandItem
                    key={p.id}
                    value={`${name} ${p.given_en ?? ""} ${p.given_ar ?? ""} ${p.family_name_en ?? ""} ${p.family_name_ar ?? ""} ${p.id}`}
                    onSelect={() => run(() => focusPerson(p.id))}
                  >
                    {name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          <CommandSeparator />

          <CommandGroup heading={t("Go to", "انتقل إلى")}>
            <CommandItem value="family tree home canvas شجرة العائلة" onSelect={() => run(() => router.push("/"))}>
              <Network />
              {t("Family tree", "شجرة العائلة")}
            </CommandItem>
            <CommandItem value="people directory everyone الأشخاص" onSelect={() => run(() => router.push("/people"))}>
              <Users />
              {t("People", "الأشخاص")}
            </CommandItem>
            <CommandItem
              value="How are we related? relationship kin cousin family connection ما صلة القرابة"
              onSelect={() => run(() => router.push("/relationships"))}
            >
              <Waypoints />
              {t("How are we related?", "ما صلة القرابة بيننا؟")}
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading={t("Actions", "إجراءات")}>
            <CommandItem value="add person event photo memory إضافة" onSelect={() => run(() => shell.openAdd())}>
              <Plus />
              {t("Add to the family…", "أضف إلى العائلة…")}
            </CommandItem>
            <CommandItem
              value="switch language arabic english عربي English اللغة"
              onSelect={() => run(() => switchLanguage(lang === "ar" ? "en" : "ar"))}
            >
              <Languages />
              {lang === "ar" ? "English" : "العربية"}
            </CommandItem>
            <CommandItem
              value="sign out log out تسجيل الخروج"
              onSelect={() => run(() => signOutRef.current?.requestSubmit())}
              className="text-[var(--destructive)]"
            >
              <LogOut />
              {t("Sign out", "تسجيل الخروج")}
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </CommandContext.Provider>
  );
}
