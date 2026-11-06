"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { TreeExportDialog } from "@/components/shell/TreeExportDialog";
import { useCurrentPerson } from "@/components/providers/current-person-provider";
import { loadTreeForExport } from "@/lib/actions/tree-export";
import type { Lang } from "@/lib/lang/server";

/**
 * "Download PDF" in the top bar: the whole family, A3 to A0, for members whose
 * account is linked to a person on the tree. Everyone else doesn't see it.
 */
export function ExportTreeButton({ lang }: { lang: Lang }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const me = useCurrentPerson();
  const [open, setOpen] = useState(false);
  if (!me) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={t("Download the family tree as a PDF", "تنزيل شجرة العائلة بصيغة PDF")}
        className="inline-flex h-11 w-11 items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--card)] text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 xl:w-auto xl:px-4"
      >
        <FileDown className="h-[18px] w-[18px] shrink-0" aria-hidden />
        <span className="hidden xl:inline">{t("Download PDF", "تنزيل PDF")}</span>
      </button>
      {open && <TreeExportDialog lang={lang} onClose={() => setOpen(false)} load={loadTreeForExport} />}
    </>
  );
}
