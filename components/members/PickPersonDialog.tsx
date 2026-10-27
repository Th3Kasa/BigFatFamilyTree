"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PersonSummary } from "@/lib/members/types";
import { cn } from "@/lib/utils";
import { PersonCombobox } from "./PersonCombobox";
import { displayFont, pill, Spinner } from "./primitives";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: "ar" | "en";
  title: string;
  description: string;
  confirmLabel: string;
  people: PersonSummary[];
  /** Resolves true when the link was saved (dialog closes), false to stay open. */
  onConfirm: (person: PersonSummary) => Promise<boolean>;
};

/** "Pick someone else" / "Link to tree" / "Change link": search the tree, choose, confirm. */
export function PickPersonDialog({
  open,
  onOpenChange,
  lang,
  title,
  description,
  confirmLabel,
  people,
  onConfirm,
}: Props) {
  const [picked, setPicked] = useState<PersonSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  async function confirm() {
    if (!picked) return;
    setBusy(true);
    try {
      const ok = await onConfirm(picked);
      if (ok) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setPicked(null);
        onOpenChange(o);
      }}
    >
      <DialogContent
        dir={lang === "ar" ? "rtl" : "ltr"}
        className="max-h-[90svh] max-w-md gap-4 overflow-y-auto rounded-[20px] border-[#ECE2DE] bg-[#FBF7F4]"
      >
        <DialogHeader className="text-start">
          <DialogTitle className="text-xl font-bold" style={displayFont(lang)}>
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-[var(--muted-foreground)]">
            {description}
          </DialogDescription>
        </DialogHeader>

        <PersonCombobox
          people={people}
          lang={lang}
          label={t("Search the family tree", "ابحث في شجرة العائلة")}
          placeholder={t("Type a name", "اكتب اسمًا")}
          value={picked}
          onChange={setPicked}
          autoFocus
        />

        <DialogFooter className="gap-2 sm:gap-2 sm:space-x-0">
          <button type="button" className={pill.ghost} onClick={() => onOpenChange(false)}>
            {t("Cancel", "إلغاء")}
          </button>
          <button
            type="button"
            className={cn(pill.primary)}
            disabled={!picked || busy}
            onClick={confirm}
          >
            {busy ? <Spinner /> : null}
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
