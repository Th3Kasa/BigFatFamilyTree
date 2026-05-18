import type { Metadata } from "next";
import "./globals.css";
import { getLang } from "@/lib/lang/server";
import { LangToggle } from "@/components/LangToggle";

export const metadata: Metadata = {
  title: "Big Fat Family Tree",
  description: "Family knowledge preserved.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <body>
        <div className="fixed top-3 end-3 z-50">
          <LangToggle current={lang} />
        </div>
        {children}
      </body>
    </html>
  );
}
