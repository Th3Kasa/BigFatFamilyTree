"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { PersonInput } from "@/lib/graph/transform";
import type { Lang } from "@/lib/lang/server";

type Props = {
  people: PersonInput[];
  lang: Lang;
};

export function MobilePeopleSheet({ people, lang }: Props) {
  const [open, setOpen] = useState(false);

  const real = people.filter((p) => !p.is_placeholder);

  return (
    <>
      {/* FABs — only visible on mobile */}
      <div className="fixed bottom-6 end-6 z-50 flex flex-col items-end gap-3 md:hidden">
        {/* Add person */}
        <a
          href="/person/new"
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center",
            "bg-[var(--primary)] text-[var(--primary-foreground)]",
            "shadow-[0_1px_2px_rgb(20_20_20/0.06),0_8px_24px_rgb(20_20_20/0.15)]",
            "transition-all duration-150 hover:scale-105 active:scale-95"
          )}
          aria-label={lang === "ar" ? "إضافة شخص" : "Add person"}
        >
          <Plus className="w-5 h-5" />
        </a>

        {/* People list trigger */}
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center",
            "bg-white border border-border text-foreground",
            "shadow-[0_1px_2px_rgb(20_20_20/0.06),0_8px_24px_rgb(20_20_20/0.12)]",
            "transition-all duration-150 hover:scale-105 active:scale-95"
          )}
          aria-label={lang === "ar" ? "قائمة الأشخاص" : "People list"}
        >
          <Users className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="h-[70vh] rounded-t-2xl flex flex-col gap-0 p-0 md:hidden"
        >
          <SheetHeader className="px-6 pt-5 pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base font-bold">
                {lang === "ar" ? "أفراد العائلة" : "Family members"}
              </SheetTitle>
              <span className="text-xs text-muted-foreground">{real.length}</span>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {real.map((p) => {
              const name =
                lang === "ar"
                  ? (p.given_ar ?? p.given_en ?? "?")
                  : (p.given_en ?? p.given_ar ?? "?");
              const family =
                lang === "ar"
                  ? (p.family_name_ar ?? p.family_name_en ?? "")
                  : (p.family_name_en ?? p.family_name_ar ?? "");
              const initials =
                name.charAt(0).toUpperCase() + (family.charAt(0) ?? "").toUpperCase();

              return (
                <Link
                  key={p.id}
                  href={`/person/${p.slug ?? p.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-6 py-3.5 hover:bg-accent/50 active:bg-accent transition-colors"
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    {p.photo_url && (
                      <img
                        src={p.photo_url}
                        alt={name}
                        className="aspect-square h-full w-full object-cover"
                      />
                    )}
                    <AvatarFallback
                      className={cn(
                        "text-xs font-semibold",
                        p.gender === "f" ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700"
                      )}
                    >
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{name}</p>
                    {family && (
                      <p className="text-xs text-muted-foreground truncate">{family}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
