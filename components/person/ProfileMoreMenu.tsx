"use client";

import { useRef } from "react";
import Link from "next/link";
import { CalendarPlus, Ellipsis, Network, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Lang } from "@/lib/lang/server";

/** "⋯" on a profile (people the member may edit): add a life event, show on the tree, delete (admins). */
export function ProfileMoreMenu({
  lang,
  name,
  eventHref,
  treeHref,
  deleteAction,
}: {
  lang: Lang;
  name: string;
  eventHref: string;
  treeHref: string;
  /** Admins only: deleting a person is not part of an editor's family scope. */
  deleteAction?: () => Promise<void>;
}) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const deleteRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <DropdownMenu dir={lang === "ar" ? "rtl" : "ltr"}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("More options", "خيارات أخرى")}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--card)] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
          >
            <Ellipsis className="h-5 w-5" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem asChild>
            <Link href={eventHref}>
              <CalendarPlus />
              {t("Add a life event", "إضافة حدث في الحياة")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={treeHref}>
              <Network />
              {t("Show on the tree", "اعرض على الشجرة")}
            </Link>
          </DropdownMenuItem>
          {deleteAction ? <DropdownMenuSeparator /> : null}
          {deleteAction ? (
          <DropdownMenuItem
            className="text-[var(--destructive)] focus:text-[var(--destructive)]"
            onSelect={() => {
              if (confirm(t(`Delete ${name} from the family tree?`, `حذف ${name} من شجرة العائلة؟`))) {
                deleteRef.current?.requestSubmit();
              }
            }}
          >
            <Trash2 />
            {t("Delete this person", "حذف هذا الشخص")}
          </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {deleteAction ? <form ref={deleteRef} action={deleteAction} hidden /> : null}
    </>
  );
}
