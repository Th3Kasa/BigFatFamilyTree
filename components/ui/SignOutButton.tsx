"use client";

import { signOut } from "@/lib/actions/auth";

export function SignOutButton({ lang }: { lang: "ar" | "en" }) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="text-sm text-gray-400 hover:text-gray-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100"
      >
        {lang === "ar" ? "تسجيل الخروج" : "Sign out"}
      </button>
    </form>
  );
}
