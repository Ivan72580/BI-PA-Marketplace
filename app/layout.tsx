import "./globals.css";
import { Space_Grotesk, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import TopNav from "./components/TopNav";
import UserMenu from "./components/UserMenu";
import DataFreshness from "./components/DataFreshness";
import AppChrome from "./components/AppChrome";
import ModuleTracker from "./components/ModuleTracker";
import { GlobalProvider } from "./context/GlobalContext";
import { getFilterOptions } from "./lib/db/queries";
import { getCurrentUserWithAccess } from "./lib/db/users";
import { cookies } from "next/headers";
import { isTheme, themeAttribute, THEME_COOKIE } from "./lib/theme";

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
  const [filterOptions, locale, messages, current, cookieStore] = await Promise.all([
    getFilterOptions(),
    getLocale(),
    getMessages(),
    getCurrentUserWithAccess(),
    cookies(),
  ]);
  // Tema elegido (cookie): se pone en el HTML inicial para que no haya un
  // destello del tema equivocado. Sin cookie o "system" = sin atributo.
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value;
  const theme = themeAttribute(isTheme(themeCookie) ? themeCookie : undefined);

  return (
    <html lang={locale} data-theme={theme} className={`${spaceGrotesk.variable} ${inter.variable}`} suppressHydrationWarning>
      <body className="m-0 antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <GlobalProvider>
            <ModuleTracker />
            <AppChrome
              topNav={
                <TopNav
                  userMenu={
                    <>
                      <DataFreshness />
                      <UserMenu />
                    </>
                  }
                  facilities={filterOptions.facilities}
                  markets={filterOptions.markets}
                  access={current?.access ?? null}
                />
              }
            >
              {children}
            </AppChrome>
          </GlobalProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
