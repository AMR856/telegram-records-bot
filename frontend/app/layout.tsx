import type { Metadata } from "next";
import { cookies } from "next/headers";

import "@/app/globals.css";
import { Providers } from "@/components/Providers";
import type { Lang } from "@/lib/i18n";
import { getDictionary, isLang } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Payment Ledger",
  description: "Track Telegram payments and export them to Excel.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const cookieLang = cookieStore.get("lang")?.value;
  const lang: Lang = isLang(cookieLang) ? cookieLang : "ar";
  const dict = getDictionary(lang);

  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} suppressHydrationWarning>
      <body>
        <Providers initialLang={lang}>
          <span className="sr-only">{dict.appName}</span>
          {children}
        </Providers>
      </body>
    </html>
  );
}
