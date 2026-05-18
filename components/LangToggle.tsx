"use client";

import type { Lang } from "@/lib/lang/server";

type Props = { current: Lang };

export function LangToggle({ current }: Props) {
  function toggle() {
    const next = current === "ar" ? "en" : "ar";
    document.cookie = `lang=${next}; path=/; max-age=31536000; SameSite=Lax; Secure`;
    window.location.reload();
  }

  return (
    <button
      onClick={toggle}
      className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 bg-white hover:bg-gray-50 active:bg-gray-100 shadow-sm transition-colors"
      aria-label={current === "ar" ? "Switch to English" : "التبديل إلى العربية"}
    >
      {current === "ar" ? "English" : "عربي"}
    </button>
  );
}
