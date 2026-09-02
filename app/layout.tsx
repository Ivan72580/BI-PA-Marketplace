import "./globals.css";
import { Space_Grotesk, Inter } from "next/font/google";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
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
            <Sidebar />
            <div className="flex flex-1 flex-col min-w-0">
              <Header />
              <main className="flex-1 bg-background px-8 py-8">{children}</main>
            </div>
          </div>
        </GlobalProvider>
      </body>
    </html>
  );
}
