"use client";

import { Button } from "@/components/ui/button";

export function DeletePersonButton({
  action,
  lang,
}: {
  action: () => Promise<void>;
  lang: "ar" | "en";
}) {
  return (
    <form action={action}>
      <Button
        variant="ghost"
        size="sm"
        type="submit"
        className="text-[var(--destructive)] hover:bg-[var(--destructive)]/10 hover:text-[var(--destructive)]"
        onClick={(e) => {
          if (!confirm(lang === "ar" ? "حذف هذا الشخص؟" : "Delete this person?"))
            e.preventDefault();
        }}
      >
        {lang === "ar" ? "حذف" : "Delete"}
      </Button>
    </form>
  );
}
