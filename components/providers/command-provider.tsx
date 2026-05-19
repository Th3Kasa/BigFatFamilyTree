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

interface Person {
  id: string;
  given_en?: string | null;
  given_ar?: string | null;
  family_name?: string | null;
}

interface CommandProviderProps {
  children: React.ReactNode;
  people?: Person[];
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

export function CommandProvider({ children, people = [] }: CommandProviderProps) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

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
              {people.slice(0, 8).map((p) => (
                <CommandItem
                  key={p.id}
                  onSelect={() => run(() => router.push(`/person/${p.id}`))}
                >
                  {p.given_en || p.given_ar || "Unknown"}{" "}
                  {p.family_name || ""}
                </CommandItem>
              ))}
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
              document.cookie = `lang=${next}; path=/; max-age=31536000; SameSite=Lax; Secure`;
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
