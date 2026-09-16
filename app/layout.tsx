import "./globals.css";
import { Space_Grotesk, Inter } from "next/font/google";
import TopNav from "./components/TopNav";
import UserMenu from "./components/UserMenu";
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
  const filterOptions = await getFilterOptions();

  return (
    <html lang="es" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body className="m-0 antialiased">
        <GlobalProvider>
          <div className="min-h-screen flex flex-col">
            <TopNav userMenu={<UserMenu />} facilities={filterOptions.facilities} markets={filterOptions.markets} />
            <main
              className="flex-1 min-w-0 px-4 py-6 md:px-8 md:py-8"
              style={{ background: "linear-gradient(160deg, #f5fffa 0%, #eff9f4 100%)" }}
            >
              {children}
            </main>
          </div>
        </GlobalProvider>
      </body>
    </html>
  );
}
