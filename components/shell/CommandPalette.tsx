"use client";

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
import { useRouter } from "next/navigation";

interface Person {
  id: string;
  given_en?: string | null;
  given_ar?: string | null;
  family_name?: string | null;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people?: Person[];
}

export function CommandPalette({ open, onOpenChange, people = [] }: CommandPaletteProps) {
  const router = useRouter();

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
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
                {[p.given_en || p.given_ar, p.family_name].filter(Boolean).join(" ")}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => run(() => router.push("/"))}>
            <Home />
            Canvas
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/transcripts"))}>
            <Mic />
            Transcripts
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
          <CommandItem
            onSelect={() => {
              const next = document.cookie.includes("lang=ar") ? "en" : "ar";
              document.cookie = `lang=${next}; path=/; max-age=31536000; SameSite=Lax; Secure`;
              run(() => window.location.reload());
            }}
          >
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
  );
}
