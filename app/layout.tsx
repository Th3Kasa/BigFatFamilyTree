import type { Metadata } from "next";
import { Inter, Fraunces, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { getLang } from "@/lib/lang/server";
import { createClient } from "@/lib/supabase/server";
import { CommandProvider } from "@/components/providers/command-provider";
import { AppShell } from "@/components/shell/AppShell";
import { CurrentPersonProvider } from "@/components/providers/current-person-provider";
import { fetchCurrentPerson } from "@/lib/members/current-person";
import { countPendingMembers } from "@/lib/members/admin-data";
import { isApproved } from "@/lib/members/approval";
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
    ? await supabase.from("profiles").select("role, approved_at").eq("id", user.id).single()
    : { data: null };
  const role = profile?.role ?? undefined;
  // Accounts still waiting for access get no app shell (every link would bounce
  // them back to /welcome). If the profile can't be read at all, show the shell:
  // RLS, not this chrome, is what protects the data.
  const approved = profile ? isApproved(profile) : true;
  const currentPerson = user && approved ? await fetchCurrentPerson(supabase, user.id) : null;
  // Admins: how many people/suggestions are waiting, shown as a badge on "Members".
  const membersBadge = user && role === "admin" ? await countPendingMembers(supabase) : 0;

  return (
    <html
      lang={lang}
      dir={lang === "ar" ? "rtl" : "ltr"}
      className={`${fontSans.variable} ${fontDisplay.variable} ${fontArabic.variable}`}
    >
      <body className="antialiased">
        <CurrentPersonProvider person={currentPerson}>
        <CommandProvider lang={lang}>
          {user && approved ? (
            <AppShell user={user} lang={lang} role={role} membersBadge={membersBadge}>
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
        </CurrentPersonProvider>
      </body>
    </html>
  );
}
