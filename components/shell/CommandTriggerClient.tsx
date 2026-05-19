"use client";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Search } from "lucide-react";
import { useCommandPalette } from "@/components/providers/command-provider";

export function CommandTriggerClient() {
  const { openCommand } = useCommandPalette();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={openCommand}
      className="hidden sm:flex h-8 gap-2 text-[var(--muted-foreground)] text-xs w-44 justify-start"
    >
      <Search className="h-3.5 w-3.5" />
      Search…
      <span className="ms-auto flex items-center gap-0.5">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </span>
    </Button>
  );
}
