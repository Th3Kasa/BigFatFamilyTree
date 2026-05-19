import type { Metadata } from "next";
import "./globals.css";
import { getLang } from "@/lib/lang/server";
import { LangToggle } from "@/components/LangToggle";
import { SignOutButton } from "@/components/ui/SignOutButton";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Big Fat Family Tree",
  description: "Preserving the El Zawaty family history",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <body className="bg-white text-gray-900 antialiased">
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-semibold text-gray-900 hover:text-amber-600 transition-colors">
            <span className="text-xl">🌳</span>
            <span className="hidden sm:block text-sm">
              {lang === "ar" ? "شجرة العائلة" : "Family Tree"}
            </span>
          </a>
          <div className="flex items-center gap-2">
            {user && (
              <a
                href="/admin"
                className="text-sm text-gray-400 hover:text-gray-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100 hidden sm:block"
              >
                {lang === "ar" ? "الإدارة" : "Admin"}
              </a>
            )}
            <LangToggle current={lang} />
            {user && <SignOutButton lang={lang} />}
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
