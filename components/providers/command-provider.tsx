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
  CommandShortcut,
} from "@/components/ui/command";
import { Home, Mic, LogOut, Languages, LayoutGrid, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getDisplayName } from "@/lib/utils";

interface Person {
  id: string;
  slug?: string | null;
  given_en?: string | null;
  given_ar?: string | null;
  family_name_en?: string | null;
  family_name_ar?: string | null;
}

interface CommandProviderProps {
  children: React.ReactNode;
  /** Optional initial people — kept for SSR compatibility; we always re-fetch on open. */
  people?: Person[];
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

export function CommandProvider({
  children,
  people: initialPeople = [],
  lang = "en",
}: CommandProviderProps) {
  const [open, setOpen] = React.useState(false);
  const [people, setPeople] = React.useState<Person[]>(initialPeople);
  const router = useRouter();

  // Re-fetch the people list every time the palette opens.
  // Chosen over a Supabase realtime subscription because the palette is
  // only relevant while open, and re-fetch is simpler, cheaper, and avoids
  // managing a long-lived channel + RLS-aware auth state in this provider.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("people")
      .select("id, slug, given_en, given_ar, family_name_en, family_name_ar")
      .is("deleted_at", null)
      .order("family_name_en", { ascending: true, nullsFirst: false })
      .order("given_en", { ascending: true, nullsFirst: false })
      .limit(200)
      .then(({ data }) => {
        if (!cancelled && data) setPeople(data as Person[]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
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
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search people, transcripts, actions…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {people.length > 0 && (
            <CommandGroup heading="People">
              {people.slice(0, 20).map((p) => {
                const name = getDisplayName(p, lang);
                return (
                  <CommandItem
                    key={p.id}
                    value={`${name} ${p.given_en ?? ""} ${p.given_ar ?? ""} ${p.family_name_en ?? ""} ${p.family_name_ar ?? ""}`}
                    onSelect={() => run(() => router.push(`/person/${p.slug ?? p.id}`))}
                  >
                    {name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          <CommandSeparator />

          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => run(() => router.push("/"))}>
              <Home />
              Canvas
              <CommandShortcut>G C</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => router.push("/transcripts"))}>
              <Mic />
              Transcripts
              <CommandShortcut>G T</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => run(() => router.push("/person/new"))}>
              <UserPlus />
              Add person
            </CommandItem>
            <CommandItem onSelect={() => run(() => router.push("/?autoLayout=1"))}>
              <LayoutGrid />
              Auto-layout canvas
            </CommandItem>
            <CommandItem onSelect={() => {
              const next = document.cookie.includes("lang=ar") ? "en" : "ar";
              const secure = location.protocol === "https:" ? "; Secure" : "";
              document.cookie = `lang=${next}; path=/; max-age=31536000; SameSite=Lax${secure}`;
              run(() => window.location.reload());
            }}>
              <Languages />
              Switch language
            </CommandItem>
            <CommandItem
              onSelect={() => run(() => router.push("/auth/signout"))}
              className="text-[var(--destructive)]"
            >
              <LogOut />
              Sign out
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </CommandContext.Provider>
  );
}
