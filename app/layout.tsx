import type { Metadata } from "next";
import { Inter, Fraunces, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { getLang } from "@/lib/lang/server";
import { createClient } from "@/lib/supabase/server";
import { CommandProvider } from "@/components/providers/command-provider";
import { CurrentPersonProvider } from "@/components/providers/current-person-provider";
import { fetchCurrentPerson } from "@/lib/members/current-person";
import { TopBar } from "@/components/shell/TopBar";
import { NavRail } from "@/components/shell/NavRail";
import { MobileNav } from "@/components/shell/MobileNav";
import { Toaster } from "@/components/ui/sonner";

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const fontDisplay = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const fontArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Big Fat Family Tree",
  description:
    "A spatial family history archive built for multiple generations — family stories and future histories to be stored.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  const role = (profile as { role?: string | null } | null)?.role ?? undefined;
  const currentPerson = user ? await fetchCurrentPerson(supabase, user.id) : null;

  return (
    <html
      lang={lang}
      dir={lang === "ar" ? "rtl" : "ltr"}
      className={`${fontSans.variable} ${fontDisplay.variable} ${fontArabic.variable}`}
    >
      <body className="antialiased">
        <CurrentPersonProvider person={currentPerson}>
        <CommandProvider lang={lang}>
          {user ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] grid-rows-[auto_1fr] min-h-svh">
                <TopBar user={user} lang={lang} role={role} />
                <NavRail lang={lang} role={role} />
                <main className="overflow-auto pb-16 md:pb-0">
                  {children}
                </main>
              </div>
              <MobileNav lang={lang} />
            </>
          ) : (
            children
          )}

          <Toaster position="bottom-right" />
        </CommandProvider>
        </CurrentPersonProvider>
      </body>
    </html>
  );
}
