import "./globals.css";
import { Space_Grotesk, Inter } from "next/font/google";
import Sidebar from "./components/Sidebar";
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
          <div className="flex min-h-screen">
            <div className="sticky top-0 h-screen shrink-0">
              <Sidebar userMenu={<UserMenu />} facilities={filterOptions.facilities} markets={filterOptions.markets} />
            </div>
            <main
              className="flex-1 min-w-0 px-4 py-4 pb-20 md:px-8 md:py-8 md:pb-8"
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
