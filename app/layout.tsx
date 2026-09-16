import "./globals.css";
import { Space_Grotesk, Inter } from "next/font/google";
import Sidebar from "./components/Sidebar";
import UserMenu from "./components/UserMenu";
import { GlobalProvider } from "./context/GlobalContext";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body className="m-0 antialiased">
        <GlobalProvider>
          <div className="flex min-h-screen">
            <div className="sticky top-0 h-screen shrink-0">
              <Sidebar userMenu={<UserMenu />} />
            </div>
            <main
              className="flex-1 min-w-0 px-4 py-4 pb-20 md:px-8 md:py-8 md:pb-8"
              style={{ background: "linear-gradient(160deg, #e6faf5 0%, #eef8f4 45%, #f3faf7 100%)" }}
            >
              {children}
            </main>
          </div>
        </GlobalProvider>
      </body>
    </html>
  );
}
