import type { Metadata } from "next";
import { Inter, Fraunces, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { getLang } from "@/lib/lang/server";
import { createClient } from "@/lib/supabase/server";
import { CommandProvider } from "@/components/providers/command-provider";
import { AppShell } from "@/components/shell/AppShell";
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
    "Our family tree, stories and photos in one friendly place, for every generation.",
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

  return (
    <html
      lang={lang}
      dir={lang === "ar" ? "rtl" : "ltr"}
      className={`${fontSans.variable} ${fontDisplay.variable} ${fontArabic.variable}`}
    >
      <body className="antialiased">
        <CommandProvider lang={lang}>
          {user ? (
            <AppShell user={user} lang={lang} role={role}>
              {children}
            </AppShell>
          ) : (
            children
          )}

          <Toaster
            position={lang === "ar" ? "bottom-left" : "bottom-right"}
            dir={lang === "ar" ? "rtl" : "ltr"}
            mobileOffset={{ bottom: "calc(var(--tabbar-h) + 12px)" }}
          />
        </CommandProvider>
      </body>
    </html>
  );
}
