import type { Metadata } from "next";
import { Inter, Fraunces, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { getLang } from "@/lib/lang/server";
import { createClient } from "@/lib/supabase/server";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { CommandProvider } from "@/components/providers/command-provider";
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
  description: "Preserving the El Zawaty family history",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html
      lang={lang}
      dir={lang === "ar" ? "rtl" : "ltr"}
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontDisplay.variable} ${fontArabic.variable}`}
    >
      <body className="antialiased">
        <ThemeProvider>
          <CommandProvider>
            <div className="grid grid-cols-[auto_1fr] grid-rows-[auto_1fr] min-h-svh">
              {/* Top bar spans both columns */}
              <TopBar user={user} lang={lang} />

              {/* Nav rail: left col, row 2, desktop only */}
              <NavRail lang={lang} />

              {/* Main content: right col, row 2 */}
              <main className="overflow-auto pb-16 md:pb-0">
                {children}
              </main>
            </div>

            {/* Mobile bottom nav */}
            <MobileNav />

            {/* Toast notifications */}
            <Toaster position="bottom-right" />
          </CommandProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
