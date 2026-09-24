import "./globals.css";
import { Space_Grotesk, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import TopNav from "./components/TopNav";
import UserMenu from "./components/UserMenu";
import AppChrome from "./components/AppChrome";
import { GlobalProvider } from "./context/GlobalContext";
import { getFilterOptions } from "./lib/db/queries";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [filterOptions, locale, messages] = await Promise.all([
    getFilterOptions(),
    getLocale(),
    getMessages(),
  ]);

  return (
    <html lang={locale} className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body className="m-0 antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <GlobalProvider>
            <AppChrome
              topNav={<TopNav userMenu={<UserMenu />} facilities={filterOptions.facilities} markets={filterOptions.markets} />}
            >
              {children}
            </AppChrome>
          </GlobalProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
